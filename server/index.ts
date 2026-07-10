/**
 * server/index.ts — ArrDeck BFF bootstrap.
 *
 * Serves the built React app (dist/, built with base:'./') as static files when
 * present; otherwise runs API-only. The engine runs SERVER-SIDE here, so the
 * browser never talks to the *arr stack directly (no CORS/cleartext problem).
 *
 * Imports the API router (which imports src/engine only). No src/app imports.
 */

import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { api } from './api.js';

const app = express();
app.use(express.json());
app.use('/api', api);

const distDir = resolve(process.cwd(), 'dist');
const hasDist = existsSync(distDir);
if (hasDist) {
  app.use(express.static(distDir));
  // SPA fallback for non-/api GETs (avoids a wildcard route → no path-to-regexp edge cases).
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(resolve(distDir, 'index.html'));
    } else {
      next();
    }
  });
}

const port = Number(process.env.PORT) || 8090;
app.listen(port, () => {
  console.log(
    `ArrDeck BFF listening on :${port} — ${hasDist ? 'serving dist/ + API' : 'API-only (no dist/)'}`,
  );
});
