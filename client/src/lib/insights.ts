import type { VisitWithRelations } from '../types';
import { regionOf } from './dashboard';

// --- Sentiment trends by region ---

export interface RegionSentiment {
  region: string;
  avgScore: number | null;
  positive: number;
  neutral: number;
  negative: number;
  visitCount: number;
}

export function sentimentByRegion(visits: VisitWithRelations[]): RegionSentiment[] {
  const groups = new Map<string, RegionSentiment & { _sum: number; _scored: number }>();

  for (const v of visits) {
    const region = regionOf(v.locationName);
    const g =
      groups.get(region) ??
      ({
        region,
        avgScore: null,
        positive: 0,
        neutral: 0,
        negative: 0,
        visitCount: 0,
        _sum: 0,
        _scored: 0,
      } as RegionSentiment & { _sum: number; _scored: number });

    g.visitCount += 1;
    const label = v.debrief?.sentimentLabel;
    if (label === 'positive') g.positive += 1;
    else if (label === 'neutral') g.neutral += 1;
    else if (label === 'negative') g.negative += 1;

    if (v.debrief?.sentimentScore != null) {
      g._sum += v.debrief.sentimentScore;
      g._scored += 1;
    }
    groups.set(region, g);
  }

  return [...groups.values()]
    .map((g) => ({
      region: g.region,
      avgScore: g._scored ? Number((g._sum / g._scored).toFixed(2)) : null,
      positive: g.positive,
      neutral: g.neutral,
      negative: g.negative,
      visitCount: g.visitCount,
    }))
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));
}

// --- Issue-density heatmap ---

export interface DensityPoint {
  lat: number;
  lng: number;
  locationName: string;
  region: string;
  /** Total blockers logged at this location. */
  weight: number;
  /** Visits at this location that match the current highlight (e.g. a pattern). */
  highlightWeight: number;
  visitIds: string[];
}

/**
 * Aggregate geolocated visits into density points for the heatmap. Weight is the
 * number of blockers at each location; `highlightVisitIds` (e.g. a selected
 * pattern's visits) drives the highlighted weight used to emphasise hot spots.
 */
export function issueDensity(
  visits: VisitWithRelations[],
  highlightVisitIds?: Set<string>
): DensityPoint[] {
  const byLoc = new Map<string, DensityPoint>();

  for (const v of visits) {
    if (v.lat == null || v.lng == null) continue;
    const key = `${v.lat.toFixed(4)},${v.lng.toFixed(4)}`;
    const blockers = v.debrief?.blockers.length ?? 0;
    const point =
      byLoc.get(key) ??
      ({
        lat: v.lat,
        lng: v.lng,
        locationName: v.locationName,
        region: regionOf(v.locationName),
        weight: 0,
        highlightWeight: 0,
        visitIds: [],
      } as DensityPoint);

    point.weight += blockers;
    if (highlightVisitIds?.has(v.id)) point.highlightWeight += Math.max(1, blockers);
    if (!point.visitIds.includes(v.id)) point.visitIds.push(v.id);
    byLoc.set(key, point);
  }

  return [...byLoc.values()];
}
