import { db } from '../db';
import { newId } from '../lib/ids';
import type { Blocker, Debrief, FollowUp, SentimentLabel, ActionItem } from '../types';
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

export async function getDebriefByVisit(visitId: string): Promise<Debrief | null> {
    const rs = await db.execute({ sql: 'SELECT * FROM Debrief WHERE visitId = ?', args: [visitId] });
    const row = rs.rows[0] as unknown as DebriefRow | undefined;
    return row ? toDebrief(row) : null;
}

export async function getDebriefWithActions(
    visitId: string
): Promise<(Debrief & { actionItems: ActionItem[] }) | null> {
    const debrief = await getDebriefByVisit(visitId);
    if (!debrief) return null;
    const actionItems = await listActionsByDebrief(debrief.id);
    return { ...debrief, actionItems };
}

export async function getDebrief(id: string): Promise<Debrief | null> {
    const rs = await db.execute({ sql: 'SELECT * FROM Debrief WHERE id = ?', args: [id] });
    const row = rs.rows[0] as unknown as DebriefRow | undefined;
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
export async function upsertDebrief(visitId: string, input: DebriefInput): Promise<Debrief> {
    const existing = await getDebriefByVisit(visitId);
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
        await db.execute({
            sql: `UPDATE Debrief SET keyFindings = ?, blockers = ?, sentimentLabel = ?, sentimentScore = ?,
       sentimentRationale = ?, followUps = ?, aiModel = ?, editedByHuman = ? WHERE id = ?`,
            args: [
                JSON.stringify(merged.keyFindings),
                JSON.stringify(merged.blockers),
                merged.sentimentLabel,
                merged.sentimentScore,
                merged.sentimentRationale,
                JSON.stringify(merged.followUps),
                merged.aiModel,
                merged.editedByHuman ? 1 : 0,
                existing.id
            ]
        });
        return (await getDebrief(existing.id))!;
    }

    const id = newId();
    await db.execute({
        sql: `INSERT INTO Debrief (id, visitId, keyFindings, blockers, sentimentLabel, sentimentScore,
     sentimentRationale, followUps, aiModel, editedByHuman)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
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
        ]
    });
    return (await getDebrief(id))!;
}

export async function deleteDebrief(id: string): Promise<boolean> {
    const rs = await db.execute({ sql: 'DELETE FROM Debrief WHERE id = ?', args: [id] });
    return rs.rowsAffected > 0;
}