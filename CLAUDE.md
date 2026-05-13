# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Run both server and client concurrently (recommended)
npm run dev

# Run server only (nodemon, auto-reload)
npm run dev:server

# Run client only (Vite, http://localhost:5173)
npm run dev:client
```

### Build & Production
```bash
# Build client to /public, then start server
npm run build && npm start

# Start production server only (requires /public to exist)
npm start
```

### Individual packages
```bash
# Install server dependencies
cd server && npm install

# Install client dependencies
cd client && npm install
```

There are no automated tests in this project.

## Architecture

JAMSC is a real-time shared music listening app. The architecture is a monorepo with:

- **`/server`** — Node.js + Express + Socket.IO (CommonJS). All state is **in-memory** (plain Maps). No database. Server restart wipes all rooms.
- **`/client`** — React + Vite (ES modules). Builds into `/public` which the server serves as static files.
- **`/public`** — Vite build output (gitignored except the directory itself). The server's Express static middleware serves from here.

### Data flow

In **development**: Vite runs on port 5173 and proxies `/api` and `/socket.io` to the Express server at port 3000 (configured in [client/vite.config.js](client/vite.config.js)).

In **production**: Express serves the built `/public` directly on port 3000 (or `$PORT`).

### Server modules

| File | Responsibility |
|------|---------------|
| [server/index.js](server/index.js) | Express app, REST API endpoints, all Socket.IO event handlers |
| [server/roomManager.js](server/roomManager.js) | Room CRUD, member tracking, host transfer on disconnect |
| [server/queueManager.js](server/queueManager.js) | Per-room track queue, upvoting, reordering |
| [server/syncManager.js](server/syncManager.js) | Server-authoritative playback state (play/pause/seek/heartbeat) |
| [server/youtubeSearch.js](server/youtubeSearch.js) | YouTube scrape-based search (no API key) |

### Client structure

| Path | Responsibility |
|------|---------------|
| [client/src/context/AppContext.jsx](client/src/context/AppContext.jsx) | Global state via `useReducer`. Single source of truth for room, queue, playback, toasts |
| [client/src/hooks/useSocket.js](client/src/hooks/useSocket.js) | Socket.IO client wrapper — `emit()` returns a Promise that rejects on `success: false` |
| [client/src/hooks/usePlayer.js](client/src/hooks/usePlayer.js) | Unified YouTube IFrame API + SoundCloud Widget API player |
| [client/src/components/room/RoomView.jsx](client/src/components/room/RoomView.jsx) | Main room UI — mounts all Socket.IO listeners for sync/queue/chat/room events |
| [client/src/components/player/](client/src/components/player/) | Player controls, now-playing display, add-track form |

### Socket event namespaces

- `room:*` — create, join, leave, settings, member events
- `queue:*` — add, add-batch, remove, reorder, upvote, skip-to
- `sync:*` — play, pause, seek, next, track-ended, heartbeat (5s interval from server), state

### Sync model

The server is authoritative. The server broadcasts `sync:heartbeat` every 5 seconds to all room members. Clients correct playback drift > 2 seconds. `isExternalUpdateRef` in `usePlayer` prevents feedback loops when the server pushes a state update that triggers player events.

### Media sources

YouTube and SoundCloud player SDKs are loaded via CDN script tags in [client/index.html](client/index.html) (`window.YT` and `window.SC`). The `usePlayer` hook wraps both behind a unified interface. Track metadata is resolved server-side via free oEmbed APIs (no API keys required). Spotify links are resolved by looking up a YouTube video via scraping.

## Environment variables

| Variable | Where | Default | Purpose |
|----------|-------|---------|---------|
| `PORT` | server | `3000` | HTTP listen port |
| `CORS_ORIGIN` | server | `*` | Socket.IO CORS allowed origin |
| `VITE_BACKEND_URL` | client build | `''` (same origin) | Socket.IO server URL for the client |
