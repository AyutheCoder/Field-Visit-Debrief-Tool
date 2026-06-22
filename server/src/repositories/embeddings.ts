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

export function getEmbedding(visitId: string): number[] | null {
    const row = db.prepare('SELECT * FROM Embedding WHERE visitId = ?').get(visitId) as
        | EmbeddingRow
        | undefined;
    return row ? parseVector(row.vector) : null;
}

export function listEmbeddings(): VisitEmbedding[] {
    const rows = db.prepare('SELECT * FROM Embedding').all() as EmbeddingRow[];
    return rows.map((r) => ({ visitId: r.visitId, vector: parseVector(r.vector) }));
}

export function upsertEmbedding(visitId: string, vector: number[]): void {
    const existing = db.prepare('SELECT id FROM Embedding WHERE visitId = ?').get(visitId) as
        | { id: string }
        | undefined;
    const json = JSON.stringify(vector);
    if (existing) {
        db.prepare('UPDATE Embedding SET vector = ? WHERE id = ?').run(json, existing.id);
    } else {
        db.prepare('INSERT INTO Embedding (id, visitId, vector) VALUES (?, ?, ?)')
            .run(newId(), visitId, json);
    }
}

export function deleteEmbedding(visitId: string): void {
    db.prepare('DELETE FROM Embedding WHERE visitId = ?').run(visitId);
}