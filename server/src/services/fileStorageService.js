import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';
import { DOCUMENT_TYPE } from '../utils/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Private, non-public directory — files are only ever served through the
// authenticated download route, never via express.static or a public URL.
export const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'documents');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

const MAX_SIZE_BYTES = {
  [DOCUMENT_TYPE.PROFILE_PHOTO]: 2 * 1024 * 1024, // 2MB, image only
  DEFAULT: 5 * 1024 * 1024, // 5MB
};

const PROFILE_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

function extensionFor(mimeType) {
  return ALLOWED_MIME_TYPES[mimeType] || '';
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueName = `${crypto.randomUUID()}${extensionFor(file.mimetype)}`;
    cb(null, uniqueName);
  },
});

function fileFilter(req, file, cb) {
  const documentType = req.body?.documentType;

  if (!Object.prototype.hasOwnProperty.call(ALLOWED_MIME_TYPES, file.mimetype)) {
    cb(ApiError.badRequest('Document type is not supported. Allowed formats: PDF, JPG, PNG.'));
    return;
  }

  if (documentType === DOCUMENT_TYPE.PROFILE_PHOTO && !PROFILE_PHOTO_MIME_TYPES.has(file.mimetype)) {
    cb(ApiError.badRequest('Profile photo must be a JPG or PNG image.'));
    return;
  }

  cb(null, true);
}

export const documentUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES.DEFAULT },
}).single('file');

/** Enforces the per-document-type size limit after multer's generic limit has already passed. */
export function assertWithinSizeLimit(documentType, sizeBytes) {
  const limit = MAX_SIZE_BYTES[documentType] || MAX_SIZE_BYTES.DEFAULT;
  if (sizeBytes > limit) {
    throw ApiError.badRequest(`File size exceeds the allowed limit of ${Math.round(limit / (1024 * 1024))}MB.`);
  }
}

export function absolutePathFor(storedFileName) {
  return path.join(UPLOADS_DIR, storedFileName);
}

export function deleteStoredFile(storedFileName) {
  const target = absolutePathFor(storedFileName);
  fs.unlink(target, () => {}); // best-effort cleanup, never blocks the response
}
