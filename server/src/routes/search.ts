import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { search, type SearchMode, type SearchFilters } from '../services/search';

export const searchRouter = Router();

// Full-text (keyword) and semantic search across visits.
// GET /api/search?q=...&mode=keyword|semantic&region=&program=&refresh=true
searchRouter.get(
    '/',
    asyncHandler(async (req, res) => {
        const { q, mode, region, program, refresh } = req.query;
        const query = typeof q === 'string' ? q : '';
        const requestedMode: SearchMode = mode === 'semantic' ? 'semantic' : 'keyword';
        const filters: SearchFilters = {
            region: typeof region === 'string' && region ? region : undefined,
            program: typeof program === 'string' && program ? program : undefined,
        };
        const result = await search(query, requestedMode, filters, refresh === 'true');
        res.json(result);
    })
);