import { Router } from 'express';
import { asyncHandler, requireBody, requireString } from '../lib/http';
import { answerQuestion } from '../services/chat';

export const chatRouter = Router();

// RAG assistant: ask a question over all visit debriefs.
chatRouter.post(
    '/',
    asyncHandler(async (req, res) => {
        const body = requireBody(req);
        const question = requireString(body, 'question', 1000);
        res.json(await answerQuestion(question));
    })
);