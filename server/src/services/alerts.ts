// Anomaly / early-warning alerts.
//
// Detects when a blocker category spikes in a region within the recent window
// (last 7 days) compared to the preceding baseline period. Surfaces things like
// "3 visits this week reported supply blockers in Northern District".

import { listVisitsWithRelations } from '../repositories/visits';
import { regionOf } from '../lib/region';
import type { BlockerCategory } from '../types';

const RECENT_WINDOW_DAYS = 10;
const BASELINE_WINDOW_DAYS = 21; // the 21 days before the recent window
const DAY_MS = 24 * 60 * 60 * 1000;

export type AlertSeverity = 'high' | 'medium';

export interface AlertItem {
    id: string;
    region: string;
    category: BlockerCategory;
    label: string;
    recentCount: number;
    baselineCount: number;
    baselinePerWeek: number;
    severity: AlertSeverity;
    visitIds: string[];
    sampleIssues: string[];
    message: string;
}

export interface AlertsResponse {
    generatedAt: string;
    recentWindowDays: number;
    baselineWindowDays: number;
    alerts: AlertItem[];
}

interface Bucket {
    region: string;
    category: BlockerCategory;
    recent: Set<string>;
    baseline: Set<string>;
    recentIssues: string[];
}

function mostCommon(values: string[]): string {
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best = values[0] ?? '';
    let bestN = 0;
    for (const [v, n] of counts) {
        if (n > bestN) {
            best = v;
            bestN = n;
        }
    }
    return best;
}

export function computeAlerts(now: Date = new Date()): AlertsResponse {
    const nowMs = now.getTime();
    const recentStart = nowMs - RECENT_WINDOW_DAYS * DAY_MS;
    const baselineStart = recentStart - BASELINE_WINDOW_DAYS * DAY_MS;

    const visits = listVisitsWithRelations();
    const buckets = new Map<string, Bucket>();

    for (const v of visits) {
        if (!v.debrief || v.debrief.blockers.length === 0) continue;
        const t = new Date(v.visitDate).getTime();
        if (!Number.isFinite(t)) continue;

        const isRecent = t >= recentStart && t <= nowMs;
        const isBaseline = t >= baselineStart && t < recentStart;
        if (!isRecent && !isBaseline) continue;

        const region = regionOf(v.locationName);
        // Each category counts a visit at most once per bucket.
        const seen = new Set<BlockerCategory>();
        for (const b of v.debrief.blockers) {
            if (seen.has(b.category)) continue;
            seen.add(b.category);

            const key = `${region}|${b.category}`;
            let bucket = buckets.get(key);
            if (!bucket) {
                bucket = {
                    region,
                    category: b.category,
                    recent: new Set(),
                    baseline: new Set(),
                    recentIssues: [],
                };
                buckets.set(key, bucket);
            }

            if (isRecent) {
                bucket.recent.add(v.id);
                if (b.issue) bucket.recentIssues.push(b.issue);
            } else {
                bucket.baseline.add(v.id);
            }
        }
    }

    const alerts: AlertItem[] = [];
    const baselineWeeks = BASELINE_WINDOW_DAYS / 7;

    for (const [key, bucket] of buckets) {
        const recentCount = bucket.recent.size;
        const baselineCount = bucket.baseline.size;
        const baselinePerWeek = baselineCount / baselineWeeks;

        // A spike: at least two recent reports AND above the typical weekly rate.
        if (recentCount < 2 || recentCount <= baselinePerWeek) continue;

        const severity: AlertSeverity =
            recentCount >= 3 || baselineCount === 0 ? 'high' : 'medium';

        const sampleIssues = Array.from(new Set(bucket.recentIssues)).slice(0, 3);
        const label = mostCommon(bucket.recentIssues) || bucket.category;

        const trend =
            baselineCount === 0
                ? `none reported in the prior ${BASELINE_WINDOW_DAYS} days`
                : `up from ~${baselinePerWeek.toFixed(1)}/week`;

        const message = `${recentCount} visits in ${bucket.region} reported ${bucket.category} blockers in the last ${RECENT_WINDOW_DAYS} days (${trend}).`;

        alerts.push({
            id: key,
            region: bucket.region,
            category: bucket.category,
            label,
            recentCount,
            baselineCount,
            baselinePerWeek: Number(baselinePerWeek.toFixed(2)),
            severity,
            visitIds: Array.from(bucket.recent),
            sampleIssues,
            message,
        });
    }

    alerts.sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1;
        return b.recentCount - a.recentCount;
    });

    return {
        generatedAt: now.toISOString(),
        recentWindowDays: RECENT_WINDOW_DAYS,
        baselineWindowDays: BASELINE_WINDOW_DAYS,
        alerts,
    };
}