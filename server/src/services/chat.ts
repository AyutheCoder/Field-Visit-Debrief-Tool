// // RAG assistant: answer free-form questions over all visit debriefs.
// //
// // Retrieval reuses the search service (semantic when an API key is present,
// // keyword otherwise). With a key, retrieved debriefs are passed to the chat
// // model for a grounded answer. Without a key, a deterministic summary of the
// // retrieved visits is returned so the feature still demos.

import { generateText, isAiConfigured } from '../lib/openai';
import { search } from './search';
import { listVisitsWithRelations } from '../repositories/visits';
import { regionOf } from '../lib/region';
import type { VisitWithRelations } from '../types';

const MAX_CONTEXT_VISITS = 6;

const STOPWORDS = new Set([
    'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'is', 'are',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'top', 'show',
    'me', 'my', 'our', 'their', 'about', 'over', 'across', 'all', 'any', 'how', 'many',
    'visits', 'visit', 'report', 'reports', 'reported', 'with', 'by', 'from',
    'issues', 'issue', 'problems', 'problem', 'quarter', 'week', 'month', 'recent',
]);

export interface ChatSource {
    visitId: string;
    locationName: string;
    region: string;
    programArea: string;
    visitDate: string;
}

export interface ChatResponse {
    question: string;
    answer: string;
    mode: 'rag' | 'summary';
    note?: string;
    sources: ChatSource[];
}

function toSource(v: VisitWithRelations): ChatSource {
    return {
        visitId: v.id,
        locationName: v.locationName,
        region: regionOf(v.locationName),
        programArea: v.programArea,
        visitDate: v.visitDate,
    };
}

function visitContext(v: VisitWithRelations): string {
    const lines: string[] = [];
    lines.push(
        `Visit @ ${v.locationName} (${regionOf(v.locationName)}) - ${v.programArea} - ${new Date(
            v.visitDate
        ).toISOString().slice(0, 10)}`
    );
    if (v.debrief) {
        if (v.debrief.keyFindings.length) {
            lines.push(`Findings: ${v.debrief.keyFindings.join('; ')}`);
        }
        if (v.debrief.blockers.length) {
            lines.push(
                `Blockers: ${v.debrief.blockers.map((b) => `${b.issue} [${b.category}]`).join('; ')}`
            );
        }
        if (v.debrief.sentimentLabel) {
            lines.push(`Sentiment: ${v.debrief.sentimentLabel} (${v.debrief.sentimentRationale ?? ''})`);
        }
    } else if (v.rawNotesText) {
        lines.push(`Notes: ${v.rawNotesText.slice(0, 400)}`);
    }
    return lines.join('\n');
}

const SYSTEM_PROMPT = `You are a field-operations analyst assistant. Answer the user's question using ONLY the provided field-visit debriefs.
- Be concise and decision-oriented.
- Reference specific locations, regions, or programs when relevant.
- Aggregate across visits when the question asks for "top" issues or trends.
- If the context does not contain enough information, say so plainly. Do not invent facts.`;

function summarize(question: string, visits: VisitWithRelations[]): string {
    if (visits.length === 0) {
        return "I couldn't find any visits matching that question. Try rephrasing or broadening it.";
    }
    const blockerCounts = new Map<string, number>();
    const regions = new Set<string>();
    const programs = new Set<string>();
    for (const v of visits) {
        regions.add(regionOf(v.locationName));
        programs.add(v.programArea);
        for (const b of v.debrief?.blockers ?? []) {
            blockerCounts.set(b.issue, (blockerCounts.get(b.issue) ?? 0) + 1);
        }
    }

    const topBlockers = [...blockerCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([issue, n]) => `- ${issue}${n > 1 ? ` (${n} visits)` : ''}`);

    const parts: string[] = [
        `Based on ${visits.length} relevant visit${visits.length === 1 ? '' : 's'} across ${[...regions].join(', ')} (${[...programs].join(', ')}):`,
    ];
    if (topBlockers.length) {
        parts.push('', 'Most common issues:', ...topBlockers);
    } else {
        parts.push('', 'No specific blockers were recorded in the matching visits.');
    }
    return parts.join('\n');
}

/** Searchable text blob for a visit, lower-cased for lexical scoring. */
function searchableText(v: VisitWithRelations): string {
    const parts: string[] = [v.locationName, regionOf(v.locationName), v.programArea, v.visitType ?? ''];
    if (v.rawNotesText) parts.push(v.rawNotesText);
    if (v.debrief) {
        parts.push(...v.debrief.keyFindings);
        parts.push(...v.debrief.blockers.map((b) => `${b.issue} ${b.category}`));
        if (v.debrief.sentimentLabel) parts.push(v.debrief.sentimentLabel);
    }
    return parts.join(' ').toLowerCase();
}

/** Lenient keyword retrieval: rank visits by how many query terms they contain. */
function lexicalRetrieve(
    question: string,
    visits: VisitWithRelations[],
    limit: number
): VisitWithRelations[] {
    const terms = question
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 2 && !STOPWORDS.has(t));

    if (terms.length === 0) {
        // No usable terms - fall back to the most recent visits.
        return [...visits]
            .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())
            .slice(0, limit);
    }

    return visits
        .map((v) => {
            const text = searchableText(v);
            const score = terms.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0);
            return { v, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => x.v);
}

export async function answerQuestion(question: string): Promise<ChatResponse> {
    const trimmed = question.trim();
    if (!trimmed) {
        return { question: trimmed, answer: 'Please ask a question.', mode: 'summary', sources: [] };
    }

    const aiOn = isAiConfigured();

    // Retrieve relevant visits: semantic when possible, lexical otherwise.
    let visits: VisitWithRelations[] = [];
    if (aiOn) {
        try {
            const sr = await search(trimmed, 'semantic', {});
            visits = sr.results.slice(0, MAX_CONTEXT_VISITS).map((r) => r.visit);
        } catch {
            /* fall through to lexical */
        }
    }

    if (visits.length === 0) {
        visits = lexicalRetrieve(trimmed, await listVisitsWithRelations(), MAX_CONTEXT_VISITS);
    }

    const sources = visits.map(toSource);

    if (!aiOn) {
        return {
            question: trimmed,
            answer: summarize(trimmed, visits),
            mode: 'summary',
            note: 'Add GEMINI_API_KEY for conversational answers - showing a generated summary of matching visits.',
            sources,
        };
    }

    if (visits.length === 0) {
        return {
            question: trimmed,
            answer: "I couldn't find any visits relevant to that question.",
            mode: 'rag',
            sources: [],
        };
    }

    const context = visits.map((v, i) => `[${i + 1}] ${visitContext(v)}`).join('\n\n');
    const userPrompt = `Field-visit debriefs:\n\n${context}\n\nQuestion: ${trimmed}`;
    const answer = await generateText(SYSTEM_PROMPT, userPrompt);

    return { question: trimmed, answer, mode: 'rag', sources };
}