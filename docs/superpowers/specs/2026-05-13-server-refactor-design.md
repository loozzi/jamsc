# Server Refactor Design — TypeScript + Backend Service Pattern

**Date:** 2026-05-13  
**Branch:** feature/auth  
**Scope:** `/server` directory only — client untouched

---

## Problem

`server/index.js` (~830 lines) handles too many concerns simultaneously:
- Express + Socket.IO setup
- All REST route definitions
- Business logic (`resolveUrl`, `resolvePlaylist`, `extractYouTubeVideoId`, `fetchJson`)
- All Socket.IO event handlers
- Heartbeat management

The existing managers (`roomManager`, `queueManager`, `syncManager`) are functional but use plain module exports without types, and `youtubeSearch.js` is a utility living at the root alongside application-layer code.

---

## Goals

1. Split `index.js` into focused modules with single responsibilities
2. Add TypeScript with strict mode for type safety across the entire server
3. Standardize error response format via a global error handler middleware
4. Separate socket handlers by domain (room, queue, sync, chat)
5. Introduce a controller layer that keeps routes thin

---

## Folder Structure

```
server/
├── src/
│   ├── config/
│   │   └── index.ts            # env vars: PORT, CORS_ORIGIN
│   ├── types/
│   │   └── index.ts            # shared domain types
│   ├── services/
│   │   ├── roomService.ts      # room CRUD (was roomManager.js)
│   │   ├── queueService.ts     # queue operations (was queueManager.js)
│   │   ├── syncService.ts      # playback sync (was syncManager.js)
│   │   └── mediaService.ts     # URL resolution, playlist parsing (from index.js)
│   ├── utils/
│   │   └── youtubeSearch.ts    # YouTube scrape search (was youtubeSearch.js)
│   ├── controllers/
│   │   └── mediaController.ts  # thin handlers delegating to mediaService
│   ├── routes/
│   │   └── media.ts            # /api/resolve, /api/resolve-playlist, /api/resolve-spotify, /api/youtube-search-first
│   ├── sockets/
│   │   ├── index.ts            # registers all handlers on io
│   │   ├── roomHandlers.ts     # room:create, room:join, room:leave, room:update-settings
│   │   ├── queueHandlers.ts    # queue:add, queue:add-batch, queue:remove, queue:reorder, queue:upvote, queue:skip-to
│   │   ├── syncHandlers.ts     # sync:play, sync:pause, sync:seek, sync:next, sync:track-ended, sync:request-state + heartbeat
│   │   └── chatHandlers.ts     # chat:message
│   ├── middlewares/
│   │   └── errorHandler.ts     # AppError class + global Express error middleware
│   └── app.ts                  # Express factory: json middleware, static, routes, errorHandler
├── index.ts                    # entry point: HTTP server + Socket.IO init + listen
├── tsconfig.json
└── package.json
```

---

## Types (`src/types/index.ts`)

```typescript
export interface Member {
  name: string;
  isHost: boolean;
  joinedAt: Date;
}

export interface RoomSettings {
  allowSkip: boolean;
  allowSeek: boolean;
}

export interface Room {
  id: string;
  hostId: string;
  hostName: string;
  settings: RoomSettings;
  members: Map<string, Member>;
  createdAt: Date;
}

export interface Track {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  duration: number;
  source: 'youtube' | 'soundcloud';
  sourceId: string;
  displaySource?: 'spotify';
  spotifyUrl?: string;
  addedBy: string;
  addedBySocketId: string;
  addedAt: Date;
  votes: number;
  votedBy: Set<string>;
}

export interface ResolvedTrack {
  source: 'youtube' | 'soundcloud';
  displaySource?: 'spotify';
  sourceId: string;
  url: string;
  spotifyUrl?: string;
  title: string;
  artist?: string;
  thumbnail: string;
  duration: number;
}

export interface PlaybackState {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  lastSyncAt: number;
}

export interface QueueState {
  tracks: SerializedTrack[];
  currentIndex: number;
  currentTrack: Track | null;
}

export interface SerializedTrack {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  duration: number;
  source: 'youtube' | 'soundcloud';
  sourceId: string;
  addedBy: string;
  votes: number;
}
```

