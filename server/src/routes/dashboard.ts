import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { listVisitsWithRelations } from '../repositories/visits';

export const dashboardRouter = Router();

// Enriched visit feed for the manager dashboard (visits + debrief + stakeholders + media).
dashboardRouter.get(
    '/visits',
    asyncHandler((req, res) => {
        const { programArea, location, sentiment, from, to } = req.query;
        const visits = listVisitsWithRelations({
            programArea: typeof programArea === 'string' ? programArea : undefined,
            location: typeof location === 'string' ? location : undefined,
            sentiment: typeof sentiment === 'string' ? sentiment : undefined,
            from: typeof from === 'string' ? from : undefined,
            to: typeof to === 'string' ? to : undefined,
        });
        res.json(visits);
    })
);