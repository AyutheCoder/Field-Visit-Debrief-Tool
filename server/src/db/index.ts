import './suppress';
import { createClient } from '@libsql/client';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Support both local SQLite and Turso
function resolveDbUrl(): string {
    const raw = process.env.DATABASE_URL?.trim() || 'file:./data/dev.db';
    if (raw.startsWith('file:')) {
        const withoutScheme = raw.slice('file:'.length);
        const abs = resolve(process.cwd(), withoutScheme);
        mkdirSync(dirname(abs), { recursive: true });
        return `file:${abs}`;
    }
    return raw; // e.g. libsql://... or https://...
}

export const db = createClient({
    url: resolveDbUrl(),
    authToken: process.env.DATABASE_AUTH_TOKEN,
});

/** Create all tables from schema.sql if they do not already exist. */
export async function initSchema(): Promise<void> {
    const schemaPath = join(__dirname, 'schema.sql');
    const sql = readFileSync(schemaPath, 'utf8');
    // split statements because libsql client execute() doesn't handle multiple statements well
    // or use executeMultiple
    await db.executeMultiple(sql);
}

export function getDbPath(): string {
    return resolveDbUrl();
}