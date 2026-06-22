import { Router } from 'express';
import { asyncHandler, requireBody, requireString, optionalEnum } from '../lib/http';
import { listUsers, createUser } from '../repositories/users';
import type { Role } from '../types';

export const usersRouter = Router();

const ROLES = ['field_officer', 'manager', 'admin'] as const;

usersRouter.get(
    '/',
    asyncHandler(async (_req, res) => {
        res.json(await listUsers());
    })
);

usersRouter.post(
    '/',
    asyncHandler(async (req, res) => {
        const body = requireBody(req);
        const user = await createUser({
            name: requireString(body, 'name', 200),
            email: requireString(body, 'email', 200),
            role: optionalEnum<Role>(body, 'role', ROLES),
        });
        res.status(201).json(user);
    })
);