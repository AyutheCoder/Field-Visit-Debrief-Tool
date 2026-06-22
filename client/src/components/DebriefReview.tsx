import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { printDebrief } from '../lib/export';
import type {
  Blocker,
  BlockerCategory,
  FollowUp,
  Priority,
  SentimentLabel,
  VisitWithRelations,
} from '../types';

const BLOCKER_CATEGORIES: BlockerCategory[] = [
  'infrastructure',
  'supply',
  'staffing',
  'community',
  'funding',
  'other',
];
const SENTIMENTS: SentimentLabel[] = ['positive', 'neutral', 'negative'];
const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

interface EditState {
  keyFindings: string[];
  blockers: Blocker[];
  sentimentLabel: SentimentLabel;
  sentimentScore: number;
  sentimentRationale: string;
  followUps: FollowUp[];
}

type Phase = 'working' | 'ready' | 'error';

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200';

interface Props {
  visitId: string;
  onDone: () => void;
}

export default function DebriefReview({ visitId, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('working');
  const [status, setStatus] = useState('Loading visit...');
  const [error, setError] = useState<string | null>(null);
  const [visit, setVisit] = useState<VisitWithRelations | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const started = useRef(false);

  const update = useCallback((patch: Partial<EditState>) => {
    setEdit((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
    setSaved(false);
  }, []);

  const runPipeline = useCallback(async () => {
    setPhase('working');
    setError(null);
    try {
      setStatus('Loading visit...');
      let v = await api.getVisit(visitId);
      setVisit(v);

      const hasAudio = v.media.some((m: any) => m.type === 'audio');
      if (hasAudio) {
        setStatus('Transcribing voice memos...');
        await api.transcribeVisit(visitId);
        v = await api.getVisit(visitId); // refresh to pick up transcripts
        setVisit(v);
      }

      setStatus('Generating debrief...');
      const debrief = await api.generateDebrief(visitId);
      setEdit({
        keyFindings: debrief.keyFindings ?? [],
        blockers: debrief.blockers ?? [],
        sentimentLabel: debrief.sentimentLabel ?? 'neutral',
        sentimentScore: debrief.sentimentScore ?? 0,
        sentimentRationale: debrief.sentimentRationale ?? '',
        followUps: debrief.followUps ?? [],
      });
      setDirty(false);
      setSaved(false);
      setPhase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setPhase('error');
    }
  }, [visitId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void runPipeline();
  }, [runPipeline]);

  async function regenerate() {
    if (dirty && !confirm('Regenerate will discard your edits. Continue?')) return;
    setRegenerating(true);
    setError(null);
    try {
      setStatus('Regenerating debrief...');
      const debrief = await api.generateDebrief(visitId);
      setEdit({
        keyFindings: debrief.keyFindings ?? [],
        blockers: debrief.blockers ?? [],
        sentimentLabel: debrief.sentimentLabel ?? 'neutral',
        sentimentScore: debrief.sentimentScore ?? 0,
        sentimentRationale: debrief.sentimentRationale ?? '',
        followUps: debrief.followUps ?? [],
      });
      setDirty(false);
      setSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed');
    } finally {
      setRegenerating(false);
    }
  }

  async function save() {
    if (!edit) return;
    setSaving(true);
    setError(null);
    try {
      await api.saveDebrief(visitId, {
        keyFindings: edit.keyFindings.filter((s) => s.trim() !== ''),
        blockers: edit.blockers.filter((b) => b.issue.trim() !== ''),
        sentimentLabel: edit.sentimentLabel,
        sentimentScore: edit.sentimentScore,
        sentimentRationale: edit.sentimentRationale.trim() || null,
        followUps: edit.followUps.filter((f) => f.action.trim() !== ''),
        editedByHuman: true,
      });
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const transcripts = useMemo(
    () => visit?.media.filter((m: any) => m.type === 'audio' && m.transcript?.trim()) ?? [],
    [visit]
  );

  // ---- Loading / error states ----
  if (phase === 'working') {
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <h2 className="text-lg font-bold text-gray-900">Analysing visit</h2>
          <p className="mt-1 text-sm text-gray-500">{status}</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    const noKey = error?.toLowerCase().includes('not configured');
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl">
            ⚠️
          </div>
          <h2 className="text-lg font-bold text-gray-900">Couldn't generate debrief</h2>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
          {noKey && (
            <p className="mt-2 text-xs text-gray-400">
              Add <span className="font-mono">OPENAI_API_KEY</span> to{' '}
              <span className="font-mono">server/.env</span> and restart the server.
            </p>
          )}
          <div className="mt-6 flex gap-2">
            <button
              onClick={() => void runPipeline()}
              className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white"
            >
              Try again
            </button>
            <button
              onClick={onDone}
              className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-semibold text-gray-700"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!edit) return null;

  // ---- Ready: editable debrief ----
  return (
    <div className="mx-auto max-w-3xl p-4 pb-28">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main editable debrief */}
        <div className="space-y-4 lg:col-span-2">
          {/* Key findings */}
          <Card title="Key Findings" icon="🔑">
            <ListEditor
              items={edit.keyFindings}
              placeholder="Describe a key finding..."
              onChange={(keyFindings) => update({ keyFindings })}
              renderRow={(value, onValue) => (
                <textarea
                  className={`${inputClass} min-h-[44px] resize-y`}
                  value={value}
                  onChange={(e) => onValue(e.target.value)}
                  placeholder="Describe a key finding..."
                />
              )}
              empty=""
            />
          </Card>

          {/* Blockers */}
          <Card title="Blockers" icon="🚧">
            <div className="space-y-2">
              {edit.blockers.map((b, i) => (
                <div key={i} className="rounded-lg bg-gray-50 p-2">
                  <div className="flex gap-2">
                    <input
                      className={inputClass}
                      value={b.issue}
                      placeholder="Describe the blocker..."
                      onChange={(e) => {
                        const blockers = [...edit.blockers];
                        blockers[i] = { ...b, issue: e.target.value };
                        update({ blockers });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => update({ blockers: edit.blockers.filter((_, j) => j !== i) })}
                      className="shrink-0 rounded-lg px-2 text-sm font-medium text-red-600 hover:bg-red-50"
                      aria-label="Remove blocker"
                    >
                      ✕
                    </button>
                  </div>
                  <select
                    className={`${inputClass} mt-2`}
                    value={b.category}
                    onChange={(e) => {
                      const blockers = [...edit.blockers];
                      blockers[i] = { ...b, category: e.target.value as BlockerCategory };
                      update({ blockers });
                    }}
                  >
                    {BLOCKER_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <AddButton
              label="+ Add blocker"
              onClick={() =>
                update({ blockers: [...edit.blockers, { issue: '', category: 'other' }] })
              }
            />
          </Card>

          {/* Sentiment */}
          <Card title="Community Sentiment" icon="💬" badge={<SentimentBadge label={edit.sentimentLabel} score={edit.sentimentScore} />}>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Label</label>
            <div className="mb-3 flex gap-2">
              {SENTIMENTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => update({ sentimentLabel: s })}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition ${
                    edit.sentimentLabel === s
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-300 text-gray-600'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-xs font-semibold text-gray-500">
              Score: {edit.sentimentScore.toFixed(2)} (-1 negative = 1 positive)
            </label>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={edit.sentimentScore}
              onChange={(e) => update({ sentimentScore: Number(e.target.value) })}
              className="mb-3 w-full accent-brand-600"
            />

            <label className="mb-1 block text-xs font-semibold text-gray-500">Rationale</label>
            <textarea
              className={`${inputClass} min-h-[60px] resize-y`}
              value={edit.sentimentRationale}
              placeholder="Why this sentiment?"
              onChange={(e) => update({ sentimentRationale: e.target.value })}
            />
          </Card>

          {/* Follow-ups */}
          <Card title="Suggested Follow-Ups" icon="✅">
            <div className="space-y-2">
              {edit.followUps.map((f, i) => (
                <div key={i} className="rounded-lg bg-gray-50 p-2">
                  <div className="flex gap-2">
                    <input
                      className={inputClass}
                      value={f.action}
                      placeholder="Action to take..."
                      onChange={(e) => {
                        const followUps = [...edit.followUps];
                        followUps[i] = { ...f, action: e.target.value };
                        update({ followUps });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => update({ followUps: edit.followUps.filter((_, j) => j !== i) })}
                      className="shrink-0 rounded-lg px-2 text-sm font-medium text-red-600 hover:bg-red-50"
                      aria-label="Remove follow-up"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <select
                      className={inputClass}
                      value={f.priority}
                      onChange={(e) => {
                        const followUps = [...edit.followUps];
                        followUps[i] = { ...f, priority: e.target.value as Priority };
                        update({ followUps });
                      }}
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p} priority
                        </option>
                      ))}
                    </select>
                    <input
                      className={inputClass}
                      value={f.owner_suggestion ?? ''}
                      placeholder="Suggested owner"
                      onChange={(e) => {
                        const followUps = [...edit.followUps];
                        followUps[i] = { ...f, owner_suggestion: e.target.value };
                        update({ followUps });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <AddButton
              label="+ Add follow-up"
              onClick={() =>
                update({
                  followUps: [
                    ...edit.followUps,
                    { action: '', priority: 'medium', owner_suggestion: '' },
                  ],
                })
              }
            />
          </Card>
        </div>

        {/* Sidebar: visit summary + transcript */}
        <aside className="space-y-4">
          {visit && (
            <Card title="Visit" icon="📍">
              <dl className="space-y-1 text-sm text-gray-600">
                <div>
                  <dt className="inline font-semibold text-gray-700">Location: </dt>
                  <dd className="inline">{visit.locationName}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-gray-700">Program: </dt>
                  <dd className="inline">{visit.programArea}</dd>
                </div>
                {visit.visitType && (
                  <div>
                    <dt className="inline font-semibold text-gray-700">Type: </dt>
                    <dd className="inline">{visit.visitType}</dd>
                  </div>
                )}
                <div>
                  <dt className="inline font-semibold text-gray-700">Date: </dt>
                  <dd className="inline">{new Date(visit.visitDate).toLocaleString()}</dd>
                </div>
              </dl>
            </Card>
          )}

          <Card title="Original Transcript" icon="🎙️">
            {transcripts.length === 0 ? (
              <p className="text-sm text-gray-400">
                {visit?.media.some((m: any) => m.type === 'audio')
                  ? 'No transcript available.'
                  : 'No voice memos on this visit.'}
              </p>
            ) : (
              <ul className="space-y-3">
                {transcripts.map((m: any, i: number) => (
                  <li key={m.id} className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Memo {i + 1}
                    </p>
                    {m.transcript}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {visit?.rawNotesText?.trim() && (
            <Card title="Field Notes" icon="🗒️">
              <p className="whitespace-pre-wrap text-sm text-gray-700">{visit.rawNotesText}</p>
            </Card>
          )}
        </aside>
      </div>

      {error && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            onClick={onDone}
            className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700"
          >
            Done
          </button>
          <button
            onClick={() => void regenerate()}
            disabled={regenerating || saving}
            className="rounded-xl border border-brand-300 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 disabled:opacity-50"
          >
            {regenerating ? 'Regenerating...' : '🔄 Regenerate'}
          </button>
          <button
            onClick={() => {
              visit &&
                edit &&
                printDebrief(visit, {
                  keyFindings: edit.keyFindings.filter((s) => s.trim() !== ''),
                  blockers: edit.blockers.filter((b) => b.issue.trim() !== ''),
                  sentimentLabel: edit.sentimentLabel,
                  sentimentScore: edit.sentimentScore,
                  followUps: edit.followUps.filter((f) => f.action.trim() !== ''),
                  actionItems: visit.debrief?.actionItems ?? [],
                  aiModel: visit.debrief?.aiModel ?? null,
                });
            }}
            disabled={!visit}
            className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 disabled:opacity-50"
          >
            🖨 PDF
          </button>
          <button
            onClick={() => void save()}
            disabled={saving || regenerating}
            className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Saving...' : saved && !dirty ? '✓ Saved' : 'Save debrief'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Small presentational helpers
// ----------------------------------------------------------------------

function Card({
  title,
  icon,
  badge,
  children,
}: {
  title: string;
  icon?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">
          {icon && <span className="mr-1.5">{icon}</span>}
          {title}
        </h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50"
    >
      {label}
    </button>
  );
}

function ListEditor({
  items,
  onChange,
  renderRow,
  placeholder,
  empty,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  renderRow: (value: string, onValue: (v: string) => void) => React.ReactNode;
  placeholder: string;
  empty: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((value, i) => (
        <div key={i} className="flex gap-2">
          <div className="flex-1">
            {renderRow(value, (v) => {
              const next = [...items];
              next[i] = v;
              onChange(next);
            })}
          </div>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="shrink-0 rounded-lg px-2 text-sm font-medium text-red-600 hover:bg-red-50"
            aria-label="Remove item"
          >
            ✕
          </button>
        </div>
      ))}
      <AddButton label={'+ Add'} onClick={() => onChange([...items, empty])} />
      <span className="sr-only">{placeholder}</span>
    </div>
  );
}

function SentimentBadge({ label, score }: { label: SentimentLabel; score: number }) {
  const styles: Record<SentimentLabel, string> = {
    positive: 'bg-green-100 text-green-700',
    neutral: 'bg-amber-100 text-amber-700',
    negative: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${styles[label]}`}>
      {label} · {score.toFixed(2)}
    </span>
  );
}
