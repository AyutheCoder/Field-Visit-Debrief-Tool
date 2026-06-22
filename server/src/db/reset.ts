import 'dotenv/config';
import { db, initSchema, getDbPath } from './index';

async function main() {
    // Drops all tables and recreates the schema. Useful during development.
    const tables = [
        'Embedding',
        'ActionItem',
        'Debrief',
        'MediaAsset',
        'Stakeholder',
        'Pattern',
        'Visit',
        'User',
    ];

    await db.execute('PRAGMA foreign_keys = OFF;');
    for (const t of tables) {
        await db.execute(`DROP TABLE IF EXISTS ${t};`);
    }
    await db.execute('PRAGMA foreign_keys = ON;');

    await initSchema();

    console.log(`[db:reset] Schema recreated at ${getDbPath()}`);
}

main().catch(console.error);