import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { computePatterns } from '../services/patterns';

export const patternsRouter = Router();

// Recurring issues clustered across visits, with counts, affected
// regions/programs, and the contributing visit IDs.
patternsRouter.get(
    '/',
    asyncHandler(async (_req, res) => {
        const result = await computePatterns();
        res.json(result);
    })
);