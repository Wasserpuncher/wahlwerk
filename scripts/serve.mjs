#!/usr/bin/env node
// Wahlwerk - lokaler Vorschauserver
// Lizenz: AGPL-3.0-or-later
// Nur fuer die Entwicklung. Kein Produktivserver.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.join(path.resolve(import.meta.dirname, '..'), 'dist');
const PORT = Number(process.env.PORT) || 4321;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
    let file = path.join(ROOT, url);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('Verboten');
      return;
    }
    try {
      const s = await stat(file);
      if (s.isDirectory()) file = path.join(file, 'index.html');
    } catch {
      file = path.join(ROOT, '404.html');
      res.statusCode = 404;
    }
    const body = await readFile(file);
    res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
    res.end(body);
  } catch {
    res.writeHead(404).end('Nicht gefunden');
  }
}).listen(PORT, () => console.log(`Vorschau auf http://localhost:${PORT}`));
