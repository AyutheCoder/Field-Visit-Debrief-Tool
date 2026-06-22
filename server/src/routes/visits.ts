import { Router } from 'express';
import {
    asyncHandler,
    AppError,
    requireBody,
    requireString,
    optionalString,
    optionalNumber,
    optionalArray,
} from '../lib/http';
import { upload, mediaTypeFromMime } from '../lib/upload';
import {
    listVisits,
    getVisitWithRelations,
    createVisit,
    updateVisit,
    deleteVisit,
    type VisitInput,
} from '../repositories/visits';
import {
    listStakeholders,
    createStakeholder,
    type StakeholderInput,
} from '../repositories/stakeholders';
import { listMedia, createMedia } from '../repositories/media';
import { getDebriefWithActions, upsertDebrief } from '../repositories/debriefs';
import { transcribeVisitAudio, generateVisitDebrief } from '../services/ai';
import type { Blocker, FollowUp, SentimentLabel } from '../types';

export const visitsRouter = Router();

function parseStakeholderInputs(raw: unknown[] | undefined): StakeholderInput[] | undefined {
    if (!raw) return undefined;
    return raw.map((item, i) => {
        if (!item || typeof item !== 'object') {
            throw new AppError(400, `stakeholders[${i}] must be an object`);
        }
        const s = item as Record<string, unknown>;
        if (typeof s.name !== 'string' || s.name.trim() === '') {
            throw new AppError(400, `stakeholders[${i}].name is required`);
        }
        return {
            name: s.name.trim(),
            role: typeof s.role === 'string' ? s.role.trim() : undefined,
            organization: typeof s.organization === 'string' ? s.organization.trim() : undefined,
        };
    });
}

// // List visits (with optional filters)
visitsRouter.get(
    '/',
    asyncHandler(async (req, res) => {
        const { programArea, location, sentiment, from, to } = req.query;
        const visits = await listVisits({
            programArea: typeof programArea === 'string' ? programArea : undefined,
            location: typeof location === 'string' ? location : undefined,
            sentiment: typeof sentiment === 'string' ? sentiment : undefined,
            from: typeof from === 'string' ? from : undefined,
            to: typeof to === 'string' ? to : undefined,
        });
        res.json(visits);
    })
);

// // Create a visit
visitsRouter.post(
    '/',
    asyncHandler(async (req, res) => {
        const body = requireBody(req);
        const input: VisitInput = {
            locationName: requireString(body, 'locationName', 300),
            programArea: requireString(body, 'programArea', 200),
            userId: optionalString(body, 'userId'),
            lat: optionalNumber(body, 'lat'),
            lng: optionalNumber(body, 'lng'),
            visitDate: optionalString(body, 'visitDate'),
            visitType: optionalString(body, 'visitType', 200),
            rawNotesText: optionalString(body, 'rawNotesText', 20000),
            status: optionalString(body, 'status', 50),
            stakeholders: parseStakeholderInputs(optionalArray(body, 'stakeholders')),
        };
        const visit = await createVisit(input);
        res.status(201).json(visit);
    })
);

// // Get a single visit with relations
visitsRouter.get(
    '/:id',
    asyncHandler(async (req, res) => {
        const visit = await getVisitWithRelations(req.params.id);
        if (!visit) throw new AppError(404, 'Visit not found');
        res.json(visit);
    })
);

// // Update a visit
visitsRouter.patch(
    '/:id',
    asyncHandler(async (req, res) => {
        const body = requireBody(req);
        const updated = await updateVisit(req.params.id, {
            locationName: optionalString(body, 'locationName', 300),
            programArea: optionalString(body, 'programArea', 200),
            userId: optionalString(body, 'userId'),
            lat: optionalNumber(body, 'lat'),
            lng: optionalNumber(body, 'lng'),
            visitDate: optionalString(body, 'visitDate'),
            visitType: optionalString(body, 'visitType', 200),
            rawNotesText: optionalString(body, 'rawNotesText', 20000),
            status: optionalString(body, 'status', 50),
        });
        if (!updated) throw new AppError(404, 'Visit not found');
        res.json(updated);
    })
);

