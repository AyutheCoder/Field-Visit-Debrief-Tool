// AI orchestration: voice transcription and structured debrief generation.

import { join, basename } from 'node:path';
import { UPLOADS_DIR } from '../lib/upload';
import { AppError } from '../lib/http';
import { generateJson, transcribeAudioFile, chatModelName } from '../lib/openai';
import { getVisitWithRelations } from '../repositories/visits';
import { listMedia, updateMedia } from '../repositories/media';
import { upsertDebrief, getDebriefWithActions } from '../repositories/debriefs';
import { createAction, deleteActionsByDebrief } from '../repositories/actionItems';
import type {
    Blocker,
    BlockerCategory,
    FollowUp,
    Priority,
    SentimentLabel,
} from '../types';

const BLOCKER_CATEGORIES: BlockerCategory[] = [
    'infrastructure',
    'supply',
    'staffing',
    'community',
    'funding',
    'other',
];

const SENTIMENT_LABELS: SentimentLabel[] = ['positive', 'neutral', 'negative'];
const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

function resolveMediaPath(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return join(UPLOADS_DIR, basename(url));
}

// -------------------------------------------------------------------------
// Transcription
// -------------------------------------------------------------------------

export interface TranscriptionResult {
    mediaId: string;
    url: string;
    transcript: string;
}

/**
 * Transcribe all audio assets on a visit. By default only untranscribed clips
 * are processed; pass `force: true` to re-transcribe everything.
 */
export async function transcribeVisitAudio(
    visitId: string,
    force = false
): Promise<TranscriptionResult[]> {
    const visit = await getVisitWithRelations(visitId);
    if (!visit) throw new AppError(404, 'Visit not found');

    const audio = visit.media.filter((m) => m.type === 'audio');
    if (audio.length === 0) {
        throw new AppError(400, 'This visit has no audio clips to transcribe');
    }

    const results: TranscriptionResult[] = [];
    for (const asset of audio) {
        if (asset.transcript && !force) {
            results.push({ mediaId: asset.id, url: asset.url, transcript: asset.transcript });
            continue;
        }

        const mimetype = `audio/${basename(asset.url).split('.').pop() || 'webm'}`;
        const transcript = await transcribeAudioFile(resolveMediaPath(asset.url), mimetype);
        await updateMedia(asset.id, { transcript });
        results.push({ mediaId: asset.id, url: asset.url, transcript });
    }
    return results;
}

// -------------------------------------------------------------------------
// Debrief generation
// -------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a field-operations analyst for a humanitarian/development organisation.
You read a field officer's visit report (structured fields, free-form notes, and voice-memo transcripts) and produce a concise, decision-ready debrief.

Respond with a SINGLE JSON object that EXACTLY matches this schema (no extra keys, no commentary):
{
  "key_findings": ["string", ...],
  "blockers": [{ "issue": "string", "category": "infrastructure|supply|staffing|community|funding|other" }, ...],
  "sentiment": { "label": "positive|neutral|negative", "score": number, "rationale": "string" },
  "follow_ups": [{ "action": "string", "priority": "high|medium|low", "owner_suggestion": "string" }]
}

