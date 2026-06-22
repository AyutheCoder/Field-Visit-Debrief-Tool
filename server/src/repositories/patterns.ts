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

export function listPatterns(): StoredPattern[] {
    const rows = db
        .prepare('SELECT * FROM Pattern ORDER BY count DESC, label ASC')
        .all() as PatternRow[];
    return rows.map(toStored);
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
export function replaceAllPatterns(items: NewPattern[]): void {
    db.exec('DELETE FROM Pattern;');
    const stmt = db.prepare(
        `INSERT INTO Pattern (id, type, label, geography, program, count, visitIds, period)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const p of items) {
        stmt.run(
            newId(),
            p.type,
            p.label,
            JSON.stringify(p.regions),
            JSON.stringify(p.programs),
            p.count,
            JSON.stringify(p.visitIds),
            p.period ?? null
        );
    }
}