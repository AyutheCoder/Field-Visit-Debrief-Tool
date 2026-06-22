import { Router } from 'express';
import {
    asyncHandler,
    AppError,
    requireBody,
    optionalString,
    optionalEnum,
} from '../lib/http';
import {
    listActionsWithContext,
    updateAction,
    getActionWithContext,
    deleteAction,
    type ActionFilters,
} from '../repositories/actionItems';
import type { ActionStatus, Priority } from '../types';

export const actionsRouter = Router();

const PRIORITIES = ['high', 'medium', 'low'] as const;
const STATUSES = ['open', 'in_progress', 'done'] as const;

// // List all action items, enriched with visit context (region/program/location).
// // Supports filtering by status, region, program, and overdue.
actionsRouter.get(
    '/',
    asyncHandler(async (req, res) => {
        const { status, region, program, overdue } = req.query;
        const filters: ActionFilters = {
            status:
                typeof status === 'string' && STATUSES.includes(status as ActionStatus)
                    ? (status as ActionStatus)
                    : undefined,
            region: typeof region === 'string' && region ? region : undefined,
            program: typeof program === 'string' && program ? program : undefined,
            overdue: overdue === 'true' || overdue === '1',
        };
        res.json(await listActionsWithContext(filters));
    })
);

// // Update an action item (status, owner, priority, due date, description)
actionsRouter.patch(
    '/:id',
    asyncHandler(async (req, res) => {
        const body = requireBody(req);
        const updated = await updateAction(req.params.id, {
            description: optionalString(body, 'description', 2000),
            owner: optionalString(body, 'owner', 200),
            priority: optionalEnum<Priority>(body, 'priority', PRIORITIES),
            dueDate: optionalString(body, 'dueDate', 40),
            status: optionalEnum<ActionStatus>(body, 'status', STATUSES),
        });

        if (!updated) throw new AppError(404, 'Action item not found');
        res.json((await getActionWithContext(updated.id)) ?? updated);
    })
);

actionsRouter.delete(
    '/:id',
    asyncHandler(async (req, res) => {
        if (!(await deleteAction(req.params.id))) throw new AppError(404, 'Action item not found');
        res.status(204).end();
    })
);