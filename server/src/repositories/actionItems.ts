import { db } from '../db';
import { newId } from '../lib/ids';
import { regionOf } from '../lib/region';
import type { ActionItem, Priority, ActionStatus } from '../types';

interface ActionRow {
    id: string;
    debriefId: string;
    description: string;
    owner: string | null;
    priority: string;
    dueDate: string | null;
    status: string;
    createdAt: string;
}

function toAction(row: ActionRow): ActionItem {
    return {
        ...row,
        priority: row.priority as Priority,
        status: row.status as ActionStatus,
    };
}

export function listActionsByDebrief(debriefId: string): ActionItem[] {
    const rows = db
        .prepare('SELECT * FROM ActionItem WHERE debriefId = ? ORDER BY createdAt')
        .all(debriefId) as unknown as ActionRow[];
    return rows.map(toAction);
}

export function listAllActions(): ActionItem[] {
    const rows = db
        .prepare('SELECT * FROM ActionItem ORDER BY createdAt DESC')
        .all() as unknown as ActionRow[];
    return rows.map(toAction);
}

// --- Enriched listing with visit context (for the Action Tracker) ---

export interface ActionWithContext extends ActionItem {
    visitId: string;
    locationName: string;
    region: string;
    programArea: string;
    visitDate: string;
}

export interface ActionFilters {
    status?: ActionStatus;
    region?: string;
    program?: string;
    overdue?: boolean;
}

interface ActionContextRow extends ActionRow {
    visitId: string;
    locationName: string;
    programArea: string;
    visitDate: string;
}

/** List every action item joined to its visit, with optional filtering. */
export function listActionsWithContext(filters: ActionFilters = {}): ActionWithContext[] {
    const rows = db
        .prepare(
            `SELECT a.*, v.id AS visitId, v.locationName, v.programArea, v.visitDate
       FROM ActionItem a
       JOIN Debrief d ON d.id = a.debriefId
       JOIN Visit v ON v.id = d.visitId
       ORDER BY 
         CASE a.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
         CASE a.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         (a.dueDate IS NULL), a.dueDate ASC`
        )
        .all() as unknown as ActionContextRow[];

    const today = new Date().toISOString().slice(0, 10);

    return rows
        .map((r) => ({
            ...toAction(r),
            visitId: r.visitId,
            locationName: r.locationName,
            region: regionOf(r.locationName),
            programArea: r.programArea,
            visitDate: r.visitDate,
        }))
        .filter((a) => {
            if (filters.status && a.status !== filters.status) return false;
            if (filters.program && a.programArea !== filters.program) return false;
            if (filters.region && a.region !== filters.region) return false;
            if (filters.overdue) {
                const due = a.dueDate?.slice(0, 10);
                if (!due || due >= today || a.status === 'done') return false;
            }
            return true;
        });
}

export function getAction(id: string): ActionItem | null {
    const row = db.prepare('SELECT * FROM ActionItem WHERE id = ?').get(id) as
        | ActionRow
        | undefined;
    return row ? toAction(row) : null;
}

/** Fetch a single action enriched with its visit context. */
export function getActionWithContext(id: string): ActionWithContext | null {
    const row = db
        .prepare(
            `SELECT a.*, v.id AS visitId, v.locationName, v.programArea, v.visitDate
       FROM ActionItem a
       JOIN Debrief d ON d.id = a.debriefId
       JOIN Visit v ON v.id = d.visitId
       WHERE a.id = ?`
        )
        .get(id) as unknown as ActionContextRow | undefined;

    if (!row) return null;
    return {
        ...toAction(row),
        visitId: row.visitId,
        locationName: row.locationName,
        region: regionOf(row.locationName),
        programArea: row.programArea,
        visitDate: row.visitDate,
    };
}

export interface ActionInput {
    description: string;
    owner?: string;
    priority?: Priority;
    dueDate?: string;
    status?: ActionStatus;
}

export function createAction(debriefId: string, input: ActionInput): ActionItem {
    const id = newId();
    db.prepare(
        `INSERT INTO ActionItem (id, debriefId, description, owner, priority, dueDate, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
        id,
        debriefId,
        input.description,
        input.owner ?? null,
        input.priority ?? 'medium',
        input.dueDate ?? null,
        input.status ?? 'open'
    );
    return getAction(id)!;
}

export function updateAction(id: string, input: Partial<ActionInput>): ActionItem | null {
    const existing = getAction(id);
    if (!existing) return null;
    db.prepare(
        `UPDATE ActionItem SET description = ?, owner = ?, priority = ?, dueDate = ?, status = ?
     WHERE id = ?`
    ).run(
        input.description ?? existing.description,
        input.owner ?? existing.owner,
        input.priority ?? existing.priority,
        input.dueDate ?? existing.dueDate,
        input.status ?? existing.status,
        id
    );
    return getAction(id);
}

export function deleteAction(id: string): boolean {
    const result = db.prepare('DELETE FROM ActionItem WHERE id = ?').run(id);
    return result.changes > 0;
}

/** Remove all action items belonging to a debrief (used when regenerating). */
export function deleteActionsByDebrief(debriefId: string): number {
    const result = db.prepare('DELETE FROM ActionItem WHERE debriefId = ?').run(debriefId);
    return Number(result.changes);
}