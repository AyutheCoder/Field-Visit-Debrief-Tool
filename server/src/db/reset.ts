import 'dotenv/config';
import { db, initSchema, getDbPath } from './index';

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

db.exec('PRAGMA foreign_keys = OFF;');
for (const t of tables) {
    db.exec(`DROP TABLE IF EXISTS ${t};`);
}
db.exec('PRAGMA foreign_keys = ON;');

initSchema();

console.log(`[db:reset] Schema recreated at ${getDbPath()}`);