import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { ChatSource, VisitWithRelations } from '../types';
import VisitDetail from './VisitDetail';

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  mode?: 'rag' | 'summary';
  note?: string;
  sources?: ChatSource[];
}

const EXAMPLES = [
  'Top issues in education this quarter?',
  'Which regions report supply problems?',
  'Where is community sentiment most negative?',
  'Summarize healthcare blockers.',
];

export default function ChatPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<VisitWithRelations | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, loading]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setInput('');
    setTurns((t) => [...t, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const res = await api.chat(q);
      setTurns((t) => [
        ...t,
        { role: 'assistant', text: res.answer, mode: res.mode, note: res.note, sources: res.sources },
      ]);
    } catch (e) {
      setTurns((t) => [
        ...t,
        { role: 'assistant', text: e instanceof Error ? e.message : 'Something went wrong.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function openVisit(id: string) {
    try {
      setDetail(await api.getVisit(id));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col p-4">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {turns.length === 0 && (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-gray-100">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-2xl">
              💬
            </div>
            <h2 className="text-base font-bold text-gray-900">Ask about your field visits</h2>
            <p className="mt-1 text-sm text-gray-500">
              I answer questions over all visit debriefs.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => ask(ex)}
                  className="rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) =>
          turn.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm text-white">
                {turn.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-4 py-3 text-sm text-gray-800 shadow-sm ring-1 ring-gray-100">
                {turn.mode && (
                  <span
                    className={`mb-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      turn.mode === 'rag'
                        ? 'bg-brand-50 text-brand-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {turn.mode === 'rag' ? '🔍 RAG answer' : '📝 Summary'}
                  </span>
                )}
                <p className="whitespace-pre-wrap leading-relaxed">{turn.text}</p>
                {turn.note && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    {turn.note}
                  </p>
                )}
                {turn.sources && turn.sources.length > 0 && (
                  <div className="mt-2 border-t border-gray-100 pt-2">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Sources
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {turn.sources.map((s) => (
                        <button
                          key={s.visitId}
                          onClick={() => openVisit(s.visitId)}
                          className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-200"
                          title={`${s.programArea} · ${new Date(s.visitDate).toLocaleDateString()}`}
                        >
                          {s.locationName}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm ring-1 ring-gray-100">
              <span className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-300" />
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2 border-t border-gray-200 pt-3"
      >
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your visits..."
          className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>

      {detail && <VisitDetail visit={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
