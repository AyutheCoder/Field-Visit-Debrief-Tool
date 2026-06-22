import multer from 'multer';
import { extname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { AppError } from './http';

export const UPLOADS_DIR = join(process.cwd(), 'uploads');
mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/webm',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/x-wav',
    'audio/mp3',
]);

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
        const ext = extname(file.originalname) || guessExt(file.mimetype);
        cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
    },
});

function guessExt(mime: string): string {
    if (mime.startsWith('image/')) return `.${mime.split('/')[1]}`;
    if (mime === 'audio/webm') return '.webm';
    if (mime === 'audio/ogg') return '.ogg';
    if (mime === 'audio/mpeg' || mime === 'audio/mp3') return '.mp3';
    if (mime === 'audio/mp4') return '.m4a';
    if (mime.startsWith('audio/wav') || mime === 'audio/x-wav') return '.wav';
    return '';
}

export const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
    fileFilter: (_req, file, cb) => {
        if (ALLOWED.has(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new AppError(400, `Unsupported file type: ${file.mimetype}`));
        }
    },
});

/**
 * In-memory upload (file available as `req.file.buffer`). Used for transient
 * processing like voice intake where the file is not persisted to disk.
 */
export const memoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED.has(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new AppError(400, `Unsupported file type: ${file.mimetype}`));
        }
    },
});

/** Map a stored file's mimetype to our MediaAsset type. */
export function mediaTypeFromMime(mime: string): 'photo' | 'audio' {
    return mime.startsWith('audio/') ? 'audio' : 'photo';
}