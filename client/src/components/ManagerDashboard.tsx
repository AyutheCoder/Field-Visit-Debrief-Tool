import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { api } from '../lib/api';
import type { VisitWithRelations } from '../types';
import {
  applyFilters,
  blockersByCategory,
  EMPTY_FILTERS,
  recurringIssues,
  regionOf,
  sentimentColor,
  sentimentOverTime,
  uniqueSorted,
  visitsByProgram,
  type DashboardFilters,
} from '../lib/dashboard';
import MapPanel from './MapPanel';
import VisitDetail from './VisitDetail';
import { exportVisitsCsv } from '../lib/export';
import { useToast } from './ui/Toast';
import { SkeletonCard } from './ui/Skeleton';
import { EmptyState } from './ui/EmptyState';

const PROGRAM_COLORS = ['#0d9488', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#65a30d', '#0891b2'];

// Manager dashboard: charts, map, recurring issues, and CSV export.
export default function ManagerDashboard() {
  const toast = useToast();
  const [all, setAll] = useState<VisitWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<VisitWithRelations | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .dashboardVisits()
      .then((v: any) => !cancelled && setAll(v))
      .catch((e: any) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Failed to load';
        setError(msg);
        toast.error(msg);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => applyFilters(all, filters), [all, filters]);

  const programs = useMemo(() => uniqueSorted(all.map((v) => v.programArea)), [all]);
  const timeData = useMemo(() => sentimentOverTime(filtered), [filtered]);
  const blockerData = useMemo(() => blockersByCategory(filtered), [filtered]);
  const programData = useMemo(() => visitsByProgram(filtered), [filtered]);
  const issues = useMemo(() => recurringIssues(filtered), [filtered]);

  const negCount = filtered.filter((v: any) => v.debrief?.sentimentLabel === 'negative').length;
  const openActions = filtered.reduce(
    (n: number, v: any) => n + (v.debrief?.actionItems.filter((a: any) => a.status !== 'done').length ?? 0),
    0
  );
  const avgScore = (() => {
    const scored = filtered.filter((v: any) => v.debrief?.sentimentScore != null);
    if (!scored.length) return null;
    return (
      scored.reduce((s: number, v: any) => s + (v.debrief!.sentimentScore ?? 0), 0) / scored.length
    ).toFixed(2);
  })();

  function set<K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) {
    setFilters((f: any) => ({ ...f, [key]: value }));
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
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

  const selectClass =
    'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200';

  return (
    <div className="mx-auto max-w-6xl p-4">
      {/* Stat cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Visits" value={String(filtered.length)} />
        <Stat label="Negative sentiment" value={String(negCount)} tone="negative" />
        <Stat label="Open actions" value={String(openActions)} tone="warn" />
        <Stat label="Avg sentiment" value={avgScore ?? '-'} />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-100">
        <Field label="From">
          <input type="date" className={selectClass} value={filters.from.slice(0, 10)}
            onChange={(e) => set('from', e.target.value ? `${e.target.value}T00:00:00.000Z` : '')} />
        </Field>
        <Field label="To">
          <input type="date" className={selectClass} value={filters.to}
            onChange={(e) => set('to', e.target.value)} />
        </Field>
        <Field label="Program">
          <select className={selectClass} value={filters.programArea}
            onChange={(e) => set('programArea', e.target.value)}>
            <option value="">All</option>
            {programs.map((p: string) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Sentiment">
          <select className={selectClass} value={filters.sentiment}
            onChange={(e) => set('sentiment', e.target.value)}>
            <option value="">All</option>
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
          </select>
        </Field>
        <Field label="Location">
          <input className={selectClass} placeholder="Search..." value={filters.location}
            onChange={(e) => set('location', e.target.value)} />
        </Field>
        <Field label="Stakeholder">
          <input className={selectClass} placeholder="Name / org..." value={filters.stakeholder}
            onChange={(e) => set('stakeholder', e.target.value)} />
        </Field>
        <button
          onClick={() => setFilters(EMPTY_FILTERS)}
          className="ml-auto rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100"
        >
          Clear
        </button>
        <button
          onClick={() => {
            if (!filtered.length) {
              toast.info('No visits to export');
              return;
            }
            exportVisitsCsv(filtered);
            toast.success(`Exported ${filtered.length} visit(s) to CSV`);
          }}
          className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          ⬇ Export CSV
        </button>
      </div>

      {/* Charts */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="📊"
          title="No visits to show"
          message={
            all.length === 0
              ? 'Logged field visits will appear here once your team starts capturing them.'
              : 'No visits match the current filters. Try clearing them.'
          }
          action={
            all.length > 0 ? (
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Charts */}
          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <ChartCard title="Sentiment over time" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={timeData} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[-1, 1]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" stroke="#0d9488" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Visits by program">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={programData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                    {programData.map((_: any, i: number) => (
                      <Cell key={i} fill={PROGRAM_COLORS[i % PROGRAM_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Blockers by category" className="lg:col-span-3">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={blockerData} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Map + recurring issues */}
          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard title="Visit map">
                <MapPanel visits={filtered} onSelect={setSelected} />
              </ChartCard>
            </div>
            <ChartCard title="Top recurring issues">
              {issues.length === 0 ? (
                <p className="text-sm text-gray-400">No recurring issues.</p>
              ) : (
                <ul className="space-y-2">
                  {issues.map((issue: any) => (
                    <li key={issue.issue} className="rounded-lg bg-gray-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800">{issue.issue}</p>
                        <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                          {issue.count}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {issue.category} · {issue.regions.join(', ')}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </ChartCard>
          </div>

          {/* Visit feed */}
          <ChartCard title={`Visit feed (${filtered.length})`}>
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400">No visits match the current filters.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filtered.map((v: any) => (
                  <li key={v.id}>
                    <button
                      onClick={() => setSelected(v)}
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
                      <span className="shrink-0 text-xs text-gray-400">
                        {v.debrief?.blockers.length ?? 0} blockers
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ChartCard>
        </>
      )}

      {selected && <VisitDetail visit={selected} onClose={() => setSelected(null)} />}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function ChartCard({
  title,
  className = '',
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 ${className}`}>
      <h2 className="mb-3 text-sm font-bold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}
