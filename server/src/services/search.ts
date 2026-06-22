// // Full-text + semantic search across visits.
// //
// // Keyword mode scans notes, voice-memo transcripts, and debrief content with a
// // simple AND-of-terms match and returns a highlighted snippet. Semantic mode
// // embeds each visit (cached in the Embedding table) and ranks visits by cosine
// // similarity to the query embedding. When no API key is configured, semantic
// // requests gracefully fall back to keyword search.

import { createEmbeddings, isAiConfigured } from '../lib/openai';
import { listVisitsWithRelations } from '../repositories/visits';
import {
    listEmbeddings,
    upsertEmbedding,
} from '../repositories/embeddings';
import { regionOf } from '../lib/region';
import type { VisitWithRelations } from '../types';

export type SearchMode = 'keyword' | 'semantic';

export interface SearchFilters {
    region?: string;
    program?: string;
}

export interface SearchResultItem {
    visit: VisitWithRelations;
    score: number | null;
    snippet: string;
    matchedIn: string[];
}

export interface SearchResponse {
    query: string;
    requestedMode: SearchMode;
    mode: SearchMode;
    note?: string;
    results: SearchResultItem[];
}

/** Build the searchable text blob for a visit. */
function visitText(v: VisitWithRelations): string {
    const parts: string[] = [v.locationName, v.programArea, v.visitType ?? ''];
    if (v.rawNotesText) parts.push(v.rawNotesText);
    for (const m of v.media) if (m.transcript) parts.push(m.transcript);
    if (v.debrief) {
        parts.push(...v.debrief.keyFindings);
        parts.push(...v.debrief.blockers.map((b) => `${b.issue} (${b.category})`));
        if (v.debrief.sentimentRationale) parts.push(v.debrief.sentimentRationale);
    }
    for (const s of v.stakeholders) {
        parts.push([s.name, s.role, s.organization].filter(Boolean).join(' '));
    }
    return parts.filter(Boolean).join('\n');
}

function passesFilters(v: VisitWithRelations, f: SearchFilters): boolean {
    if (f.program && v.programArea !== f.program) return false;
    if (f.region && regionOf(v.locationName) !== f.region) return false;
    return true;
}

/** Extract a snippet around the first matched term. */
function makeSnippet(text: string, terms: string[], max = 180): string {
    const lower = text.toLowerCase();
    let pos = -1;
    for (const t of terms) {
        const i = lower.indexOf(t);
        if (i >= 0 && (pos === -1 || i < pos)) pos = i;
    }
    if (pos === -1) return text.slice(0, max).trim();
    const start = Math.max(0, pos - 60);
    const end = Math.min(text.length, pos + max - 60);
    return `${start > 0 ? '...' : ''}${text.slice(start, end).trim()}${end < text.length ? '...' : ''}`;
}

function whereMatched(v: VisitWithRelations, terms: string[]): string[] {
    const has = (s?: string | null) => s && terms.some((t) => s.toLowerCase().includes(t));
    const matched: string[] = [];
    if (has(v.rawNotesText)) matched.push('notes');
    if (v.media.some((m) => has(m.transcript))) matched.push('transcript');
    if (v.debrief?.keyFindings.some((k) => has(k))) matched.push('findings');
    if (v.debrief?.blockers.some((b) => has(b.issue))) matched.push('blockers');
    return matched;
}

function keywordSearch(
    visits: VisitWithRelations[],
    query: string,
    filters: SearchFilters
): SearchResultItem[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const results: SearchResultItem[] = [];
    for (const v of visits) {
        if (!passesFilters(v, filters)) continue;
        const text = visitText(v);
        const lower = text.toLowerCase();
        // AND match: every term must appear somewhere in the visit text.
        if (!terms.every((t) => lower.includes(t))) continue;
        results.push({
            visit: v,
            score: null,
            snippet: makeSnippet(v.rawNotesText || text, terms),
            matchedIn: whereMatched(v, terms),
        });
    }
    return results;
}

function cosine(a: number[], b: number[]): number {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Ensure every visit has a cached embedding; (re)builds missing ones. */
async function ensureVisitEmbeddings(
    visits: VisitWithRelations[],
    refresh: boolean
): Promise<Map<string, number[]>> {
    const cached = new Map(listEmbeddings().map((e) => [e.visitId, e.vector] as const));
    const map = new Map<string, number[]>();

    const toEmbed: VisitWithRelations[] = [];
    for (const v of visits) {
        const existing = cached.get(v.id);
        if (existing && existing.length > 0 && !refresh) {
            map.set(v.id, existing);
        } else {
            toEmbed.push(v);
        }
    }

    if (toEmbed.length > 0) {
        const vectors = await createEmbeddings(toEmbed.map((v) => visitText(v)));
        toEmbed.forEach((v, i) => {
            const vec = vectors[i];
            if (Array.isArray(vec)) {
                upsertEmbedding(v.id, vec);
                map.set(v.id, vec);
            }
        });
    }

    return map;
}

async function semanticSearch(
    visits: VisitWithRelations[],
    query: string,
    filters: SearchFilters,
    refresh: boolean
): Promise<SearchResultItem[]> {
    const embeddings = await ensureVisitEmbeddings(visits, refresh);
    const [queryVec] = await createEmbeddings([query]);
    if (!Array.isArray(queryVec)) return [];

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    return visits
        .filter((v) => passesFilters(v, filters))
        .map((v) => {
            const vec = embeddings.get(v.id);
            const score = vec ? cosine(queryVec, vec) : 0;
            return {
                visit: v,
                score: Number(score.toFixed(3)),
                snippet: makeSnippet(v.rawNotesText || visitText(v), terms),
                matchedIn: whereMatched(v, terms),
            };
        })
        .filter((r) => (r.score ?? 0) > 0.15)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export async function search(
    query: string,
    requestedMode: SearchMode,
    filters: SearchFilters,
    refresh = false
): Promise<SearchResponse> {
    const trimmed = query.trim();
    const visits = listVisitsWithRelations();

    if (!trimmed) {
        return { query: trimmed, requestedMode, mode: requestedMode, results: [] };
    }

    if (requestedMode === 'semantic') {
        if (!isAiConfigured()) {
            return {
                query: trimmed,
                requestedMode,
                mode: 'keyword',
                note: 'Semantic search needs GEMINI_API_KEY – showing keyword matches instead.',
                results: keywordSearch(visits, trimmed, filters),
            };
        }
        try {
            const results = await semanticSearch(visits, trimmed, filters, refresh);
            return { query: trimmed, requestedMode, mode: 'semantic', results };
        } catch {
            return {
                query: trimmed,
                requestedMode,
                mode: 'keyword',
                note: 'Semantic search failed – showing keyword matches instead.',
                results: keywordSearch(visits, trimmed, filters),
            };
        }
    }

    return {
        query: trimmed,
        requestedMode,
        mode: 'keyword',
        results: keywordSearch(visits, trimmed, filters),
    };
}