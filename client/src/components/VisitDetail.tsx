import type { VisitWithRelations } from '../types';
import { mediaUrl } from '../lib/api';
import { regionOf, sentimentColor } from '../lib/dashboard';

const priorityStyles: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-600',
};

const statusStyles: Record<string, string> = {
  open: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
};

export default function VisitDetail({
  visit,
  onClose,
}: {
  visit: VisitWithRelations;
  onClose: () => void;
}) {
  const d = visit.debrief;
  const photos = visit.media.filter((m: any) => m.type === 'photo');
  const audio = visit.media.filter((m: any) => m.type === 'audio');

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-gray-50 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {regionOf(visit.locationName)}
            </p>
            <h2 className="text-lg font-bold text-gray-900">{visit.locationName}</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {visit.programArea}
              {visit.visitType ? ` · ${visit.visitType}` : ''} · {' '}
              {new Date(visit.visitDate).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-500 hover:bg-gray-100"
          >
            ✕ Close
          </button>
        </div>

        <div className="space-y-4 p-5">
          {d && (
            <div className="flex items-center gap-2">
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold capitalize text-white"
                style={{ backgroundColor: sentimentColor(d.sentimentLabel) }}
              >
                {d.sentimentLabel ?? 'unknown'} · {(d.sentimentScore ?? 0).toFixed(2)}
              </span>
              {d.editedByHuman && (
                <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                  human-reviewed
                </span>
              )}
              {d.aiModel && (
                <span className="text-xs text-gray-400">{d.aiModel}</span>
              )}
            </div>
          )}

          {!d && (
            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700">
              No debrief generated yet for this visit.
            </div>
          )}

          {d && (
            <>
              <DetailCard title="Key Findings" icon="🔑">
                {d.keyFindings.length ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                    {d.keyFindings.map((k: string, i: number) => (
                      <li key={i}>{k}</li>
                    ))}
                  </ul>
                ) : (
                  <Empty />
                )}
              </DetailCard>

              <DetailCard title="Blockers" icon="🚧">
                {d.blockers.length ? (
                  <ul className="space-y-2">
                    {d.blockers.map((b: any, i: number) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-600">
                          {b.category}
                        </span>
                        {b.issue}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty />
                )}
              </DetailCard>

              {d.sentimentRationale && (
                <DetailCard title="Sentiment Rationale" icon="🧠">
                  <p className="text-sm text-gray-700">{d.sentimentRationale}</p>
                </DetailCard>
              )}

              <DetailCard title="Suggested Follow-Ups" icon="✅">
                {d.followUps.length ? (
                  <ul className="space-y-2">
                    {d.followUps.map((f: any, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            priorityStyles[f.priority] ?? priorityStyles.low
                          }`}
                        >
                          {f.priority}
                        </span>
                        <div>
                          {f.action}
                          {f.owner_suggestion ? (
                            <span className="text-gray-400"> - {f.owner_suggestion}</span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty />
                )}
              </DetailCard>

              {d.actionItems.length > 0 && (
                <DetailCard title="Action Items" icon="📋">
                  <ul className="space-y-2">
                    {d.actionItems.map((a: any) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 p-2 text-sm"
                      >
                        <span className="text-gray-700">{a.description}</span>
                        <span className="flex shrink-0 gap-1">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              priorityStyles[a.priority] ?? priorityStyles.low
                            }`}
                          >
                            {a.priority}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              statusStyles[a.status] ?? statusStyles.open
                            }`}
                          >
                            {a.status.replace('_', ' ')}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </DetailCard>
              )}
            </>
          )}

          {visit.stakeholders.length > 0 && (
            <DetailCard title="Stakeholders" icon="👥">
              <ul className="space-y-1 text-sm text-gray-700">
                {visit.stakeholders.map((s: any) => (
                  <li key={s.id}>
                    <span className="font-medium">{s.name}</span>
                    {s.role ? ` - ${s.role}` : ''}
                    {s.organization ? ` (${s.organization})` : ''}
                  </li>
                ))}
              </ul>
            </DetailCard>
          )}

          {visit.rawNotesText?.trim() && (
            <DetailCard title="Field Notes" icon="📝">
              <p className="whitespace-pre-wrap text-sm text-gray-700">{visit.rawNotesText}</p>
            </DetailCard>
          )}

          {audio.length > 0 && (
            <DetailCard title="Voice Memos & Transcript" icon="🎙️">
              <ul className="space-y-3">
                {audio.map((m: any, i: number) => (
                  <li key={m.id} className="rounded-lg bg-gray-50 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Memo {i + 1}
                    </p>
                    <audio src={mediaUrl(m.url)} controls className="mb-2 h-8 w-full" />
                    {m.transcript ? (
                      <p className="text-sm text-gray-700">{m.transcript}</p>
                    ) : (
                      <p className="text-xs text-gray-400">Not transcribed.</p>
                    )}
                  </li>
                ))}
              </ul>
            </DetailCard>
          )}

          {photos.length > 0 && (
            <DetailCard title="Photos" icon="📷">
              <div className="grid grid-cols-3 gap-2">
                {photos.map((m: any) => (
                  <a
                    key={m.id}
                    href={mediaUrl(m.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="aspect-square overflow-hidden rounded-lg"
                  >
                    <img
                      src={mediaUrl(m.url)}
                      alt={m.caption ?? ''}
                      className="h-full w-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </DetailCard>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
      <h3 className="mb-2 text-sm font-bold text-gray-900">
        {icon && <span className="mr-1.5">{icon}</span>}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Empty() {
  return <p className="text-sm text-gray-400">None recorded.</p>;
}
