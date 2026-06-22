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

export async function listUsers(): Promise<User[]> {
    const rs = await db.execute('SELECT * FROM User ORDER BY name');
    return (rs.rows as unknown as UserRow[]).map(toUser);
}

export async function getUser(id: string): Promise<User | null> {
    const rs = await db.execute({ sql: 'SELECT * FROM User WHERE id = ?', args: [id] });
    const row = rs.rows[0] as unknown as UserRow | undefined;
    return row ? toUser(row) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
    const rs = await db.execute({ sql: 'SELECT * FROM User WHERE lower(email) = lower(?)', args: [email] });
    const row = rs.rows[0] as unknown as UserRow | undefined;
    return row ? toUser(row) : null;
}

export interface UserInput {
    name: string;
    email: string;
    role?: Role;
}

export async function createUser(input: UserInput): Promise<User> {
    const id = newId();
    await db.execute({
        sql: 'INSERT INTO User (id, name, email, role) VALUES (?, ?, ?, ?)',
        args: [id, input.name, input.email, input.role ?? 'field_officer']
    });
    return (await getUser(id))!;
}