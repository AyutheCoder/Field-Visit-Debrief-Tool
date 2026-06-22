// Voice-only intake: transcribe a memo and let the LLM auto-fill the structured
// visit form. Nothing is persisted here – the client reviews and confirms the
// extracted fields before creating the visit.

import { AppError } from '../lib/http';
import {
    generateJson,
    isAiConfigured,
    transcribeAudioBuffer,
} from '../lib/openai';

// Keep in sync with the client capture form options.
export const PROGRAM_AREAS = [
    'Healthcare',
    'Education',
    'Water & Sanitation',
    'Nutrition',
    'Livelihoods',
    'Protection',
    'Agriculture',
];

const VISIT_TYPES = [
    'Clinic assessment',
    'School assessment',
    'Routine monitoring',
    'Follow-up',
    'Community meeting',
    'Distribution',
    'Other',
];

export interface ExtractedStakeholder {
    name: string;
    role: string;
    organization: string;
}

export interface ExtractedFields {
    locationName: string;
    programArea: string;
    visitType: string;
    notes: string;
    stakeholders: ExtractedStakeholder[];
}

export interface VoiceIntakeResult {
    transcript: string;
    fields: ExtractedFields;
}

const SYSTEM_PROMPT = `You are an assistant that turns a field officer's spoken voice memo into a structured visit log.
You receive a raw transcript. Extract the relevant details and respond with a SINGLE JSON object EXACTLY in this shape (no extra keys, no commentary):
{
  "location_name": "string",
  "program_area": "string",
  "visit_type": "string",
  "notes": "string",
  "stakeholders": [{ "name": "string", "role": "string", "organization": "string" }]
}

Rules:
- location_name: the place visited (village, ward, facility). "" if not stated.
- program_area: choose the closest match from this list, or "" if unclear: ${PROGRAM_AREAS.join(', ')}.
- visit_type: choose the closest match from this list, or "" if unclear: ${VISIT_TYPES.join(', ')}.
- notes: a clean, readable summary of everything observed (findings, blockers, sentiment) in the officer's voice. Keep it faithful to the memo.
- stakeholders: people mentioned as met. Use "" for any missing role/organization. Empty array if none.
- Do not invent facts. Only use what is in the transcript.`;

function asString(v: unknown): string {
    return typeof v === 'string' ? v.trim() : '';
}

function matchOption(value: string, options: string[]): string {
    const v = value.trim().toLowerCase();
    if (!v) return '';
    const exact = options.find((o) => o.toLowerCase() === v);
    if (exact) return exact;
    const partial = options.find(
        (o) => o.toLowerCase().includes(v) || v.includes(o.toLowerCase())
    );
    return partial ?? '';
}

function coerceFields(raw: unknown, transcript: string): ExtractedFields {
    const obj = (raw ?? {}) as Record<string, unknown>;
    const stakeholders: ExtractedStakeholder[] = Array.isArray(obj.stakeholders)
        ? obj.stakeholders
            .map((s) => {
                const o = (s ?? {}) as Record<string, unknown>;
                return {
                    name: asString(o.name),
                    role: asString(o.role),
                    organization: asString(o.organization),
                };
            })
            .filter((s) => s.name !== '')
        : [];

    return {
        locationName: asString(obj.location_name),
        programArea: matchOption(asString(obj.program_area), PROGRAM_AREAS),
        visitType: matchOption(asString(obj.visit_type), VISIT_TYPES),
        notes: asString(obj.notes) || transcript,
        stakeholders,
    };
}

/**
 * Transcribe an audio buffer and extract structured visit fields from it.
 * Requires an API key (both transcription and extraction are AI-powered).
 */
export async function extractVisitFromVoice(
    buffer: Buffer,
    mimetype: string,
    filename: string
): Promise<VoiceIntakeResult> {
    if (!isAiConfigured()) {
        throw new AppError(
            503,
            'Voice auto-fill needs GEMINI_API_KEY. You can still record the memo and fill the form manually.'
        );
    }

    const transcript = await transcribeAudioBuffer(buffer, mimetype, filename);
    if (!transcript.trim()) {
        throw new AppError(422, 'Could not hear anything in that recording - please try again.');
    }

    const raw = await generateJson(SYSTEM_PROMPT, `Voice memo transcript:\n\n${transcript}`);
    return { transcript, fields: coerceFields(raw, transcript) };
}