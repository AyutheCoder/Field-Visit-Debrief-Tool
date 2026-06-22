import { Router } from 'express';
import {
    asyncHandler,
    AppError,
    requireBody,
    requireString,
    optionalString,
    optionalEnum,
} from '../lib/http';
import { getDebrief, deleteDebrief } from '../repositories/debriefs';
import {
    listActionsByDebrief,
    createAction,
    type ActionInput,
} from '../repositories/actionItems';
import type { Priority } from '../types';

export const debriefsRouter = Router();

const PRIORITIES = ['high', 'medium', 'low'] as const;

// // List action items for a debrief
debriefsRouter.get(
    '/:id/actions',
    asyncHandler((req, res) => {
        if (!getDebrief(req.params.id)) throw new AppError(404, 'Debrief not found');
        res.json(listActionsByDebrief(req.params.id));
    })
);

// // Add an action item to a debrief
debriefsRouter.post(
    '/:id/actions',
    asyncHandler((req, res) => {
        if (!getDebrief(req.params.id)) throw new AppError(404, 'Debrief not found');
        const body = requireBody(req);
        const input: ActionInput = {
            description: requireString(body, 'description', 2000),
            owner: optionalString(body, 'owner', 200),
            priority: optionalEnum<Priority>(body, 'priority', PRIORITIES),
            dueDate: optionalString(body, 'dueDate', 40),
        };

        const created = createAction(req.params.id, input);
        res.status(201).json(created);
    })
);

debriefsRouter.delete(
    '/:id',
    asyncHandler((req, res) => {
        if (!deleteDebrief(req.params.id)) throw new AppError(404, 'Debrief not found');
        res.status(204).end();
    })
);