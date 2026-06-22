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

export function listVisVisits(filters: VisitFilters = {}): Visit[] {
    const clauses: string[] = [];
    const params: unknown[] = [];

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
    const rows = db
        .prepare(
            `SELECT v.* FROM Visit v
       LEFT JOIN Debrief d ON d.visitId = v.id
       ${where}
       ORDER BY v.visitDate DESC`
        )
        .all(...params) as VisitRow[];
    return rows.map(toVisit);
}

export function getVisit(id: string): Visit | null {
    const row = db.prepare('SELECT * FROM Visit WHERE id = ?').get(id) as VisitRow | undefined;
    return row ? toVisit(row) : null;
}

export function getVisitWithRelations(id: string): VisitWithRelations | null {
    const visit = getVisit(id);
    if (!visit) return null;
    return {
        ...visit,
        stakeholders: listStakeholders(id),
        media: listMedia(id),
        debrief: getDebriefWithActions(id),
    };
}

/** List visits enriched with their full relations (for the dashboard). */
export function listVisitsWithRelations(filters: VisitFilters = {}): VisitWithRelations[] {
    return listVisVisits(filters).map((v) => getVisitWithRelations(v.id)!);
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

export function createVisit(input: VisitInput): VisitWithRelations {
    const id = newId();
    db.prepare(
        `INSERT INTO Visit (id, userId, locationName, lat, lng, visitDate, programArea,
     visitType, rawNotesText, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
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
    );

    for (const s of input.stakeholders ?? []) {
        createStakeholder(id, s);
    }

    return getVisitWithRelations(id)!;
}

export type VisitUpdate = Partial<Omit<VisitInput, 'stakeholders'>> & { syncedAt?: string };

export function updateVisit(id: string, input: VisitUpdate): Visit | null {
    const existing = getVisit(id);
    if (!existing) return null;
    db.prepare(
        `UPDATE Visit SET userId = ?, locationName = ?, lat = ?, lng = ?, visitDate = ?,
     programArea = ?, visitType = ?, rawNotesText = ?, status = ?, syncedAt = ?
     WHERE id = ?`
    ).run(
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
    );
    return getVisit(id);
}

export function deleteVisit(id: string): boolean {
    const result = db.prepare('DELETE FROM Visit WHERE id = ?').run(id);
    return result.changes > 0;
}