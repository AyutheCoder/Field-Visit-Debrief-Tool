import type { SentimentLabel, VisitWithRelations } from '../types';

export const SENTIMENT_COLORS: Record<SentimentLabel | 'unknown', string> = {
  positive: '#16a34a',
  neutral: '#d97706',
  negative: '#dc2626',
  unknown: '#9ca3af',
};

export function sentimentColor(label: SentimentLabel | null | undefined): string {
  return SENTIMENT_COLORS[label ?? 'unknown'];
}

/** Region is encoded as the part before "-" in the location name. */
export function regionOf(locationName: string): string {
  const idx = locationName.indexOf('-');
  return (idx >= 0 ? locationName.slice(0, idx) : locationName).trim();
}

export interface DashboardFilters {
  from: string;
  to: string;
  programArea: string;
  location: string;
  sentiment: string;
  stakeholder: string;
}

export const EMPTY_FILTERS: DashboardFilters = {
  from: '',
  to: '',
  programArea: '',
  location: '',
  sentiment: '',
  stakeholder: '',
};

export function applyFilters(
  visits: VisitWithRelations[],
  f: DashboardFilters
): VisitWithRelations[] {
  return visits.filter((v) => {
    if (f.from && v.visitDate < f.from) return false;
    if (f.to && v.visitDate > `${f.to}T23:59:59.999Z`) return false;
    if (f.programArea && v.programArea !== f.programArea) return false;
    if (f.location && !v.locationName.toLowerCase().includes(f.location.toLowerCase())) {
      return false;
    }
    if (f.sentiment && (v.debrief?.sentimentLabel ?? '') !== f.sentiment) return false;
    if (f.stakeholder) {
      const match = v.stakeholders.some((s: any) =>
        [s.name, s.role, s.organization]
          .filter(Boolean)
          .some((t) => t!.toLowerCase().includes(f.stakeholder.toLowerCase()))
      );
      if (!match) return false;
    }
    return true;
  });
}

// --- Chart aggregations ---

export interface TimePoint {
  date: string;
  score: number;
  count: number;
}

/** Average sentiment score grouped by visit day, sorted ascending. */
export function sentimentOverTime(visits: VisitWithRelations[]): TimePoint[] {
  const byDay = new Map<string, { sum: number; count: number }>();
  for (const v of visits) {
    if (v.debrief?.sentimentScore == null) continue;
    const day = v.visitDate.slice(0, 10);
    const entry = byDay.get(day) ?? { sum: 0, count: 0 };
    entry.sum += v.debrief.sentimentScore;
    entry.count += 1;
    byDay.set(day, entry);
  }
  return [...byDay.entries()]
    .map(([date, { sum, count }]) => ({
      date,
      score: Number((sum / count).toFixed(2)),
      count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface CategoryCount {
  name: string;
  count: number;
}

export function blockersByCategory(visits: VisitWithRelations[]): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const v of visits) {
    for (const b of v.debrief?.blockers ?? []) {
      counts.set(b.category, (counts.get(b.category) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function visitsByProgram(visits: VisitWithRelations[]): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const v of visits) {
    counts.set(v.programArea, (counts.get(v.programArea) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export interface RecurringIssue {
  issue: string;
  category: string;
  count: number;
  regions: string[];
  programs: string[];
  visitIds: string[];
}

/** Group blockers by normalized issue text to surface recurring issues. */
export function recurringIssues(visits: VisitWithRelations[], limit = 5): RecurringIssue[] {
  const groups = new Map<string, RecurringIssue>();
  for (const v of visits) {
    const region = regionOf(v.locationName);
    for (const b of v.debrief?.blockers ?? []) {
      const key = b.issue.trim().toLowerCase();
      if (!key) continue;
      const g =
        groups.get(key) ??
        ({
          issue: b.issue.trim(),
          category: b.category,
          count: 0,
          regions: [],
          programs: [],
          visitIds: [],
        } as RecurringIssue);
      g.count += 1;
      if (!g.regions.includes(region)) g.regions.push(region);
      if (!g.programs.includes(v.programArea)) g.programs.push(v.programArea);
      if (!g.visitIds.includes(v.id)) g.visitIds.push(v.id);
      groups.set(key, g);
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort();
}
