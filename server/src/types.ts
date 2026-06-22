// // Domain types for the Field Visit Debrief Tool.
// // These mirror the SQLite schema (see src/db/schema.sql), with JSON columns
// // represented as parsed structures.

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

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export type Priority = 'high' | 'medium' | 'low';

export interface FollowUp {
    action: string;
    priority: Priority;
    owner_suggestion?: string;
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
}

export type ActionStatus = 'open' | 'in_progress' | 'done';

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
    debrief: (Debrief & { actionItems: ActionItem[] }) | null;
}