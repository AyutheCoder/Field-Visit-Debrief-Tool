import { db } from '../db';
import { newId } from '../lib/ids';
import type { Role, User } from '../types';

interface UserRow {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
}

function toUser(row: UserRow): User {
    return { ...row, role: row.role as Role };
}

export function listUsers(): User[] {
    const rows = db.prepare('SELECT * FROM User ORDER BY name').all() as unknown as UserRow[];
    return rows.map(toUser);
}

export function getUser(id: string): User | null {
    const row = db.prepare('SELECT * FROM User WHERE id = ?').get(id) as unknown as
        | UserRow
        | undefined;
    return row ? toUser(row) : null;
}

export function getUserByEmail(email: string): User | null {
    const row = db
        .prepare('SELECT * FROM User WHERE lower(email) = lower(?)')
        .get(email) as unknown as UserRow | undefined;
    return row ? toUser(row) : null;
}

export interface UserInput {
    name: string;
    email: string;
    role?: Role;
}

export function createUser(input: UserInput): User {
    const id = newId();
    db.prepare('INSERT INTO User (id, name, email, role) VALUES (?, ?, ?, ?)').run(
        id,
        input.name,
        input.email,
        input.role ?? 'field_officer'
    );
    return getUser(id)!;
}