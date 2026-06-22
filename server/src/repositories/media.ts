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

export async function listMedia(visitId: string): Promise<MediaAsset[]> {
    const rs = await db.execute({ sql: 'SELECT * FROM MediaAsset WHERE visitId = ? ORDER BY createdAt', args: [visitId] });
    return (rs.rows as unknown as MediaRow[]).map(toMedia);
}

export async function getMedia(id: string): Promise<MediaAsset | null> {
    const rs = await db.execute({ sql: 'SELECT * FROM MediaAsset WHERE id = ?', args: [id] });
    const row = rs.rows[0] as unknown as MediaRow | undefined;
    return row ? toMedia(row) : null;
}

export interface MediaInput {
    type: 'photo' | 'audio';
    url: string;
    caption?: string;
    transcript?: string;
}

export async function createMedia(visitId: string, input: MediaInput): Promise<MediaAsset> {
    const id = newId();
    await db.execute({
        sql: 'INSERT INTO MediaAsset (id, visitId, type, url, caption, transcript) VALUES (?, ?, ?, ?, ?, ?)',
        args: [id, visitId, input.type, input.url, input.caption ?? null, input.transcript ?? null]
    });
    return (await getMedia(id))!;
}

export async function updateMedia(
    id: string,
    input: Partial<Pick<MediaInput, 'caption' | 'transcript'>>
): Promise<MediaAsset | null> {
    const existing = await getMedia(id);
    if (!existing) return null;
    await db.execute({
        sql: 'UPDATE MediaAsset SET caption = ?, transcript = ? WHERE id = ?',
        args: [
            input.caption ?? existing.caption,
            input.transcript ?? existing.transcript,
            id
        ]
    });
    return await getMedia(id);
}

export async function deleteMedia(id: string): Promise<boolean> {
    const rs = await db.execute({ sql: 'DELETE FROM MediaAsset WHERE id = ?', args: [id] });
    return rs.rowsAffected > 0;
}