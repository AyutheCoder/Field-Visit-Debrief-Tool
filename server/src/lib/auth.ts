// Minimal stateless auth: HMAC-signed tokens (no external dependency).
// Tokens are `base64url(payloadJSON).base64url(hmacSHA256)`. This is a
// lightweight scheme suitable for a prototype/demo, not a hardened auth system.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from './http';
import type { Role } from '../types';

export interface AuthUser {
    sub: string;
    name: string;
    email: string;
    role: Role;
    iat: number;
    exp: number;
}

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function secret(): string {
    return process.env.AUTH_SECRET?.trim() || 'dev-insecure-secret-change-me';
}

/** Shared demo password for all seeded accounts (prototype convenience). */
export function demoPassword(): string {
    return process.env.AUTH_DEMO_PASSWORD?.trim() || 'demo1234';
}

function b64url(input: Buffer | string): string {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function sign(data: string): string {
    return b64url(createHmac('sha256', secret()).update(data).digest());
}

export function signToken(user: { id: string; name: string; email: string; role: Role }): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: AuthUser = {
        sub: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        iat: now,
        exp: now + TOKEN_TTL_SECONDS,
    };

    const body = b64url(JSON.stringify(payload));
    return `${body}.${sign(body)}`;
}

export function verifyToken(token: string): AuthUser | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;

    const expected = sign(body);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);

    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    try {
        const payload = JSON.parse(Buffer.from(body, 'base64').toString('utf8')) as AuthUser;
        if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
}

/** Constant-time password check. */
export function passwordMatches(input: string): boolean {
    const expected = demoPassword();
    const a = Buffer.from(input);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

// Attach `req.user` when a valid token is present. Non-rejecting.
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
        const user = verifyToken(header.slice(7).trim());
        if (user) req.user = user;
    }
    next();
}

/** Guard: require any authenticated user. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
    if (!req.user) throw new AppError(401, 'Authentication required');
    next();
}

/** Guard factory: require one of the given roles. */
export function requireRole(...roles: Role[]) {
    return (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user) throw new AppError(401, 'Authentication required');
        if (!roles.includes(req.user.role)) {
            throw new AppError(403, 'You do not have permission to perform this action');
        }
        next();
    };
}