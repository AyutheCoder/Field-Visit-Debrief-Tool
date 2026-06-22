import { db } from '../db';
import { newId } from '../lib/ids';
import type { MediaAsset } from '../types';

interface MediaRow {
    id: string;
    visitId: string;
    type: string;
    url: string;
    caption: string | null;
    transcript: string | null;
    createdAt: string;
}

function toMedia(row: MediaRow): MediaAsset {
    return { ...row, type: row.type as MediaAsset['type'] };
}

export function listMedia(visitId: string): MediaAsset[] {
    const rows = db
        .prepare('SELECT * FROM MediaAsset WHERE visitId = ? ORDER BY createdAt')
        .all(visitId) as MediaRow[];
    return rows.map(toMedia);
}

export function getMedia(id: string): MediaAsset | null {
    const row = db.prepare('SELECT * FROM MediaAsset WHERE id = ?').get(id) as MediaRow | undefined;
    return row ? toMedia(row) : null;
}

export interface MediaInput {
    type: 'photo' | 'audio';
    url: string;
    caption?: string;
    transcript?: string;
}

export function createMedia(visitId: string, input: MediaInput): MediaAsset {
    const id = newId();
    db.prepare(
        'INSERT INTO MediaAsset (id, visitId, type, url, caption, transcript) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, visitId, input.type, input.url, input.caption ?? null, input.transcript ?? null);
    return getMedia(id)!;
}

export function updateMedia(
    id: string,
    input: Partial<Pick<MediaInput, 'caption' | 'transcript'>>
): MediaAsset | null {
    const existing = getMedia(id);
    if (!existing) return null;
    db.prepare('UPDATE MediaAsset SET caption = ?, transcript = ? WHERE id = ?').run(
        input.caption ?? existing.caption,
        input.transcript ?? existing.transcript,
        id
    );
    return getMedia(id);
}

export function deleteMedia(id: string): boolean {
    const result = db.prepare('DELETE FROM MediaAsset WHERE id = ?').run(id);
    return result.changes > 0;
}