import { useCallback, useEffect, useState } from 'react';
import CaptureScreen from './components/CaptureScreen';
import DebriefReview from './components/DebriefReview';
import ManagerDashboard from './components/ManagerDashboard';
import InsightsPage from './components/InsightsPage';
import ActionTracker from './components/ActionTracker';
import SearchPage from './components/SearchPage';
import ChatPage from './components/ChatPage';
import LoginScreen from './components/LoginScreen';
import { Spinner } from './components/ui/Spinner';
import { useAuth } from './lib/auth';
import { useToast } from './components/ui/Toast';
import { countQueued, onQueueChange } from './lib/offline';
import { syncQueuedVisits } from './lib/sync';
import ThemePicker from './components/ThemePicker';
import type { Role } from './types';

type ViewName =
  | 'capture'
  | 'review'
  | 'dashboard'
  | 'insights'
  | 'actions'
  | 'search'
  | 'assistant';

type View =
  | { name: 'capture' }
  | { name: 'review'; visitId: string }
  | { name: 'dashboard' }
  | { name: 'insights' }
  | { name: 'actions' }
  | { name: 'search' }
  | { name: 'assistant' };

interface TabDef {
  name: Exclude<ViewName, 'review'>;
  label: string;
  subtitle: string;
  roles: Role[];
}

const ALL_ROLES: Role[] = ['field_officer', 'manager', 'admin'];
const MANAGEMENT: Role[] = ['manager', 'admin'];

const TABS: TabDef[] = [
  { name: 'capture', label: 'Capture', subtitle: 'Log a new visit', roles: ALL_ROLES },
  { name: 'dashboard', label: 'Dashboard', subtitle: 'Manager dashboard', roles: MANAGEMENT },
  { name: 'insights', label: 'Insights', subtitle: 'Cross-visit insights', roles: MANAGEMENT },
  { name: 'actions', label: 'Actions', subtitle: 'Action tracker', roles: ALL_ROLES },
  { name: 'search', label: 'Search', subtitle: 'Search visits', roles: ALL_ROLES },
  { name: 'assistant', label: 'Assistant', subtitle: 'Ask the assistant', roles: MANAGEMENT },
];

// --- Connectivity + offline queue hooks ---

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function usePendingCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      countQueued()
        .then((n) => active && setCount(n))
        .catch(() => {});
    };
    refresh();
    const unsub = onQueueChange(refresh);
    const onOnline = () => refresh();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOnline);
    return () => {
      active = false;
      unsub();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOnline);
    };
  }, []);
  return count;
}

export default function App() {
  const { user, loading, logout } = useAuth();
  const toast = useToast();
  const [view, setView] = useState<View>({ name: 'capture' });
  const online = useOnline();
  const pending = usePendingCount();

  const visibleTabs = TABS.filter((t) => (user ? t.roles.includes(user.role) : false));

  // Keep the current view valid for the user's role.
  useEffect(() => {
    if (!user) return;
    if (view.name === 'review') return;
    const allowed = visibleTabs.some((t) => t.name === view.name);
    if (!allowed && visibleTabs.length) {
      setView({ name: visibleTabs[0].name } as View);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Sync queued offline visits when we come back online (and on load).
  const runSync = useCallback(async () => {
    if (!navigator.onLine) return;
    const synced = await syncQueuedVisits();
    if (synced > 0) toast.success(`Synced ${synced} offline visit(s)`);
  }, [toast]);

  useEffect(() => {
    if (!user) return;
    void runSync();
    const onOnline = () => void runSync();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [user, runSync]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const activeTab =
    view.name === 'review'
      ? TABS.find((t) => t.name === 'capture')!
      : (TABS.find((t) => t.name === view.name) ?? TABS[0]);

  return (
    <div className="min-h-full bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-lg">
            📍
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold leading-tight text-gray-900 truncate">
              Field Visit Debrief
            </h1>
            <p className="text-xs text-gray-500 truncate hidden sm:block">{activeTab.subtitle}</p>
          </div>

          <nav className="flex gap-1 rounded-lg bg-gray-100 p-1 overflow-x-auto whitespace-nowrap hide-scrollbar max-w-[50vw] sm:max-w-none">
            {visibleTabs.map((t) => (
              <TabButton
                key={t.name}
                active={view.name === t.name || (t.name === 'capture' && view.name === 'review')}
                onClick={() => setView({ name: t.name } as View)}
              >
                {t.label}
              </TabButton>
            ))}
          </nav>

          <div className="flex items-center gap-2 pl-1">
            {(!online || pending > 0) && (
              <span
                title={online ? 'Visits waiting to sync' : 'You are offline'}
                className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                  online ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${online ? 'bg-amber-500' : 'bg-slate-400'}`}
                />
                {online ? `${pending} pending` : 'Offline'}
              </span>
            )}
            <ThemePicker />
            <UserMenu
              name={user.name}
              role={user.role}
              onLogout={logout}
            />
          </div>
        </div>
      </header>

      <main>
        {view.name === 'capture' && (
          <CaptureScreen onCreated={(visit: any) => setView({ name: 'review', visitId: visit.id })} />
        )}
        {view.name === 'review' && (
          <DebriefReview visitId={view.visitId} onDone={() => setView({ name: 'capture' })} />
        )}
        {view.name === 'dashboard' && <ManagerDashboard />}
        {view.name === 'insights' && <InsightsPage />}
        {view.name === 'actions' && <ActionTracker />}
        {view.name === 'search' && <SearchPage />}
        {view.name === 'assistant' && <ChatPage />}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
        active ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

const ROLE_LABELS: Record<Role, string> = {
  field_officer: 'Field officer',
  manager: 'Manager',
  admin: 'Admin',
};

function UserMenu({
  name,
  role,
  onLogout,
}: {
  name: string;
  role: Role;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-200"
        title={`${name} · ${ROLE_LABELS[role]}`}
      >
        {initials || '?'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
            <div className="border-b border-gray-100 px-3 py-2">
              <p className="text-sm font-semibold text-gray-900">{name}</p>
              <p className="text-xs text-gray-500">{ROLE_LABELS[role]}</p>
            </div>
            <button
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
