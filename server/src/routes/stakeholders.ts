import { Router } from 'express';
import { asyncHandler, AppError, requireBody, optionalString } from '../lib/http';
import { updateStakeholder, deleteStakeholder } from '../repositories/stakeholders';

export const stakeholdersRouter = Router();

stakeholdersRouter.patch(
    '/:id',
    asyncHandler(async (req, res) => {
        const body = requireBody(req);
        const updated = await updateStakeholder(req.params.id, {
            name: optionalString(body, 'name', 200),
            role: optionalString(body, 'role', 200),
            organization: optionalString(body, 'organization', 200),
        });

        if (!updated) throw new AppError(404, 'Stakeholder not found');
        res.json(updated);
    })
);

stakeholdersRouter.delete(
    '/:id',
    asyncHandler(async (req, res) => {
        if (!(await deleteStakeholder(req.params.id))) throw new AppError(404, 'Stakeholder not found');
        res.status(204).end();
    })
);