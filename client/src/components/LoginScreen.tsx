import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Spinner } from './ui/Spinner';

const DEMO_ACCOUNTS = [
  { email: 'asha@fieldteam.org', role: 'Field officer' },
  { email: 'priya@fieldteam.org', role: 'Manager' },
  { email: 'admin@fieldteam.org', role: 'Admin' },
];

const DEMO_PASSWORD = 'demo1234';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function useDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl text-white shadow-lg">
            🍃
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Field Visit Debrief</h1>
          <p className="mt-2 text-sm text-slate-500">Sign in to capture and review field visits.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@fieldteam.org"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {busy && <Spinner className="h-4 w-4 text-white" />}
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="mt-5 rounded-xl border border-slate-200 bg-white/60 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Demo accounts - password <code className="text-slate-600">{DEMO_PASSWORD}</code>
          </p>
          <div className="flex flex-col gap-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                onClick={() => useDemo(a.email)}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-brand-50"
              >
                <span className="text-slate-700">{a.email}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {a.role}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
