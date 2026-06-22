import { db } from '../db';
import { newId } from '../lib/ids';

// The Pattern table (schema.sql) has single `geography` / `program` columns; a
// cluster can span several regions/programs, so we store those as JSON arrays.

interface PatternRow {
    id: string;
    type: string;
    label: string;
    geography: string | null;
    program: string | null;
    count: number;
    visitIds: string;
    period: string | null;
    createdAt: string;
}

export interface StoredPattern {
    id: string;
    type: string;
    label: string;
    regions: string[];
    programs: string[];
    count: number;
    visitIds: string[];
    period: string | null;
    createdAt: string;
}

function parseArray(json: string | null): string[] {
    if (!json) return [];
    try {
        const v = JSON.parse(json);
        return Array.isArray(v) ? (v as string[]) : [];
    } catch {
        return [];
    }
}

function toStored(row: PatternRow): StoredPattern {
    return {
        id: row.id,
        type: row.type,
        label: row.label,
        regions: parseArray(row.geography),
        programs: parseArray(row.program),
        count: row.count,
        visitIds: parseArray(row.visitIds),
        period: row.period,
        createdAt: row.createdAt,
    };
}

export async function listPatterns(): Promise<StoredPattern[]> {
    const rs = await db.execute('SELECT * FROM Pattern ORDER BY count DESC, label ASC');
    return (rs.rows as unknown as PatternRow[]).map(toStored);
}

export interface NewPattern {
    type: string;
    label: string;
    regions: string[];
    programs: string[];
    count: number;
    visitIds: string[];
    period?: string | null;
}

/** Replace the entire Pattern table with a freshly computed set. */
export async function replaceAllPatterns(items: NewPattern[]): Promise<void> {
    await db.execute('DELETE FROM Pattern;');
    const stmts = items.map(p => ({
        sql: `INSERT INTO Pattern (id, type, label, geography, program, count, visitIds, period)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
            newId(),
            p.type,
            p.label,
            JSON.stringify(p.regions),
            JSON.stringify(p.programs),
            p.count,
            JSON.stringify(p.visitIds),
            p.period ?? null
        ]
    }));
    
    if (stmts.length > 0) {
        await db.batch(stmts, 'write');
    }
}