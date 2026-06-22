import { randomUUID } from 'node:crypto';

/** Generate a short, URL-safe unique id (UUID without dashes). */
export function newId(): string {
    return randomUUID().replace(/-/g, '');
}