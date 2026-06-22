import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { AlertItem } from '../types';

interface Props {
  /** Called with a visit id when a contributing visit chip is clicked. */
  onSelectVisit?: (visitId: string) => void;
}

const SEVERITY_STYLES: Record<AlertItem['severity'], { ring: string; pill: string; icon: string }> = {
  high: { ring: 'border-red-200 bg-red-50', pill: 'bg-red-500 text-white', icon: '🔺' },
  medium: { ring: 'border-amber-200 bg-amber-50', pill: 'bg-amber-500 text-white', icon: '⚠️' },
};

export default function AlertsBanner({ onSelectVisit }: Props) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [windowDays, setWindowDays] = useState(10);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .alerts()
      .then((r: any) => {
        if (cancelled) return;
        setAlerts(r.alerts);
        setWindowDays(r.recentWindowDays);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || alerts.length === 0) return null;

  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-bold text-gray-900">Early-warning alerts</h2>
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
          {alerts.length}
        </span>
        <span className="text-xs text-gray-400">spikes in the last {windowDays} days</span>
      </div>
      <div className="space-y-2">
        {alerts.map((a) => {
          const s = SEVERITY_STYLES[a.severity];
          return (
            <div key={a.id} className={`rounded-2xl border p-3 shadow-sm ${s.ring}`}>
              <div className="flex items-start gap-3">
                <span className="text-xl leading-none">{s.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">
                      {a.region} · {a.category}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${s.pill}`}>
                      {a.severity}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-700">{a.message}</p>
                  {a.sampleIssues.length > 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      e.g. {a.sampleIssues.join(', ')}
                    </p>
                  )}
                  {onSelectVisit && a.visitIds.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {a.visitIds.map((id, i) => (
                        <button
                          key={id}
                          onClick={() => onSelectVisit(id)}
                          className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 ring-1 ring-gray-200 hover:ring-brand-300"
                        >
                          Visit {i + 1}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
