import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { db, initSchema, getDbPath } from './db';
import { errorHandler, notFoundHandler } from './lib/http';
import { UPLOADS_DIR } from './lib/upload';
import { visitsRouter } from './routes/visits';
import { stakeholdersRouter } from './routes/stakeholders';
import { mediaRouter } from './routes/media';
import { debriefsRouter } from './routes/debriefs';
import { actionsRouter } from './routes/actionItems';
import { usersRouter } from './routes/users';
import { dashboardRouter } from './routes/dashboard';
import { patternsRouter } from './routes/patterns';
import { searchRouter } from './routes/search';
import { intakeRouter } from './routes/intake';
import { alertsRouter } from './routes/alerts';
import { chatRouter } from './routes/chat';
import { authRouter } from './routes/auth';
import { authMiddleware } from './lib/auth';

// // Ensure tables exist on startup.
initSchema();

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: CLIENT_ORIGIN.split(',').map((o) => o.trim()) }));
app.use(express.json({ limit: '10mb' }));

// // Attach req.user when a valid Bearer token is present (non-rejecting).
app.use(authMiddleware);

// // Serve uploaded files statically
app.use('/uploads', express.static(UPLOADS_DIR));

// // Health check
app.get('/api/health', async (_req, res) => {
    let dbStatus = 'unknown';
    try {
        await db.execute('SELECT 1 AS ok');
        dbStatus = 'connected';
    } catch {
        dbStatus = 'disconnected';
    }

    res.json({
        status: 'ok',
        service: 'field-visit-debrief-server',
        db: dbStatus,
        timestamp: new Date().toISOString(),
    });
});

// // API routes
app.use('/api/auth', authRouter);
app.use('/api/visits', visitsRouter);
app.use('/api/stakeholders', stakeholdersRouter);
app.use('/api/media', mediaRouter);
app.use('/api/debriefs', debriefsRouter);
app.use('/api/actions', actionsRouter);
app.use('/api/users', usersRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/patterns', patternsRouter);
app.use('/api/search', searchRouter);
app.use('/api/intake', intakeRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/chat', chatRouter);

// // API 404 + error handling
app.use('/api', notFoundHandler);
app.use('/api', errorHandler);

import { join } from 'node:path';

if (process.env.NODE_ENV === 'production') {
    const clientDist = join(__dirname, '../../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
        res.sendFile(join(clientDist, 'index.html'));
    });
} else {
    // // Root
    app.get('/', (_req, res) => {
        res.json({ message: 'Field Visit Debrief API - see /api/health' });
    });
    app.use(notFoundHandler);
}

app.use(errorHandler);

const server = app.listen(PORT, () => {
    console.log(`[server] API listening on http://localhost:${PORT}`);
    console.log(`[server] Health: http://localhost:${PORT}/api/health`);
    console.log(`[server] Database: ${getDbPath()}`);
});

// // Graceful shutdown
const shutdown = () => {
    try {
        db.close();
    } catch {
        /* ignore */
    }
    server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);