import { db } from '../db';
import { newId } from '../lib/ids';
import type { Blocker, Debrief, FollowUp, SentimentLabel } from '../types';
import { listActionsByDebrief } from './actionItems';

interface DebriefRow {
    id: string;
    visitId: string;
    keyFindings: string;
    blockers: string;
    sentimentLabel: string | null;
    sentimentScore: number | null;
    sentimentRationale: string | null;
    followUps: string;
    aiModel: string | null;
    editedByHuman: number;
    createdAt: string;
}

function safeParse<T>(json: string, fallback: T): T {
    try {
        return JSON.parse(json) as T;
    } catch {
        return fallback;
    }
}

function toDebrief(row: DebriefRow): Debrief {
    return {
        id: row.id,
        visitId: row.visitId,
        keyFindings: safeParse<string[]>(row.keyFindings, []),
        blockers: safeParse<Blocker[]>(row.blockers, []),
        sentimentLabel: row.sentimentLabel as SentimentLabel | null,
        sentimentScore: row.sentimentScore,
        sentimentRationale: row.sentimentRationale,
        followUps: safeParse<FollowUp[]>(row.followUps, []),
        aiModel: row.aiModel,
        editedByHuman: row.editedByHuman === 1,
        createdAt: row.createdAt,
    };
}

export function getDebriefByVisit(visitId: string): Debrief | null {
    const row = db.prepare('SELECT * FROM Debrief WHERE visitId = ?').get(visitId) as
        | DebriefRow
        | undefined;

    return row ? toDebrief(row) : null;
}

export function getDebriefWithActions(
    visitId: string
): (Debrief & { actionItems: ReturnType<typeof listActionsByDebrief> }) | null {
    const debrief = getDebriefByVisit(visitId);
    if (!debrief) return null;
    return { ...debrief, actionItems: listActionsByDebrief(debrief.id) };
}

export function getDebrief(id: string): Debrief | null {
    const row = db.prepare('SELECT * FROM Debrief WHERE id = ?').get(id) as DebriefRow | undefined;
    return row ? toDebrief(row) : null;
}

export interface DebriefInput {
    keyFindings?: string[];
    blockers?: Blocker[];
    sentimentLabel?: SentimentLabel | null;
    sentimentScore?: number | null;
    sentimentRationale?: string | null;
    followUps?: FollowUp[];
    aiModel?: string | null;
    editedByHuman?: boolean;
}

/** Create or replace the debrief for a visit (one debrief per visit). */
export function upsertDebrief(visitId: string, input: DebriefInput): Debrief {
    const existing = getDebriefByVisit(visitId);
    const merged: Required<DebriefInput> = {
        keyFindings: input.keyFindings ?? existing?.keyFindings ?? [],
        blockers: input.blockers ?? existing?.blockers ?? [],
        sentimentLabel: input.sentimentLabel ?? existing?.sentimentLabel ?? null,
        sentimentScore: input.sentimentScore ?? existing?.sentimentScore ?? null,
        sentimentRationale: input.sentimentRationale ?? existing?.sentimentRationale ?? null,
        followUps: input.followUps ?? existing?.followUps ?? [],
        aiModel: input.aiModel ?? existing?.aiModel ?? null,
        editedByHuman: input.editedByHuman ?? existing?.editedByHuman ?? false,
    };

    if (existing) {
        db.prepare(
            `UPDATE Debrief SET keyFindings = ?, blockers = ?, sentimentLabel = ?, sentimentScore = ?,
       sentimentRationale = ?, followUps = ?, aiModel = ?, editedByHuman = ? WHERE id = ?`
        ).run(
            JSON.stringify(merged.keyFindings),
            JSON.stringify(merged.blockers),
            merged.sentimentLabel,
            merged.sentimentScore,
            merged.sentimentRationale,
            JSON.stringify(merged.followUps),
            merged.aiModel,
            merged.editedByHuman ? 1 : 0,
            existing.id
        );
        return getDebrief(existing.id)!;
    }

    const id = newId();
    db.prepare(
        `INSERT INTO Debrief (id, visitId, keyFindings, blockers, sentimentLabel, sentimentScore,
     sentimentRationale, followUps, aiModel, editedByHuman)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        id,
        visitId,
        JSON.stringify(merged.keyFindings),
        JSON.stringify(merged.blockers),
        merged.sentimentLabel,
        merged.sentimentScore,
        merged.sentimentRationale,
        JSON.stringify(merged.followUps),
        merged.aiModel,
        merged.editedByHuman ? 1 : 0
    );
    return getDebrief(id)!;
}

export function deleteDebrief(id: string): boolean {
    const result = db.prepare('DELETE FROM Debrief WHERE id = ?').run(id);
    return result.changes > 0;
}