import { db } from '../db';
import { newId } from '../lib/ids';
import type { Stakeholder } from '../types';

interface StakeholderRow {
    id: string;
    visitId: string;
    name: string;
    role: string | null;
    organization: string | null;
}

function toStakeholder(row: StakeholderRow): Stakeholder {
    return row;
}

export function listStakeholders(visitId: string): Stakeholder[] {
    const rows = db
        .prepare('SELECT * FROM Stakeholder WHERE visitId = ? ORDER BY name')
        .all(visitId) as StakeholderRow[];
    return rows.map(toStakeholder);
}

export function getStakeholder(id: string): Stakeholder | null {
    const row = db.prepare('SELECT * FROM Stakeholder WHERE id = ?').get(id) as
        | StakeholderRow
        | undefined;
    return row ? toStakeholder(row) : null;
}

export interface StakeholderInput {
    name: string;
    role?: string;
    organization?: string;
}

export function createStakeholder(visitId: string, input: StakeholderInput): Stakeholder {
    const id = newId();
    db.prepare(
        'INSERT INTO Stakeholder (id, visitId, name, role, organization) VALUES (?, ?, ?, ?, ?)'
    ).run(id, visitId, input.name, input.role ?? null, input.organization ?? null);
    return getStakeholder(id)!;
}

export function updateStakeholder(id: string, input: Partial<StakeholderInput>): Stakeholder | null {
    const existing = getStakeholder(id);
    if (!existing) return null;
    db.prepare(
        'UPDATE Stakeholder SET name = ?, role = ?, organization = ? WHERE id = ?'
    ).run(
        input.name ?? existing.name,
        input.role ?? existing.role,
        input.organization ?? existing.organization,
        id
    );
    return getStakeholder(id);
}

export function deleteStakeholder(id: string): boolean {
    const result = db.prepare('DELETE FROM Stakeholder WHERE id = ?').run(id);
    return result.changes > 0;
}