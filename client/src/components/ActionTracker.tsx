import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { ActionStatus, ActionWithContext, Priority, VisitWithRelations } from '../types';
import { uniqueSorted } from '../lib/dashboard';
import VisitDetail from './VisitDetail';

const STATUSES: { key: ActionStatus; label: string; accent: string }[] = [
  { key: 'open', label: 'Open', accent: 'border-t-gray-400' },
  { key: 'in_progress', label: 'In progress', accent: 'border-t-blue-500' },
  { key: 'done', label: 'Done', accent: 'border-t-green-500' },
];

const PRIORITY_STYLES: Record<Priority, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-600',
};

const NEXT: Record<ActionStatus, ActionStatus | null> = {
  open: 'in_progress',
  in_progress: 'done',
  done: null,
};
const PREV: Record<ActionStatus, ActionStatus | null> = {
  open: null,
  in_progress: 'open',
  done: 'in_progress',
};

function isOverdue(a: ActionWithContext): boolean {
  if (!a.dueDate || a.status === 'done') return false;
  return a.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

export default function ActionTracker() {
  const [actions, setActions] = useState<ActionWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [region, setRegion] = useState('');
  const [program, setProgram] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VisitWithRelations | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listActions()
      .then((a: any) => !cancelled && setActions(a))
      .catch((e: any) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const regions = useMemo(() => uniqueSorted(actions.map((a) => a.region)), [actions]);
  const programs = useMemo(() => uniqueSorted(actions.map((a) => a.programArea)), [actions]);

  const filtered = useMemo(
    () =>
      actions.filter((a) => {
        if (region && a.region !== region) return false;
        if (program && a.programArea !== program) return false;
        if (overdueOnly && !isOverdue(a)) return false;
        return true;
      }),
    [actions, region, program, overdueOnly]
  );

  const counts = useMemo(() => {
    const c: Record<ActionStatus, number> = { open: 0, in_progress: 0, done: 0 };
    for (const a of filtered) c[a.status] += 1;
    return c;
  }, [filtered]);

  async function changeStatus(a: ActionWithContext, status: ActionStatus) {
    if (status === a.status) return;
    setUpdatingId(a.id);
    // Optimistic update.
    setActions((prev) => prev.map((x) => (x.id === a.id ? { ...x, status } : x)));
    try {
      const updated = await api.updateAction(a.id, { status });
      setActions((prev) => prev.map((x) => (x.id === a.id ? updated : x)));
    } catch (e) {
      // Roll back on failure.
      setActions((prev) => prev.map((x) => (x.id === a.id ? a : x)));
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setUpdatingId(null);
    }
  }

  async function openVisit(visitId: string) {
    try {
      const visit = await api.getVisit(visitId);
      setDetail(visit);
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  if (error && actions.length === 0) {
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
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-100">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-500">Region</span>
          <select className={selectClass} value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">All</option>
            {regions.map((r: string) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-500">Program</span>
          <select
            className={selectClass}
            value={program}
            onChange={(e) => setProgram(e.target.value)}
          >
            <option value="">All</option>
            {programs.map((p: string) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm font-medium text-gray-700">Overdue only</span>
        </label>

        <div className="ml-auto flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setView('kanban')}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              view === 'kanban' ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500'
            }`}
          >
            Kanban
          </button>
          <button
            onClick={() => setView('list')}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              view === 'list' ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500'
            }`}
          >
            List
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-gray-400 shadow-sm ring-1 ring-gray-100">
          No action items match the current filters.
        </p>
      ) : view === 'kanban' ? (
        <div className="grid gap-4 md:grid-cols-3">
          {STATUSES.map((col) => (
            <section
              key={col.key}
              className={`rounded-2xl border-t-4 bg-white p-3 shadow-sm ring-1 ring-gray-100 ${col.accent}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900">{col.label}</h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600">
                  {counts[col.key]}
                </span>
              </div>
              <div className="space-y-2">
                {filtered
                  .filter((a) => a.status === col.key)
                  .map((a) => (
                    <ActionCard
                      key={a.id}
                      action={a}
                      busy={updatingId === a.id}
                      onMove={changeStatus}
                      onOpenVisit={openVisit}
                    />
                  ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
            <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Location</th>
                <th className="px-4 py-2">Owner</th>
                <th className="px-4 py-2">Priority</th>
                <th className="px-4 py-2">Due</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{a.description}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => openVisit(a.visitId)}
                      className="text-left text-brand-700 hover:underline"
                    >
                      {a.region} › {a.programArea}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{a.owner || '-'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[a.priority as Priority] || ''}`}
                    >
                      {a.priority}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <DueDate action={a} />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={a.status}
                      disabled={updatingId === a.id}
                      onChange={(e) => changeStatus(a, e.target.value as ActionStatus)}
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                    >
                      {STATUSES.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && <VisitDetail visit={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function ActionCard({
  action: a,
  busy,
  onMove,
  onOpenVisit,
}: {
  action: ActionWithContext;
  busy: boolean;
  onMove: (a: ActionWithContext, status: ActionStatus) => void;
  onOpenVisit: (visitId: string) => void;
}) {
  const prev = PREV[a.status];
  const next = NEXT[a.status];
  return (
    <div className={`rounded-xl border border-gray-100 bg-gray-50 p-3 ${busy ? 'opacity-60' : ''}`}>
      <p className="text-sm font-semibold text-gray-800">{a.description}</p>
      <button
        onClick={() => onOpenVisit(a.visitId)}
        className="mt-1 block text-left text-xs text-brand-700 hover:underline"
      >
        {(a as any).locationName || `${a.region} › ${a.programArea}`}
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_STYLES[a.priority as Priority] || ''}`}
        >
          {a.priority}
        </span>
        {a.owner && (
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600 ring-1 ring-gray-200">
            {a.owner}
          </span>
        )}
        <DueDate action={a} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-1">
        <button
          disabled={!prev || busy}
          onClick={() => prev && onMove(a, prev)}
          className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 enabled:hover:bg-gray-200 disabled:opacity-30"
        >
          ← Back
        </button>
        <button
          disabled={!next || busy}
          onClick={() => next && onMove(a, next)}
          className="rounded-md bg-brand-600 px-2 py-1 text-xs font-semibold text-white enabled:hover:bg-brand-700 disabled:opacity-30"
        >
          {next === 'done' ? 'Mark done' : 'Advance →'}
        </button>
      </div>
    </div>
  );
}

function DueDate({ action: a }: { action: ActionWithContext }) {
  if (!a.dueDate) return <span className="text-[11px] text-gray-400">No due date</span>;
  const overdue = isOverdue(a);
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        overdue ? 'bg-red-100 text-red-700' : 'bg-white text-gray-600 ring-1 ring-gray-200'
      }`}
    >
      {overdue ? 'Overdue : ' : 'Due '}
      {new Date(a.dueDate).toLocaleDateString()}
    </span>
  );
}
