const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Two sources, one grid. Photos committed to the repo live in public/success
// and ship with a deploy; photos uploaded from the admin panel live on the
// mounted data disk, because the container's own filesystem is replaced on
// every deploy and anything written into public/ would vanish with it.
const REPO_PHOTOS_DIR = path.join(process.cwd(), 'public', 'success');

// Resolved per call rather than at module scope, for the same reason db.js
// resolves DATA_DIR inside initDb(): Next's build step imports this module
// to analyze the routes that use it, and a filesystem path built from the
// environment at the top level makes the build tracer widen to the whole
// project (it warns about exactly this).
function uploadsDir() {
  return path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'success');
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

// Uploaded files are served back by a route rather than by the static
// handler, so what the browser is told they are is decided here, from the
// bytes — never from the name or from what the uploader claimed. SVG is
// deliberately absent: it can carry script, and these are displayed on a
// public page from our own origin.
const SIGNATURES = [
  { ext: '.png', type: 'image/png', match: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: '.jpg', type: 'image/jpeg', match: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.gif', type: 'image/gif', match: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8' },
  {
    ext: '.webp',
    type: 'image/webp',
    match: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

const CONTENT_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

// Names are generated, never taken from the upload, so this can be strict:
// anything that isn't a name we minted is rejected before it reaches the
// filesystem.
const UPLOAD_NAME_RE = /^[0-9a-f]{32}\.(png|jpg|gif|webp)$/;

// turbopackIgnore on the two fs calls: `dir` is a runtime value (the data
// disk lives outside the project), and without the hint the build's file
// tracer gives up on scoping and traces the entire project, which it warns
// about. It only affects build-time tracing, never what these calls do.
function readDir(dir, urlFor, uploaded) {
  try {
    return fs
      .readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => ({
        filename: entry.name,
        url: urlFor(entry.name),
        uploaded,
        mtimeMs: fs.statSync(path.join(/*turbopackIgnore: true*/ dir, entry.name)).mtimeMs,
      }));
  } catch {
    // A missing directory just means nothing from that source yet.
    return [];
  }
}

// Auto-discovers both sources — no manifest to maintain, drop a file in
// either and it shows up, newest first. Shared by the success-page Server
// Component and GET /api/success-photos so the homepage-CLS fix pattern
// (server-render initial data, no client fetch flash) applies here too.
function listSuccessPhotos() {
  return [
    ...readDir(REPO_PHOTOS_DIR, (name) => `/success/${name}`, false),
    ...readDir(uploadsDir(), (name) => `/api/success-photos/${name}`, true),
  ]
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map(({ filename, url, uploaded }) => ({ filename, url, uploaded }));
}

function sniff(buffer) {
  return SIGNATURES.find((signature) => buffer.length > 12 && signature.match(buffer)) || null;
}

// Returns { filename } or { error }. The extension comes from the sniffed
// bytes, so a .png that is really something else is rejected outright
// rather than stored under a name that lies about it.
function saveUploadedPhoto(buffer) {
  if (!buffer || buffer.length === 0) return { error: 'That file is empty.' };
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return { error: `That file is ${(buffer.length / 1024 / 1024).toFixed(1)}MB — the limit is 8MB.` };
  }

  const signature = sniff(buffer);
  if (!signature) return { error: 'That file is not a PNG, JPEG, GIF or WebP image.' };

  const dir = uploadsDir();
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${crypto.randomBytes(16).toString('hex')}${signature.ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return { filename, url: `/api/success-photos/${filename}`, type: signature.type };
}

// Resolves a request's filename to a real path, or null. Both the name
// pattern and the resolved-path check have to pass: the pattern alone is
// enough here, but the second is what keeps a future change to the pattern
// from turning into a traversal.
function resolveUploadedPhoto(filename) {
  if (typeof filename !== 'string' || !UPLOAD_NAME_RE.test(filename)) return null;
  const dir = uploadsDir();
  const fullPath = path.join(dir, filename);
  if (path.dirname(path.resolve(fullPath)) !== path.resolve(dir)) return null;
  return fs.existsSync(fullPath) ? fullPath : null;
}

function readUploadedPhoto(filename) {
  const fullPath = resolveUploadedPhoto(filename);
  if (!fullPath) return null;
  return {
    body: fs.readFileSync(fullPath),
    contentType: CONTENT_TYPES[path.extname(fullPath).toLowerCase()] || 'application/octet-stream',
  };
}

// Only uploads can be deleted. A photo committed to the repo isn't ours to
// remove at runtime — the next deploy would bring it back anyway.
function deleteUploadedPhoto(filename) {
  const fullPath = resolveUploadedPhoto(filename);
  if (!fullPath) return false;
  fs.unlinkSync(fullPath);
  return true;
}

module.exports = {
  MAX_UPLOAD_BYTES,
  listSuccessPhotos,
  saveUploadedPhoto,
  readUploadedPhoto,
  deleteUploadedPhoto,
};
