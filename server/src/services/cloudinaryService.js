import crypto from 'crypto';
import fs from 'fs/promises';
import { env } from '../config/env.js';

// Minimal Cloudinary client (signed Upload API) — no SDK dependency.
// The API secret only signs requests server-side; it is never sent or logged.

const API = 'https://api.cloudinary.com/v1_1';

export const isCloudinaryEnabled = () => env.cloudinary.enabled;

/** Cloudinary request signature: SHA-1 of the sorted params + the API secret. */
export function signParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');
}

async function signedPost(path, params, file) {
  const { cloudName, apiKey, apiSecret } = env.cloudinary;
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = { ...params, timestamp };
  const form = new FormData();
  for (const [k, v] of Object.entries(signed)) form.append(k, String(v));
  form.append('api_key', apiKey);
  form.append('signature', signParams(signed, apiSecret));
  if (file) form.append('file', file);
  const res = await fetch(`${API}/${encodeURIComponent(cloudName)}/${path}`, { method: 'POST', body: form });
  let body = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON error page
  }
  if (!res.ok) {
    const err = new Error(`Cloudinary ${path} failed (${res.status}): ${body?.error?.message || 'unknown error'}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

/**
 * Uploads a local image file into `<CLOUDINARY_FOLDER>/<subfolder>` under a
 * random public id. Returns { url (https), publicId }.
 */
export async function uploadImageFile(filePath, { subfolder, mimeType }) {
  const buffer = await fs.readFile(filePath);
  const file = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
  const body = await signedPost(
    'image/upload',
    { folder: `${env.cloudinary.folder}/${subfolder}`, public_id: crypto.randomUUID(), overwrite: 'false' },
    file
  );
  return { url: body.secure_url, publicId: body.public_id };
}

/**
 * The public id of an image stored in OUR cloud and folder, or null for any
 * other URL (seed images, old disk uploads, other clouds) — so we never try to
 * delete something we don't own.
 */
export function ownedPublicIdFromUrl(url) {
  if (!url || !env.cloudinary.cloudName) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname !== 'res.cloudinary.com') return null;
  const prefix = `/${env.cloudinary.cloudName}/image/upload/`;
  if (!u.pathname.startsWith(prefix)) return null;
  // Strip an optional version segment (v123…) and the file extension.
  const rest = u.pathname.slice(prefix.length).replace(/^v\d+\//, '');
  const publicId = decodeURIComponent(rest.replace(/\.[a-z0-9]+$/i, ''));
  return publicId.startsWith(`${env.cloudinary.folder}/`) ? publicId : null;
}

/** Best-effort delete; resolves false (and logs) instead of throwing. */
export async function destroyImage(publicId) {
  try {
    const body = await signedPost('image/destroy', { public_id: publicId, invalidate: 'true' });
    return body.result === 'ok' || body.result === 'not found';
  } catch (err) {
    console.warn(`[cloudinary] could not delete an old image: ${err.message}`);
    return false;
  }
}
