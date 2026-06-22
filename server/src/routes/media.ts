import { Router } from 'express';
import { asyncHandler, AppError, requireBody, optionalString } from '../lib/http';
import { updateMedia, deleteMedia } from '../repositories/media';

export const mediaRouter = Router();

mediaRouter.patch(
    '/:id',
    asyncHandler((req, res) => {
        const body = requireBody(req);
        const updated = updateMedia(req.params.id, {
            caption: optionalString(body, 'caption', 1000),
            transcript: optionalString(body, 'transcript', 50000),
        });

        if (!updated) throw new AppError(404, 'Media asset not found');
        res.json(updated);
    })
);

mediaRouter.delete(
    '/:id',
    asyncHandler((req, res) => {
        if (!deleteMedia(req.params.id)) throw new AppError(404, 'Media asset not found');
        res.status(204).end();
    })
);