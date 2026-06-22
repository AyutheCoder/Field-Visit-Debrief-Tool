import './suppress';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Resolve the database file location.
// DATABASE_URL may be "file:./data/dev.db" (Prisma-style) or a plain path.
function resolveDbPath(): string {
    const raw = process.env.DATABASE_URL?.trim() || 'file:./data/dev.db';
    const withoutScheme = raw.startsWith('file:') ? raw.slice('file:'.length) : raw;
    const abs = resolve(process.cwd(), withoutScheme);
    mkdirSync(dirname(abs), { recursive: true });
    return abs;
}

const DB_PATH = resolveDbPath();

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

/** Create all tables from schema.sql if they do not already exist. */
export function initSchema(): void {
    // __dirname works under CommonJS (tsx and compiled dist). schema.sql sits beside this file.
    const schemaPath = join(__dirname, 'schema.sql');
    const sql = readFileSync(schemaPath, 'utf8');
    db.exec(sql);
}

export function getDbPath(): string {
    return DB_PATH;
}