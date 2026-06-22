// // Pattern detection across visits.
// //
// // Each blocker on a visit's debrief is treated as an "issue unit" tied to a
// // region and program. We group semantically similar issues across visits using
// // OpenAI embeddings + greedy single-link clustering (cosine similarity). When
// // no API key is configured we fall back to lexical grouping by normalised text,
// // so the endpoint always returns useful results.

import { createEmbeddings, isAiConfigured } from '../lib/openai';
import { listVisitsWithRelations } from '../repositories/visits';
import { replaceAllPatterns } from '../repositories/patterns';
import { regionOf } from '../lib/region';
import type { BlockerCategory } from '../types';

interface IssueUnit {
    visitId: string;
    region: string;
    program: string;
    category: BlockerCategory;
    text: string;
}

export interface IssuePattern {
    id: string;
    label: string;
    category: BlockerCategory;
    /** Distinct visits that contributed to this pattern. */
    count: number;
    /** Total issue mentions across all contributing visits. */
    occurrences: number;
    /** Distinct phrasings merged into this pattern. */
    variants: string[];
    regions: string[];
    programs: string[];
    visitIds: string[];
}

export interface PatternsResult {
    patterns: IssuePattern[];
    method: 'semantic' | 'lexical';
    generatedAt: string;
    visitsAnalyzed: number;
}

// // Cosine similarity threshold for merging two issue phrasings. Tuned for
// // text-embedding-3-small: related issues typically score >0.6, unrelated <0.4.
const SIMILARITY_THRESHOLD = 0.6;

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

/** Greedy single-link clustering over item vectors; returns groups of indices. */
function clusterByCosine(vectors: number[][], threshold: number): number[][] {
    const clusters: number[][] = [];
    for (let i = 0; i < vectors.length; i++) {
        let best = -1;
        let bestSim = threshold;
        for (let c = 0; c < clusters.length; c++) {
            for (const j of clusters[c]) {
                const sim = cosine(vectors[i], vectors[j]);
                if (sim >= bestSim) {
                    bestSim = sim;
                    best = c;
                }
            }
        }
        if (best >= 0) clusters[best].push(i);
        else clusters.push([i]);
    }
    return clusters;
}

function mostCommon<T>(values: T[]): T {
    const freq = new Map<T, number>();
    for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
    return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function buildPattern(units: IssueUnit[], idxs: number[]): IssuePattern {
    const members = idxs.map((i) => units[i]);
    const texts = members.map((m) => m.text);

    // Label: most frequent phrasing, tie-broken by the shortest text.
    const freq = new Map<string, number>();
    for (const t of texts) freq.set(t, (freq.get(t) ?? 0) + 1);
    const label = [...freq.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].length - b[0].length
    )[0][0];

    const visitIds = [...new Set(members.map((m) => m.visitId))];
    const regions = [...new Set(members.map((m) => m.region))].sort();
    const programs = [...new Set(members.map((m) => m.program))].sort();
    const variants = [...new Set(texts)].sort();

    return {
        id: '',
        label,
        category: mostCommon(members.map((m) => m.category)),
        count: visitIds.length,
        occurrences: members.length,
        variants,
        regions,
        programs,
        visitIds,
    };
}

function finalize(
    units: IssueUnit[],
    clusters: number[][],
    method: 'semantic' | 'lexical',
    visitsAnalyzed: number
): PatternsResult {
    const patterns = clusters
        .map((idxs) => buildPattern(units, idxs))
        .sort(
            (a, b) =>
                b.count - a.count ||
                b.occurrences - a.occurrences ||
                a.label.localeCompare(b.label)
        )
        .map((p, i) => ({ ...p, id: `p${i + 1}` }));

    replaceAllPatterns(
        patterns.map((p) => ({
            type: 'blocker',
            label: p.label,
            regions: p.regions,
            programs: p.programs,
            count: p.count,
            visitIds: p.visitIds,
        }))
    );

    return {
        patterns,
        method,
        generatedAt: new Date().toISOString(),
        visitsAnalyzed,
    };
}

/** Group issues lexically by normalised text (fallback when AI is off). */
function clusterLexically(units: IssueUnit[]): number[][] {
    const byKey = new Map<string, number[]>();
    units.forEach((u, i) => {
        const key = u.text.trim().toLowerCase();
        const group = byKey.get(key);
        if (group) group.push(i);
        else byKey.set(key, [i]);
    });
    return [...byKey.values()];
}

export async function computePatterns(): Promise<PatternsResult> {
    const visits = listVisitsWithRelations();

    const units: IssueUnit[] = [];
    for (const v of visits) {
        for (const b of v.debrief?.blockers ?? []) {
            const text = b.issue.trim();
            if (!text) continue;
            units.push({
                visitId: v.id,
                region: regionOf(v.locationName),
                program: v.programArea,
                category: b.category,
                text,
            });
        }
    }

    if (units.length === 0) {
        return finalize(units, [], 'lexical', visits.length);
    }

    // Try semantic clustering when an API key is configured.
    if (isAiConfigured()) {
        const uniqueTexts = [...new Set(units.map((u) => u.text))];
        try {
            const vectors = await createEmbeddings(uniqueTexts);
            const ok =
                vectors.length === uniqueTexts.length && vectors.every((v) => Array.isArray(v));
            if (ok) {
                const textClusters = clusterByCosine(vectors, SIMILARITY_THRESHOLD);
                // Map each unique text to its cluster id, then assign every issue unit.
                const textToCluster = new Map<string, number>();
                textClusters.forEach((grp, ci) => {
                    grp.forEach((ti) => textToCluster.set(uniqueTexts[ti], ci));
                });

                const groups = new Map<number, number[]>();
                units.forEach((u, ui) => {
                    const ci = textToCluster.get(u.text)!;
                    const g = groups.get(ci);
                    if (g) g.push(ui);
                    else groups.set(ci, [ui]);
                });

                return finalize(units, [...groups.values()], 'semantic', visits.length);
            }
        } catch {
            // Fall through to lexical grouping on any embedding failure.
        }
    }

    return finalize(units, clusterLexically(units), 'lexical', visits.length);
}