import { Router } from 'express';
import { asyncHandler, AppError } from '../lib/http';
import { memoryUpload } from '../lib/upload';
import { extractVisitFromVoice } from '../services/intake';

export const intakeRouter = Router();

// // One-tap voice intake: upload an audio memo, get back a transcript plus
// // AI-extracted structured fields to pre-fill the capture form. Nothing is saved.
intakeRouter.post(
    '/voice',
    memoryUpload.single('file'),
    asyncHandler(async (req, res) => {
        const file = req.file;
        if (!file) throw new AppError(400, 'No audio file provided (field "file").');
        if (!file.mimetype.startsWith('audio/')) {
            throw new AppError(400, 'Voice intake expects an audio file.');
        }

        const result = await extractVisitFromVoice(
            file.buffer,
            file.mimetype,
            file.originalname || 'memo.webm'
        );
        res.json(result);
    })
);