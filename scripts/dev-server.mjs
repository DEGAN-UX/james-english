// Static dev server with caching switched off, so a phone or laptop never runs stale files.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png'
};

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = normalize(join(root, pathname.endsWith('/') ? `${pathname}index.html` : pathname));
    if (!file.startsWith(root)) throw new Error('outside root');
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Cache-Control': 'no-store' });
    response.end('Not found');
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`Word Ninja: http://localhost:${port}/`);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses || []) if (address.family === 'IPv4' && !address.internal) console.log(`On your phone (same Wi-Fi): http://${address.address}:${port}/`);
  }
});
