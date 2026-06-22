import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { api } from '../lib/api';
import type { IssuePattern, VisitWithRelations } from '../types';
import { sentimentColor, regionOf } from '../lib/dashboard';
import { issueDensity, sentimentByRegion } from '../lib/insights';
import HeatMapPanel from './HeatMapPanel';
import VisitDetail from './VisitDetail';
import AlertsBanner from './AlertsBanner';

const CATEGORY_COLORS: Record<string, string> = {
  infrastructure: '#2563eb',
  supply: '#dc2626',
  staffing: '#7c3aed',
  community: '#0891b2',
  funding: '#ea580c',
  other: '#6b7280',
};

function scoreColor(score: number | null): string {
  if (score == null) return '#9ca3af';
  if (score > 0.15) return '#16a34a';
  if (score < -0.15) return '#dc2626';
  return '#d97706';
}

export default function InsightsPage() {
  const [patterns, setPatterns] = useState<IssuePattern[]>([]);
  const [method, setMethod] = useState<'semantic' | 'lexical'>('lexical');
  const [visits, setVisits] = useState<VisitWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VisitWithRelations | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.patterns(), api.dashboardVisits()])
      .then(([p, v]) => {
        if (cancelled) return;
        setPatterns(p.patterns);
        setMethod(p.method);
        setVisits(v);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const visitsById = useMemo(() => {
    const m = new Map<string, VisitWithRelations>();
    for (const v of visits) m.set(v.id, v);
    return m;
  }, [visits]);

  const selected = patterns.find((p) => p.id === selectedId) ?? null;

  const regionData = useMemo(() => sentimentByRegion(visits), [visits]);

  const density = useMemo(() => {
    const highlight = selected ? new Set<string>(selected.visitIds) : undefined;
    return issueDensity(visits, highlight);
  }, [visits, selected]);

  const contributing = useMemo(
    () =>
      selected
        ? selected.visitIds
            .map((id: string) => visitsById.get(id))
            .filter((v: any): v is VisitWithRelations => !!v)
        : [],
    [selected, visitsById]
  );

  const recurring = patterns.filter((p) => p.count > 1).length;
  const totalBlockers = patterns.reduce((n, p) => n + p.occurrences, 0);
  const regionsAffected = new Set(patterns.flatMap((p) => p.regions)).size;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <AlertsBanner onSelectVisit={(id) => setDetail(visitsById.get(id) ?? null)} />

      {/* Method banner */}
      <div
        className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-2 text-sm ${
          method === 'semantic'
            ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-100'
            : 'bg-amber-50 text-amber-800 ring-1 ring-amber-100'
        }`}
      >
        <span className="font-semibold">
          {method === 'semantic' ? '🧠 Semantic clustering' : '🔤 Lexical grouping'}
        </span>
        <span className="text-xs">
          {method === 'semantic'
            ? 'Issues grouped by meaning using OpenAI embeddings.'
            : 'Set OPENAI_API_KEY to group differently-worded issues by meaning.'}
        </span>
      </div>

      {/* Stat cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Distinct issues" value={String(patterns.length)} />
        <Stat label="Recurring (2+ visits)" value={String(recurring)} tone="warn" />
        <Stat label="Regions affected" value={String(regionsAffected)} />
        <Stat label="Total blockers" value={String(totalBlockers)} tone="negative" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recurring issues list */}
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Recurring issues</h2>
            {selected && (
              <button
                onClick={() => setSelectedId(null)}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          {patterns.length === 0 ? (
            <p className="text-sm text-gray-400">No issues detected yet.</p>
          ) : (
            <ul className="space-y-2">
              {patterns.map((p) => {
                const active = p.id === selectedId;
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelectedId(active ? null : p.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        active
                          ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-200'
                          : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-800">{p.label}</p>
                        <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                          {p.count}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                          style={{ backgroundColor: CATEGORY_COLORS[p.category] ?? '#6b7280' }}
                        >
                          {p.category}
                        </span>
                        {p.regions.map((r: string) => (
                          <span
                            key={r}
                            className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600 ring-1 ring-gray-200"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                      {p.variants.length > 1 && (
                        <p className="mt-1.5 text-[11px] text-gray-400">
                          Merges {p.variants.length} phrasings · {p.programs.join(', ')}
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Charts + map */}
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
            <h2 className="mb-3 text-sm font-bold text-gray-900">Average sentiment by region</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={regionData} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="region" tick={{ fontSize: 11 }} />
                <YAxis domain={[-1, 1]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="avgScore" radius={[4, 4, 0, 0]}>
                  {regionData.map((r) => (
                    <Cell key={r.region} fill={scoreColor(r.avgScore)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
            <h2 className="mb-3 text-sm font-bold text-gray-900">Sentiment mix by region</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={regionData} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="region" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="positive" stackId="s" fill={sentimentColor('positive')} />
                <Bar dataKey="neutral" stackId="s" fill={sentimentColor('neutral')} />
                <Bar dataKey="negative" stackId="s" fill={sentimentColor('negative')} />
              </BarChart>
            </ResponsiveContainer>
          </section>
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">Issue-density heatmap</h2>
              {selected && (
                <span className="text-xs text-gray-500">
                  Highlighting <span className="font-semibold">{selected.label}</span>
                </span>
              )}
            </div>
            <HeatMapPanel points={density} highlightActive={!!selected} />
          </section>
        </div>
      </div>

      {/* Drill-down: contributing visits */}
      {selected && (
        <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <h2 className="mb-3 text-sm font-bold text-gray-900">
            Contributing visits - {selected.label}{' '}
            <span className="font-normal text-gray-400">({contributing.length})</span>
          </h2>
          <ul className="divide-y divide-gray-100">
            {contributing.map((v: any) => (
              <li key={v.id}>
                <button
                  onClick={() => setDetail(v)}
                  className="flex w-full items-center gap-3 py-3 text-left hover:bg-gray-50"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: sentimentColor(v.debrief?.sentimentLabel) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">
                      {v.locationName}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {regionOf(v.locationName)} · {v.programArea} · {' '}
                      {new Date(v.visitDate).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">View &rarr;</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail && <VisitDetail visit={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'negative' | 'warn';
}) {
  const valueColor =
    tone === 'negative' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-gray-900';
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}