// // Delete a visit
visitsRouter.delete(
    '/:id',
    asyncHandler(async (req, res) => {
        const ok = await deleteVisit(req.params.id);
        if (!ok) throw new AppError(404, 'Visit not found');
        res.status(204).end();
    })
);

// // --- Nested: stakeholders ---
visitsRouter.get(
    '/:id/stakeholders',
    asyncHandler(async (req, res) => {
        if (!(await getVisitWithRelations(req.params.id))) throw new AppError(404, 'Visit not found');
        res.json(await listStakeholders(req.params.id));
    })
);

visitsRouter.post(
    '/:id/stakeholders',
    asyncHandler(async (req, res) => {
        if (!(await getVisitWithRelations(req.params.id))) throw new AppError(404, 'Visit not found');
        const body = requireBody(req);
        const created = await createStakeholder(req.params.id, {
            name: requireString(body, 'name', 200),
            role: optionalString(body, 'role', 200),
            organization: optionalString(body, 'organization', 200),
        });
        res.status(201).json(created);
    })
);

// // --- Nested: media ---
visitsRouter.get(
    '/:id/media',
    asyncHandler(async (req, res) => {
        if (!(await getVisitWithRelations(req.params.id))) throw new AppError(404, 'Visit not found');
        res.json(await listMedia(req.params.id));
    })
);

// // File upload -> creates a MediaAsset and returns it (with public URL)
visitsRouter.post(
    '/:id/upload',
    upload.single('file'),
    asyncHandler(async (req, res) => {
        if (!(await getVisitWithRelations(req.params.id))) throw new AppError(404, 'Visit not found');
        if (!req.file) throw new AppError(400, 'No file uploaded (use multipart field "file")');
        const url = req.file.path.startsWith('http') ? req.file.path : `/uploads/${req.file.filename}`;
        const caption = typeof req.body?.caption === 'string' ? req.body.caption : undefined;
        const media = await createMedia(req.params.id, {
            type: mediaTypeFromMime(req.file.mimetype),
            url,
            caption,
        });
        res.status(201).json(media);
    })
);

// // --- Nested: debrief ---
visitsRouter.get(
    '/:id/debrief',
    asyncHandler(async (req, res) => {
        if (!(await getVisitWithRelations(req.params.id))) throw new AppError(404, 'Visit not found');
        const debrief = await getDebriefWithActions(req.params.id);
        if (!debrief) throw new AppError(404, 'Debrief not found for this visit');
        res.json(debrief);
    })
);

// // Create/replace the debrief for a visit manually (used to save human edits).
visitsRouter.put(
    '/:id/debrief',
    asyncHandler(async (req, res) => {
        if (!(await getVisitWithRelations(req.params.id))) throw new AppError(404, 'Visit not found');
        const body = requireBody(req);
        const debrief = await upsertDebrief(req.params.id, {
            keyFindings: optionalArray(body, 'keyFindings') as string[] | undefined,
            blockers: optionalArray(body, 'blockers') as Blocker[] | undefined,
            followUps: optionalArray(body, 'followUps') as FollowUp[] | undefined,
            sentimentLabel: optionalString(body, 'sentimentLabel', 20) as SentimentLabel | undefined,
            sentimentScore: optionalNumber(body, 'sentimentScore'),
            sentimentRationale: optionalString(body, 'sentimentRationale', 2000),
            aiModel: optionalString(body, 'aiModel', 100),
            editedByHuman: typeof body.editedByHuman === 'boolean' ? body.editedByHuman : undefined,
        });
        res.status(200).json((await getDebriefWithActions(req.params.id)) ?? debrief);
    })
);

// // --- AI: transcription ---
// // Transcribe a visit's audio clips with Whisper (saves transcripts to each MediaAsset).
visitsRouter.post(
    '/:id/transcribe',
    asyncHandler(async (req, res) => {
        const force = req.query.force === 'true' || req.body?.force === 'true';
        const results = await transcribeVisitAudio(req.params.id, force);
        res.json({ visitId: req.params.id, transcriptions: results });
    })
);

// // --- AI: debrief generation ---
// // Generate a structured debrief from the visit's fields, notes, and transcripts.
visitsRouter.post(
    '/:id/debrief',
    asyncHandler(async (req, res) => {
        const debrief = await generateVisitDebrief(req.params.id);
        res.status(201).json(debrief);
    })
);