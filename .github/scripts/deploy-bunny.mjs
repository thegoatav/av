import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zone = process.env.BUNNY_STORAGE_ZONE;
const password = process.env.BUNNY_STORAGE_PASSWORD;
const pullZoneId = process.env.BUNNY_PULL_ZONE_ID;
const apiKey = process.env.BUNNY_API_KEY;
const endpoint = (process.env.BUNNY_STORAGE_ENDPOINT || 'storage.bunnycdn.com')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');

if (!zone || !password) {
  throw new Error('Set BUNNY_STORAGE_ZONE and BUNNY_STORAGE_PASSWORD in your GitHub Actions secrets.');
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

async function collectFiles(directory, relative = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fileRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(fullPath, fileRelative));
    else if (entry.isFile()) files.push({ fullPath, relative: fileRelative });
  }
  return files;
}

const files = await collectFiles(root);
if (!files.length) throw new Error('No site files were found to upload.');

for (const file of files) {
  const encodedPath = file.relative.split('/').map(encodeURIComponent).join('/');
  const url = `https://${endpoint}/${encodeURIComponent(zone)}/${encodedPath}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      AccessKey: password,
      'Content-Type': contentTypes[path.extname(file.relative).toLowerCase()] || 'application/octet-stream'
    },
    body: await readFile(file.fullPath)
  });
  if (!response.ok) {
    throw new Error(`Upload failed for ${file.relative} (${response.status} ${response.statusText}).`);
  }
  console.log(`uploaded ${file.relative}`);
}

if (pullZoneId && apiKey) {
  const response = await fetch(`https://api.bunny.net/pullzone/${encodeURIComponent(pullZoneId)}/purgeCache`, {
    method: 'POST',
    headers: { AccessKey: apiKey }
  });
  if (!response.ok) {
    throw new Error(`Bunny cache purge failed (${response.status} ${response.statusText}).`);
  }
  console.log('purged the pull zone cache');
} else {
  console.log('cache purge skipped; set BUNNY_PULL_ZONE_ID and BUNNY_API_KEY to enable it');
}
