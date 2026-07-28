const fs = require('fs');
const path = require('path');

const SUCCESS_PHOTOS_DIR = path.join(process.cwd(), 'public', 'success');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

// Auto-discovers whatever image files have been dropped into public/success/ —
// no manifest to maintain, just add a file and it shows up, newest first.
// Shared by the success-page Server Component and GET /api/success-photos so
// the homepage-CLS fix pattern (server-render initial data, no client fetch
// flash) applies here too.
function listSuccessPhotos() {
  try {
    return fs
      .readdirSync(SUCCESS_PHOTOS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => {
        const fullPath = path.join(SUCCESS_PHOTOS_DIR, entry.name);
        return { filename: entry.name, url: `/success/${entry.name}`, mtimeMs: fs.statSync(fullPath).mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .map(({ filename, url }) => ({ filename, url }));
  } catch {
    // Directory missing is fine — just means no photos yet.
    return [];
  }
}

module.exports = { listSuccessPhotos };
