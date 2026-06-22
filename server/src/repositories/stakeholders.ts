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

export async function listStakeholders(visitId: string): Promise<Stakeholder[]> {
    const rs = await db.execute({ sql: 'SELECT * FROM Stakeholder WHERE visitId = ? ORDER BY name', args: [visitId] });
    return (rs.rows as unknown as StakeholderRow[]).map(toStakeholder);
}

export async function getStakeholder(id: string): Promise<Stakeholder | null> {
    const rs = await db.execute({ sql: 'SELECT * FROM Stakeholder WHERE id = ?', args: [id] });
    const row = rs.rows[0] as unknown as StakeholderRow | undefined;
    return row ? toStakeholder(row) : null;
}

export interface StakeholderInput {
    name: string;
    role?: string;
    organization?: string;
}

export async function createStakeholder(visitId: string, input: StakeholderInput): Promise<Stakeholder> {
    const id = newId();
    await db.execute({
        sql: 'INSERT INTO Stakeholder (id, visitId, name, role, organization) VALUES (?, ?, ?, ?, ?)',
        args: [id, visitId, input.name, input.role ?? null, input.organization ?? null]
    });
    return (await getStakeholder(id))!;
}

export async function updateStakeholder(id: string, input: Partial<StakeholderInput>): Promise<Stakeholder | null> {
    const existing = await getStakeholder(id);
    if (!existing) return null;
    await db.execute({
        sql: 'UPDATE Stakeholder SET name = ?, role = ?, organization = ? WHERE id = ?',
        args: [
            input.name ?? existing.name,
            input.role ?? existing.role,
            input.organization ?? existing.organization,
            id
        ]
    });
    return await getStakeholder(id);
}

export async function deleteStakeholder(id: string): Promise<boolean> {
    const rs = await db.execute({ sql: 'DELETE FROM Stakeholder WHERE id = ?', args: [id] });
    return rs.rowsAffected > 0;
}