# ArrDeck web UI — multi-stage image.
# Builder: install deps, build the React front-end (vite → dist/), and bundle the
# Express BFF (server/ + the pure src/engine it imports) into a single file with
# esbuild. Runtime: a slim node with ONLY dist/ + the bundle + express — no TS
# source, no tsx, no vite, no capacitor, no react in node_modules.

# ---------- builder ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Install all deps (dev included — vite/esbuild are needed to build).
COPY package.json package-lock.json ./
RUN npm ci

# Source (the .dockerignore keeps out secrets/config/node_modules/android/etc.).
COPY . .

# 1) Front-end: vite build → /app/dist (base:'./' → relative asset paths).
RUN npm run build

# 2) Server: bundle server/index.ts (+ the engine it imports) to ONE CommonJS file.
#    esbuild rewrites the code's ".js" import specifiers to their ".ts" sources.
#    express is kept EXTERNAL (--packages=external) — see the note below.
RUN npx esbuild server/index.ts \
      --bundle --platform=node --format=cjs --target=node20 \
      --packages=external \
      --outfile=out/server.cjs

# 3) A MINIMAL production node_modules containing ONLY express (+ its subtree),
#    so the runtime doesn't ship vite/capacitor/react/lucide (the un-split
#    front-end deps from package.json's "dependencies").
RUN mkdir -p /prod \
    && cd /prod \
    && npm init -y >/dev/null 2>&1 \
    && npm install express@4 --omit=dev --no-audit --no-fund >/dev/null 2>&1

# EXPRESS BUNDLING CHOICE: express is kept EXTERNAL + installed cleanly into a
# tiny prod node_modules, rather than bundled into server.cjs. Reasoning:
# esbuild-bundling express (a CJS package with a couple of dynamic requires) can
# hit "Dynamic require is not supported" pitfalls; a real on-disk express is more
# reliable. The image stays small because ONLY express's dependency subtree ships
# (~1–2 MB), not the front-end/Capacitor deps.

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    ARRDECK_CONFIG_DIR=/config \
    PORT=8090

# Only what the server needs at runtime (comments on their own lines — the
# legacy builder does not strip inline '#' comments after a COPY instruction):
# - dist/        : the built React app (served statically)
# - out/server.cjs : the bundled BFF + engine
# - node_modules  : express only
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/out/server.cjs ./out/server.cjs
COPY --from=builder /prod/node_modules ./node_modules

# Config (services + API keys) lives on a mounted volume, never in the image.
VOLUME /config
EXPOSE 8090

# server.cjs resolves dist/ from process.cwd() (=/app) and requires express from ./node_modules.
CMD ["node", "out/server.cjs"]
