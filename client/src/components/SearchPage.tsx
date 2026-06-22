import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type {
  SearchMode,
  SearchResponse,
  VisitWithRelations,
} from '../types';
import { regionOf, sentimentColor, uniqueSorted } from '../lib/dashboard';
import VisitDetail from './VisitDetail';

const EXAMPLES = [
  'water-supply complaints in the north',
  'medicine stockouts',
  'school infrastructure damage',
];

function highlight(text: string, query: string) {
  const terms = query.trim().split(/\s+/).filter((t) => t.length > 1);
  if (terms.length === 0) return text;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  return text.split(re).map((part, i) =>
    re.test(part) ? (
      <mark key={i} className="rounded bg-yellow-200 px-0.5">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('keyword');
  const [region, setRegion] = useState('');
  const [program, setProgram] = useState('');
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<VisitWithRelations | null>(null);

  // Visits power the region/program filter dropdowns.
  const [visits, setVisits] = useState<VisitWithRelations[]>([]);
  useEffect(() => {
    api.dashboardVisits().then(setVisits).catch(() => undefined);
  }, []);
  const regions = useMemo(
    () => uniqueSorted(visits.map((v) => regionOf(v.locationName))),
    [visits]
  );
  const programs = useMemo(() => uniqueSorted(visits.map((v) => v.programArea)), [visits]);

  async function runSearch(q: string = query) {
    if (!q.trim()) {
      setResponse(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.search({
        q,
        mode,
        region: region || undefined,
        program: program || undefined,
      });
      setResponse(res);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  const selectClass =
    'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200';

  return (
    <div className="mx-auto max-w-4xl p-4">
      {/* Search bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100"
      >
        <div className="flex gap-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes, transcripts, findings..."
            className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
            {(['keyword', 'semantic'] as SearchMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold capitalize transition ${
                  mode === m ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <select className={selectClass} value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">All regions</option>
            {regions.map((r: string) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={program}
            onChange={(e) => setProgram(e.target.value)}
          >
            <option value="">All programs</option>
            {programs.map((p: string) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
          <span>Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQuery(ex);
                setMode('semantic');
                runSearch(ex);
              }}
              className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600 hover:bg-gray-200"
            >
              {ex}
            </button>
          ))}
        </div>
      </form>

      {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}

      {response?.note && (
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-100">
          {response.note}
        </div>
      )}

      {response && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-gray-500">
            {response.results.length} result{response.results.length === 1 ? '' : 's'} {'· '}
            <span className="capitalize">{response.mode}</span> search
          </p>
          {response.results.length === 0 ? (
            <p className="rounded-2xl bg-white p-8 text-center text-sm text-gray-400 shadow-sm ring-1 ring-gray-100">
              No matches. Try a different query{mode === 'keyword' ? ' or semantic mode' : ''}.
            </p>
          ) : (
            <ul className="space-y-2">
              {response.results.map((r: any) => (
                <li key={r.visit.id}>
                  <button
                    onClick={() => setDetail(r.visit)}
                    className="w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-gray-100 transition hover:ring-brand-200"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: sentimentColor(r.visit.debrief?.sentimentLabel) }}
                        />
                        <span className="truncate text-sm font-semibold text-gray-900">
                          {r.visit.locationName}
                        </span>
                      </div>
                      {r.score != null && (
                        <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">
                          {(r.score * 100).toFixed(0)}% match
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {regionOf(r.visit.locationName)} · {r.visit.programArea} · {' '}
                      {new Date(r.visit.visitDate).toLocaleDateString()}
                    </p>
                    {r.snippet && (
                      <p className="mt-2 text-sm text-gray-600">{highlight(r.snippet, query)}</p>
                    )}
                    {r.matchedIn.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.matchedIn.map((m: any) => (
                          <span
                            key={m}
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {detail && <VisitDetail visit={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
