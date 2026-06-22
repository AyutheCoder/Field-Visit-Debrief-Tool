import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { computeAlerts } from '../services/alerts';

export const alertsRouter = Router();

// Early-warning alerts: blocker spikes by region in the recent window.
alertsRouter.get(
    '/',
    asyncHandler((_req, res) => {
        res.json(computeAlerts());
    })
);