---

## Config (`src/config/index.ts`)

```typescript
export const config = {
  port: Number(process.env.PORT) || 3000,
  corsOrigin: process.env.CORS_ORIGIN || '*',
};
```

---

## Error Handling (`src/middlewares/errorHandler.ts`)

```typescript
export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

// Global Express error middleware (4-arg signature required by Express)
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const status = err instanceof AppError ? err.statusCode : 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
}
```

All async route handlers pass errors via `next(err)` instead of inline `res.status(500)` calls.

---

## Controllers (`src/controllers/mediaController.ts`)

Each handler is a thin async function — no business logic, only:
1. Extract + validate query params (throw `AppError` for bad input)
2. Call the corresponding `mediaService` function
3. Respond with the result or pass error to `next`

```typescript
export const resolveUrl = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') throw new AppError(400, 'URL is required');
    const result = await mediaService.resolveUrl(url);
    if (!result) throw new AppError(400, 'URL không được hỗ trợ');
    res.json(result);
  } catch (err) {
    next(err);
  }
};
```

---

## Services

### `mediaService.ts`
Extracted from `index.js`. Contains:
- `resolveUrl(url: string): Promise<ResolvedTrack | null>`
- `resolvePlaylist(url: string): Promise<ResolvedTrack[] | null>`
- `resolveSpotify(url: string): Promise<ResolvedTrack>`
- `searchYouTubeFirst(query: string): Promise<ResolvedTrack | null>`
- `fetchJson<T>(url: string): Promise<T>` (internal helper)
- `extractYouTubeVideoId(url: string): string | null` (internal helper)

### `roomService.ts` / `queueService.ts` / `syncService.ts`
Converted from `roomManager.js` / `queueManager.js` / `syncManager.js` with typed function signatures. Internal state (`Map`) stays module-level (no change to in-memory model).

---

## Socket Handlers (`src/sockets/`)

Each handler file exports a single `register*Handlers(io: Server, socket: Socket): void` function.

```typescript
// sockets/index.ts
export function initSockets(io: Server): void {
  io.on('connection', (socket: Socket) => {
    registerRoomHandlers(io, socket);
    registerQueueHandlers(io, socket);
    registerSyncHandlers(io, socket);
    registerChatHandlers(io, socket);
    socket.on('disconnect', () => handleLeave(io, socket));
  });
}
```

`handleLeave` (shared between `room:leave` and `disconnect`) lives in `roomHandlers.ts` and is exported for reuse.

Heartbeat `Map<string, NodeJS.Timeout>` and `startHeartbeat`/`stopHeartbeat` helpers move into `syncHandlers.ts` since they are only used for `sync:heartbeat` broadcasts.

---

## Entry Point (`index.ts`)

```typescript
import http from 'http';
import { Server } from 'socket.io';
import { createApp } from './src/app';
import { initSockets } from './src/sockets';
import { config } from './src/config';

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.corsOrigin, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

initSockets(io);

server.listen(config.port, () => {
  console.log(`\n  JAMSC Server running on http://localhost:${config.port}\n`);
});
```

---

## Build Setup

**`tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["index.ts", "src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**`package.json` scripts**
```json
{
  "dev": "npx tsx watch index.ts",
  "build": "tsc",
  "start": "node dist/index.js"
}
```

**New dev dependencies**
- `typescript`
- `tsx` (dev runner, replaces nodemon)
- `@types/node`
- `@types/express`
- `@types/cors`

---

## What Does NOT Change

- In-memory state model (Map-based, no database)
- Socket event names (`room:*`, `queue:*`, `sync:*`, `chat:*`)
- REST API endpoint paths (`/api/resolve`, etc.)
- Client code — zero changes required
- Business logic behavior — pure refactor, no behavioral changes
