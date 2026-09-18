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

// Profile pictures are the one upload type meant to be publicly viewable (they're
// rendered as plain <img> tags across the app), so — unlike UPLOADS_DIR above —
// this directory is served directly via express.static in app.js.
export const PROFILE_PICTURES_DIR = path.join(__dirname, '..', '..', 'uploads', 'profile-pictures');

fs.mkdirSync(PROFILE_PICTURES_DIR, { recursive: true });

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

const PROFILE_PICTURE_MIME_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const MAX_PROFILE_PICTURE_BYTES = 2 * 1024 * 1024; // 2MB, matches the existing PROFILE_PHOTO document-type limit

const profilePictureStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PROFILE_PICTURES_DIR),
  // Random UUID filename — never derived from the client-supplied name — rules
  // out path traversal and filename collisions/overwrites entirely.
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${PROFILE_PICTURE_MIME_TYPES[file.mimetype] || ''}`),
});

function profilePictureFileFilter(req, file, cb) {
  if (!Object.prototype.hasOwnProperty.call(PROFILE_PICTURE_MIME_TYPES, file.mimetype)) {
    cb(ApiError.badRequest('Profile picture must be a JPG, PNG, or WEBP image.'));
    return;
  }
  cb(null, true);
}

export const profilePictureUpload = multer({
  storage: profilePictureStorage,
  fileFilter: profilePictureFileFilter,
  limits: { fileSize: MAX_PROFILE_PICTURE_BYTES },
}).single('file');

export function profilePicturePublicPath(storedFileName) {
  return `/uploads/profile-pictures/${storedFileName}`;
}

export function deleteProfilePicture(storedFileName) {
  fs.unlink(path.join(PROFILE_PICTURES_DIR, storedFileName), () => {});
}
