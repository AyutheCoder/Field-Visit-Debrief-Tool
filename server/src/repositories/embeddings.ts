import { db } from '../db';
import { newId } from '../lib/ids';

// Per-visit embedding vectors for semantic search. One row per visit
// (Embedding.visitId is UNIQUE). Vectors are stored as JSON number[].

interface EmbeddingRow {
    id: string;
    visitId: string;
    vector: string;
}

export interface VisitEmbedding {
    visitId: string;
    vector: number[];
}

function parseVector(json: string): number[] {
    try {
        const v = JSON.parse(json);
        return Array.isArray(v) ? (v as number[]) : [];
    } catch {
        return [];
    }
}

export async function getEmbedding(visitId: string): Promise<number[] | null> {
    const rs = await db.execute({ sql: 'SELECT * FROM Embedding WHERE visitId = ?', args: [visitId] });
    const row = rs.rows[0] as unknown as EmbeddingRow | undefined;
    return row ? parseVector(row.vector) : null;
}

export async function listEmbeddings(): Promise<VisitEmbedding[]> {
    const rs = await db.execute('SELECT * FROM Embedding');
    const rows = rs.rows as unknown as EmbeddingRow[];
    return rows.map((r) => ({ visitId: r.visitId, vector: parseVector(r.vector) }));
}

export async function upsertEmbedding(visitId: string, vector: number[]): Promise<void> {
    const rs = await db.execute({ sql: 'SELECT id FROM Embedding WHERE visitId = ?', args: [visitId] });
    const existing = rs.rows[0] as unknown as { id: string } | undefined;
    const json = JSON.stringify(vector);
    
    if (existing) {
        await db.execute({ sql: 'UPDATE Embedding SET vector = ? WHERE id = ?', args: [json, existing.id] });
    } else {
        await db.execute({ sql: 'INSERT INTO Embedding (id, visitId, vector) VALUES (?, ?, ?)', args: [newId(), visitId, json] });
    }
}

export async function deleteEmbedding(visitId: string): Promise<void> {
    await db.execute({ sql: 'DELETE FROM Embedding WHERE visitId = ?', args: [visitId] });
}