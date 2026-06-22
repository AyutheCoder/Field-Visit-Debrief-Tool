import { db } from '../db';
import { newId } from '../lib/ids';
import type { Visit, VisitWithRelations } from '../types';
import { listStakeholders, createStakeholder, type StakeholderInput } from './stakeholders';
import { listMedia } from './media';
import { getDebriefWithActions } from './debriefs';

interface VisitRow {
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

function toVisit(row: VisitRow): Visit {
    return row;
}

export interface VisitFilters {
    programArea?: string;
    location?: string;
    sentiment?: string;
    from?: string;
    to?: string;
}

export async function listVisits(filters: VisitFilters = {}): Promise<Visit[]> {
    const clauses: string[] = [];
    const params: any[] = [];

    if (filters.programArea) {
        clauses.push('v.programArea = ?');
        params.push(filters.programArea);
    }
    if (filters.location) {
        clauses.push('v.locationName LIKE ?');
        params.push(`%${filters.location}%`);
    }
    if (filters.from) {
        clauses.push('v.visitDate >= ?');
        params.push(filters.from);
    }
    if (filters.to) {
        clauses.push('v.visitDate <= ?');
        params.push(filters.to);
    }
    if (filters.sentiment) {
        clauses.push('d.sentimentLabel = ?');
        params.push(filters.sentiment);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT v.* FROM Visit v
       LEFT JOIN Debrief d ON d.visitId = v.id
       ${where}
       ORDER BY v.visitDate DESC`;

    const rs = await db.execute({ sql, args: params });
    return (rs.rows as unknown as VisitRow[]).map(toVisit);
}

export async function getVisit(id: string): Promise<Visit | null> {
    const rs = await db.execute({ sql: 'SELECT * FROM Visit WHERE id = ?', args: [id] });
    const row = rs.rows[0] as unknown as VisitRow | undefined;
    return row ? toVisit(row) : null;
}

export async function getVisitWithRelations(id: string): Promise<VisitWithRelations | null> {
    const visit = await getVisit(id);
    if (!visit) return null;
    const [stakeholders, media, debrief] = await Promise.all([
        listStakeholders(id),
        listMedia(id),
        getDebriefWithActions(id)
    ]);
    return {
        ...visit,
        stakeholders,
        media,
        debrief,
    };
}

/** List visits enriched with their full relations (for the dashboard). */
export async function listVisitsWithRelations(filters: VisitFilters = {}): Promise<VisitWithRelations[]> {
    const visits = await listVisits(filters);
    return Promise.all(visits.map(v => getVisitWithRelations(v.id).then(r => r!)));
}

export interface VisitInput {
    userId?: string;
    locationName: string;
    lat?: number;
    lng?: number;
    visitDate?: string;
    programArea: string;
    visitType?: string;
    rawNotesText?: string;
    status?: string;
    stakeholders?: StakeholderInput[];
}

export async function createVisit(input: VisitInput): Promise<VisitWithRelations> {
    const id = newId();
    await db.execute({
        sql: `INSERT INTO Visit (id, userId, locationName, lat, lng, visitDate, programArea,
     visitType, rawNotesText, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
            id,
            input.userId ?? null,
            input.locationName,
            input.lat ?? null,
            input.lng ?? null,
            input.visitDate ?? new Date().toISOString(),
            input.programArea,
            input.visitType ?? null,
            input.rawNotesText ?? null,
            input.status ?? 'synced'
        ]
    });

    if (input.stakeholders && input.stakeholders.length > 0) {
        await Promise.all(input.stakeholders.map(s => createStakeholder(id, s)));
    }

    return (await getVisitWithRelations(id))!;
}

export type VisitUpdate = Partial<Omit<VisitInput, 'stakeholders'>> & { syncedAt?: string };

export async function updateVisit(id: string, input: VisitUpdate): Promise<Visit | null> {
    const existing = await getVisit(id);
    if (!existing) return null;
    await db.execute({
        sql: `UPDATE Visit SET userId = ?, locationName = ?, lat = ?, lng = ?, visitDate = ?,
     programArea = ?, visitType = ?, rawNotesText = ?, status = ?, syncedAt = ?
     WHERE id = ?`,
        args: [
            input.userId ?? existing.userId,
            input.locationName ?? existing.locationName,
            input.lat ?? existing.lat,
            input.lng ?? existing.lng,
            input.visitDate ?? existing.visitDate,
            input.programArea ?? existing.programArea,
            input.visitType ?? existing.visitType,
            input.rawNotesText ?? existing.rawNotesText,
            input.status ?? existing.status,
            input.syncedAt ?? existing.syncedAt,
            id
        ]
    });
    return await getVisit(id);
}

export async function deleteVisit(id: string): Promise<boolean> {
    const rs = await db.execute({ sql: 'DELETE FROM Visit WHERE id = ?', args: [id] });
    return rs.rowsAffected > 0;
}