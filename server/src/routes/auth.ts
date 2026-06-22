import { Router } from 'express';
import { asyncHandler, AppError, requireBody, requireString } from '../lib/http';
import { getUserByEmail } from '../repositories/users';
import { signToken, passwordMatches, requireAuth } from '../lib/auth';

export const authRouter = Router();

// Log in with email + shared demo password. Returns a signed token and the user.
authRouter.post(
    '/login',
    asyncHandler(async (req, res) => {
        const body = requireBody(req);
        const email = requireString(body, 'email', 200);
        const password = requireString(body, 'password', 200);

        const user = await getUserByEmail(email);
        if (!user || !passwordMatches(password)) {
            throw new AppError(401, 'Invalid email or password');
        }

        res.json({ token: signToken(user), user });
    })
);

// Return the currently authenticated user.
authRouter.get(
    '/me',
    requireAuth,
    asyncHandler((req, res) => {
        res.json({ user: req.user });
    })
);