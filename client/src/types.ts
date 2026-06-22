// Shared client-side types (mirror the server API responses).

export type Role = 'field_officer' | 'manager' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface Stakeholder {
  id: string;
  visitId: string;
  name: string;
  role: string | null;
  organization: string | null;
}

export interface MediaAsset {
  id: string;
  visitId: string;
  type: 'photo' | 'audio';
  url: string;
  caption: string | null;
  transcript: string | null;
  createdAt: string;
}

export type SentimentLabel = 'positive' | 'neutral' | 'negative';
export type Priority = 'high' | 'medium' | 'low';
export type ActionStatus = 'open' | 'in_progress' | 'done';

export type BlockerCategory =
  | 'infrastructure'
  | 'supply'
  | 'staffing'
  | 'community'
  | 'funding'
  | 'other';

export interface Blocker {
  issue: string;
  category: BlockerCategory;
}

export interface FollowUp {
  action: string;
  priority: Priority;
  owner_suggestion?: string;
}

export interface ActionItem {
  id: string;
  debriefId: string;
  description: string;
  owner: string | null;
  priority: Priority;
  dueDate: string | null;
  status: ActionStatus;
  createdAt: string;
}

export interface Debrief {
  id: string;
  visitId: string;
  keyFindings: string[];
  blockers: Blocker[];
  sentimentLabel: SentimentLabel | null;
  sentimentScore: number | null;
  sentimentRationale: string | null;
  followUps: FollowUp[];
  aiModel: string | null;
  editedByHuman: boolean;
  createdAt: string;
  actionItems?: ActionItem[];
}

export interface Visit {
  id: string;
  userId: string | null;
  locationName: string;
  lat: number | null;
  lng: number | null;
  visitDate: string;
  programArea: string;
  visitType: string | null;
  rawNotesText: string | null;
  status: string;
  createdAt: string;
  syncedAt: string | null;
}

export interface VisitWithRelations extends Visit {
  stakeholders: Stakeholder[];
  media: MediaAsset[];
  debrief: DebriefWithActions | null;
}

export interface DebriefWithActions extends Debrief {
  actionItems: ActionItem[];
}

export interface TranscriptionResult {
  mediaId: string;
  url: string;
  transcript: string;
}

export interface TranscribeResponse {
  visitId: string;
  transcriptions: TranscriptionResult[];
}

/** Payload for saving human-edited debrief content. */
export interface SaveDebriefInput {
  keyFindings: string[];
  blockers: Blocker[];
  sentimentLabel: SentimentLabel | null;
  sentimentScore: number | null;
  sentimentRationale: string | null;
  followUps: FollowUp[];
  editedByHuman: boolean;
}

// Input used when creating a visit
export interface StakeholderInput {
  name: string;
  role?: string;
  organization?: string;
}

export interface CreateVisitInput {
  locationName: string;
  programArea: string;
  lat?: number;
  lng?: number;
  visitDate?: string;
  visitType?: string;
  rawNotesText?: string;
  stakeholders?: StakeholderInput[];
}

// --- Pattern detection (Insights) ---

export interface IssuePattern {
  id: string;
  label: string;
  category: BlockerCategory;
  /** Distinct visits contributing to this pattern. */
  count: number;
  /** Total issue mentions across contributing visits. */
  occurrences: number;
  /** Distinct phrasings merged into this pattern. */
  variants: string[];
  regions: string[];
  programs: string[];
  visitIds: string[];
}

export interface PatternsResponse {
  patterns: IssuePattern[];
  method: 'semantic' | 'lexical';
  generatedAt: string;
  visitsAnalyzed: number;
}

// --- Action Tracker ---

export interface ActionWithContext extends ActionItem {
  visitId: string;
  locationName: string;
  region: string;
  programArea: string;
  visitDate: string;
}

export interface ActionUpdate {
  status?: ActionStatus;
  owner?: string;
  priority?: Priority;
  dueDate?: string;
  description?: string;
}

// --- Search ---

export type SearchMode = 'keyword' | 'semantic';

export interface SearchResultItem {
  visit: VisitWithRelations;
  score: number | null;
  snippet: string;
  matchedIn: string[];
}

export interface SearchResponse {
  query: string;
  requestedMode: SearchMode;
  mode: SearchMode;
  note?: string;
  results: SearchResultItem[];
}

// --- Voice-only intake (auto-fill) ---

export interface VoiceIntakeStakeholder {
  name: string;
  role: string;
  organization: string;
}

export interface VoiceIntakeFields {
  locationName: string;
  programArea: string;
  visitType: string;
  notes: string;
  stakeholders: VoiceIntakeStakeholder[];
}

export interface VoiceIntakeResponse {
  transcript: string;
  fields: VoiceIntakeFields;
}

// --- Anomaly / early-warning alerts ---

export type AlertSeverity = 'high' | 'medium';

export interface AlertItem {
  id: string;
  region: string;
  category: BlockerCategory;
  label: string;
  recentCount: number;
  baselineCount: number;
  baselinePerWeek: number;
  severity: AlertSeverity;
  visitIds: string[];
  sampleIssues: string[];
  message: string;
}

export interface AlertsResponse {
  generatedAt: string;
  recentWindowDays: number;
  baselineWindowDays: number;
  alerts: AlertItem[];
}

// --- RAG assistant ---

export interface ChatSource {
  visitId: string;
  locationName: string;
  region: string;
  programArea: string;
  visitDate: string;
}

export interface ChatResponse {
  question: string;
  answer: string;
  mode: 'rag' | 'summary';
  note?: string;
  sources: ChatSource[];
}