Rules:
- key_findings: 3-6 short, specific bullet points grounded ONLY in the provided content.
- blockers: concrete obstacles, each mapped to the closest category. Use "other" if unsure. Empty array if none.
- sentiment.label: overall community/stakeholder sentiment. score is a number from -1 (very negative) to 1 (very positive). rationale: one sentence.
- follow_ups: actionable next steps with a realistic priority. owner_suggestion is a role/person if implied, else "".
- Do not invent facts. Keep everything grounded in the input.`;

import type { VisitWithRelations } from '../types';

function buildContext(visit: VisitWithRelations | null): string {
    if (!visit) return '';
    const lines: string[] = [];
    lines.push(`Location: ${visit.locationName}`);
    if (visit.lat !== null && visit.lng !== null) {
        lines.push(`Coordinates: ${visit.lat}, ${visit.lng}`);
    }
    lines.push(`Date: ${visit.visitDate}`);
    lines.push(`Program area: ${visit.programArea}`);
    if (visit.visitType) lines.push(`Visit type: ${visit.visitType}`);

    if (visit.stakeholders.length) {
        lines.push('');
        lines.push('Stakeholders met:');
        for (const s of visit.stakeholders) {
            const parts = [s.name, s.role, s.organization].filter(Boolean);
            lines.push(`- ${parts.join(' - ')}`);
        }
    }

    if (visit.rawNotesText?.trim()) {
        lines.push('');
        lines.push('Field notes:');
        lines.push(visit.rawNotesText.trim());
    }

    const transcripts = visit.media
        .filter((m) => m.type === 'audio' && m.transcript?.trim())
        .map((m, i) => `Voice memo ${i + 1}: ${m.transcript!.trim()}`);
    if (transcripts.length) {
        lines.push('');
        lines.push('Voice memo transcripts:');
        lines.push(...transcripts);
    }

    return lines.join('\n');
}

// --- Coercion: map untrusted LLM JSON onto our strict types ---

function asString(v: unknown): string {
    return typeof v === 'string' ? v.trim() : '';
}

function coerceCategory(v: unknown): BlockerCategory {
    return BLOCKER_CATEGORIES.includes(v as BlockerCategory) ? (v as BlockerCategory) : 'other';
}

function coercePriority(v: unknown): Priority {
    return PRIORITIES.includes(v as Priority) ? (v as Priority) : 'medium';
}

function coerceLabel(v: unknown): SentimentLabel {
    return SENTIMENT_LABELS.includes(v as SentimentLabel) ? (v as SentimentLabel) : 'neutral';
}

function clampScore(v: unknown): number {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(-1, Math.min(1, n));
}

interface ParsedDebrief {
    keyFindings: string[];
    blockers: Blocker[];
    sentimentLabel: SentimentLabel;
    sentimentScore: number;
    sentimentRationale: string;
    followUps: FollowUp[];
}

function coerceDebrief(raw: unknown): ParsedDebrief {
    const obj = (raw ?? {}) as Record<string, unknown>;

    const keyFindings = Array.isArray(obj.key_findings)
        ? obj.key_findings.map(asString).filter(Boolean)
        : [];

    const blockers: Blocker[] = Array.isArray(obj.blockers)
        ? obj.blockers
            .map((b) => {
                const o = (b ?? {}) as Record<string, unknown>;
                return { issue: asString(o.issue), category: coerceCategory(o.category) };
            })
            .filter((b) => b.issue !== '')
        : [];

    const s = (obj.sentiment ?? {}) as Record<string, unknown>;

    const followUps: FollowUp[] = Array.isArray(obj.follow_ups)
        ? obj.follow_ups
            .map((f) => {
                const o = (f ?? {}) as Record<string, unknown>;
                const owner = asString(o.owner_suggestion);
                return {
                    action: asString(o.action),
                    priority: coercePriority(o.priority),
                    ...(owner ? { owner_suggestion: owner } : {}),
                };
            })
            .filter((f) => f.action !== '')
        : [];

    return {
        keyFindings,
        blockers,
        sentimentLabel: coerceLabel(s.label),
        sentimentScore: clampScore(s.score),
        sentimentRationale: asString(s.rationale),
        followUps,
    };
}

/**
 * Generate (or regenerate) a visit's AI debrief. Auto-transcribes any
 * untranscribed audio first, then calls the LLM, saves the Debrief, and
 * recreates ActionItems from the follow-ups.
 */
export async function generateVisitDebrief(visitId: string) {
    let visit = await getVisitWithRelations(visitId);
    if (!visit) throw new AppError(404, 'Visit not found');

    // Make sure transcripts are available before summarising.
    const hasUntranscribed = visit.media.some(
        (m) => m.type === 'audio' && !m.transcript?.trim()
    );
    if (hasUntranscribed) {
        await transcribeVisitAudio(visitId);
        visit = (await getVisitWithRelations(visitId))!;
    }

    const hasContent =
        (visit.rawNotesText?.trim().length ?? 0) > 0 ||
        visit.media.some((m) => m.type === 'audio' && m.transcript?.trim());
    if (!hasContent) {
        throw new AppError(
            400,
            'Nothing to summarise yet - add field notes or a voice memo before generating a debrief.'
        );
    }

    const context = buildContext(visit);
    const raw = await generateJson(SYSTEM_PROMPT, `Visit report:\n\n${context}`);
    const parsed = coerceDebrief(raw);

    const debrief = await upsertDebrief(visitId, {
        keyFindings: parsed.keyFindings,
        blockers: parsed.blockers,
        sentimentLabel: parsed.sentimentLabel,
        sentimentScore: parsed.sentimentScore,
        sentimentRationale: parsed.sentimentRationale,
        followUps: parsed.followUps,
        aiModel: chatModelName(),
        editedByHuman: false,
    });

    // Replace any previously generated action items with the new follow-ups.
    await deleteActionsByDebrief(debrief.id);
    for (const f of parsed.followUps) {
        await createAction(debrief.id, {
            description: f.action,
            owner: f.owner_suggestion || undefined,
            priority: f.priority,
            status: 'open',
        });
    }

    return await getDebriefWithActions(visitId);
}