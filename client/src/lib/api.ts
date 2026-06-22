import type {
  ActionUpdate,
  ActionWithContext,
  AlertsResponse,
  ChatResponse,
  CreateVisitInput,
  DebriefWithActions,
  MediaAsset,
  PatternsResponse,
  SaveDebriefInput,
  SearchMode,
  SearchResponse,
  TranscribeResponse,
  User,
  Visit,
  VisitWithRelations,
  VoiceIntakeResponse,
} from '../types';

// In dev, Vite proxies /api to the backend (see vite.config.ts).
// In production, optionally override with VITE_API_BASE_URL.
const BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '';

// --- Auth token (set on login, cleared on logout) ---
let authToken: string | null = null;

/** Set or clear the bearer token sent with every request. */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/** Headers including Authorization (and optional extras). */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return headers;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseError(res: Response): Promise<never> {
  let message = `Request failed (${res.status})`;
  try {
    const data = await res.json();
    if (data?.error) message = data.error;
  } catch {
    /* ignore non-JSON bodies */
  }
  throw new ApiError(res.status, message);
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) return parseError(res);
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) return parseError(res);
  return res.json() as Promise<T>;
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) return parseError(res);
  return res.json() as Promise<T>;
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) return parseError(res);
  return res.json() as Promise<T>;
}

export const api = {
  // --- Auth ---
  /** Log in with email + shared demo password. */
  login: (email: string, password: string) =>
    postJson<{ token: string; user: User }>('/api/auth/login', { email, password }),

  /** Fetch the currently authenticated user (requires a token). */
  me: () => getJson<{ user: User }>('/api/auth/me'),

  listVisits: () => getJson<Visit[]>('/api/visits'),
  getVisit: (id: string) => getJson<VisitWithRelations>(`/api/visits/${id}`),
  createVisit: (input: CreateVisitInput) =>
    postJson<VisitWithRelations>('/api/visits', input),

  /** Enriched visit feed for the manager dashboard. */
  dashboardVisits: () => getJson<VisitWithRelations[]>('/api/dashboard/visits'),

  /** Recurring issue patterns clustered across visits. */
  patterns: () => getJson<PatternsResponse>('/api/patterns'),

  /** All action items enriched with visit context, with optional filters. */
  listActions: (filters?: {
    status?: string;
    region?: string;
    program?: string;
    overdue?: boolean;
  }) => {
    const p = new URLSearchParams();
    if (filters?.status) p.set('status', filters.status);
    if (filters?.region) p.set('region', filters.region);
    if (filters?.program) p.set('program', filters.program);
    if (filters?.overdue) p.set('overdue', 'true');
    const qs = p.toString();
    return getJson<ActionWithContext[]>(`/api/actions${qs ? `?${qs}` : ''}`);
  },

  /** Update an action item (status, owner, priority, due date, description). */
  updateAction: (id: string, patch: ActionUpdate) =>
    patchJson<ActionWithContext>(`/api/actions/${id}`, patch),

  /** Keyword or semantic search across visits. */
  search: (params: {
    q: string;
    mode: SearchMode;
    region?: string;
    program?: string;
    refresh?: boolean;
  }) => {
    const p = new URLSearchParams({ q: params.q, mode: params.mode });
    if (params.region) p.set('region', params.region);
    if (params.program) p.set('program', params.program);
    if (params.refresh) p.set('refresh', 'true');
    return getJson<SearchResponse>(`/api/search?${p.toString()}`);
  },

  /** Upload a single photo or audio file to a visit. */
  async uploadMedia(visitId: string, file: Blob, filename: string, caption?: string) {
    const form = new FormData();
    form.append('file', file, filename);
    if (caption) form.append('caption', caption);
    const res = await fetch(`${BASE}/api/visits/${visitId}/upload`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
    if (!res.ok) return parseError(res);
    return res.json() as Promise<MediaAsset>;
  },

  // --- AI ---
  /** Transcribe a visit's audio clips (no-op-safe if already transcribed). */
  transcribeVisit: (visitId: string) =>
    postJson<TranscribeResponse>(`/api/visits/${visitId}/transcribe`, {}),

  /** Generate (or regenerate) the AI debrief for a visit. */
  generateDebrief: (visitId: string) =>
    postJson<DebriefWithActions>(`/api/visits/${visitId}/debrief`, {}),

  /** Save human-edited debrief content. */
  saveDebrief: (visitId: string, input: SaveDebriefInput) =>
    putJson<DebriefWithActions>(`/api/visits/${visitId}/debrief`, input),

  // --- Differentiators ---
  /** Voice-only intake: transcribe a memo and auto-fill the structured form. */
  async voiceIntake(blob: Blob, filename: string) {
    const form = new FormData();
    form.append('file', blob, filename);
    const res = await fetch(`${BASE}/api/intake/voice`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
    if (!res.ok) return parseError(res);
    return res.json() as Promise<VoiceIntakeResponse>;
  },

  /** Early-warning alerts: blocker spikes by region. */
  alerts: () => getJson<AlertsResponse>('/api/alerts'),

  /** RAG assistant: ask a question across all debriefs. */
  chat: (question: string) => postJson<ChatResponse>('/api/chat', { question }),
};

/** Absolute URL for a stored media path like "/uploads/abc.png". */
export function mediaUrl(path: string): string {
  return `${BASE}${path}`;
}
