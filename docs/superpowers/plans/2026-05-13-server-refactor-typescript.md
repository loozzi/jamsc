# Server Refactor: TypeScript + Backend Service Pattern — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `/server` from a monolithic `index.js` into a TypeScript codebase following backend service conventions — config, typed services, controllers, routes, domain-split socket handlers, and global error middleware.

**Architecture:** Entry point `index.ts` creates the HTTP server and calls two init functions: `createApp()` (Express) and `initSockets(io)`. REST logic flows through `routes → controllers → services`. Socket events are split into `sockets/roomHandlers`, `queueHandlers`, `syncHandlers`, `chatHandlers`. Shared domain types live in `src/types/index.ts`. In-memory state model (Maps) is unchanged.

**Tech Stack:** Node.js 18+, Express 4, Socket.IO 4, TypeScript 5, tsx (dev runner, replaces nodemon)

**Spec:** `docs/superpowers/specs/2026-05-13-server-refactor-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `server/src/types/index.ts` | All shared domain types |
| Create | `server/src/config/index.ts` | env var config |
| Create | `server/src/middlewares/errorHandler.ts` | AppError + global error middleware |
| Create | `server/src/services/roomService.ts` | Room CRUD (from roomManager.js) |
| Create | `server/src/services/queueService.ts` | Queue ops (from queueManager.js) |
| Create | `server/src/services/syncService.ts` | Playback sync (from syncManager.js) |
| Create | `server/src/utils/youtubeSearch.ts` | YouTube scrape search (from youtubeSearch.js) |
| Create | `server/src/services/mediaService.ts` | URL resolution (extracted from index.js) |
| Create | `server/src/controllers/mediaController.ts` | Thin REST handlers |
| Create | `server/src/routes/media.ts` | Mount /api/* routes |
| Create | `server/src/sockets/syncHandlers.ts` | sync:* events + heartbeat |
| Create | `server/src/sockets/roomHandlers.ts` | room:* events + handleLeave |
| Create | `server/src/sockets/queueHandlers.ts` | queue:* events |
| Create | `server/src/sockets/chatHandlers.ts` | chat:message |
| Create | `server/src/sockets/index.ts` | Register all handlers |
| Create | `server/src/app.ts` | Express factory |
| Create | `server/index.ts` | Entry point |
| Create | `server/tsconfig.json` | TypeScript config |
| Modify | `server/package.json` | Add ts deps, update scripts |
| Modify | `package.json` (root) | Update dev:server, start, build scripts |
| Delete | `server/index.js` | Replaced by index.ts |
| Delete | `server/roomManager.js` | Replaced by roomService.ts |
| Delete | `server/queueManager.js` | Replaced by queueService.ts |
| Delete | `server/syncManager.js` | Replaced by syncService.ts |
| Delete | `server/youtubeSearch.js` | Replaced by utils/youtubeSearch.ts |

---

## Task 1: TypeScript Toolchain Setup

**Files:**
- Modify: `server/package.json`
- Modify: `package.json` (root)
- Create: `server/tsconfig.json`

- [ ] **Step 1: Install TypeScript dependencies**

Run inside `server/`:
```bash
cd server && npm install --save-dev typescript tsx @types/node @types/express @types/cors
```

- [ ] **Step 2: Update `server/package.json` scripts and add types field**

Replace the `scripts` block in `server/package.json`:
```json
{
  "name": "jamsc-server",
  "version": "1.0.0",
  "description": "JAMSC - Shared Music Listening App Server",
  "main": "dist/index.js",
  "scripts": {
    "dev": "npx tsx watch index.ts",
    "build": "npx tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "socket.io": "^4.7.5",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 3: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["index.ts", "src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Update root `package.json` scripts**

Replace the `scripts` block in the root `package.json`:
```json
{
  "scripts": {
    "dev": "concurrently -n server,client -c cyan,magenta \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "cd server && npm run dev",
    "dev:client": "cd client && npm run dev",
    "build": "cd server && npm install && npm run build && cd ../client && npm install && npm run build",
    "start": "cd server && npm start"
  }
}
```

- [ ] **Step 5: Verify TypeScript is found**

```bash
cd server && npx tsc --version
```
Expected output: `Version 5.x.x`

---

## Task 2: Domain Types + Config

**Files:**
- Create: `server/src/types/index.ts`
- Create: `server/src/config/index.ts`

- [ ] **Step 1: Create `server/src/types/index.ts`**

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

export interface QueueState {
  tracks: SerializedTrack[];
  currentIndex: number;
  currentTrack: SerializedTrack | null;
}
```

- [ ] **Step 2: Create `server/src/config/index.ts`**

```typescript
export const config = {
  port: Number(process.env.PORT) || 3000,
  corsOrigin: process.env.CORS_ORIGIN || '*',
};
```

- [ ] **Step 3: Verify types compile**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors (only these 2 files exist in src/ so far).

- [ ] **Step 4: Commit**

```bash
git add server/src/types/index.ts server/src/config/index.ts server/tsconfig.json server/package.json server/package-lock.json package.json
git commit -m "chore: add TypeScript toolchain and domain types"
```

---

## Task 3: Error Handling Middleware

**Files:**
- Create: `server/src/middlewares/errorHandler.ts`

- [ ] **Step 1: Create `server/src/middlewares/errorHandler.ts`**

```typescript
import { NextFunction, Request, Response } from 'express';

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err instanceof AppError ? err.statusCode : 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
}
```

- [ ] **Step 2: Verify**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/middlewares/errorHandler.ts
git commit -m "feat: add AppError class and global error handler middleware"
```

---

## Task 4: roomService.ts

**Files:**
- Create: `server/src/services/roomService.ts`

- [ ] **Step 1: Create `server/src/services/roomService.ts`**

```typescript
import { Member, Room, RoomSettings } from '../types';

const rooms = new Map<string, Room>();

export interface SerializedMember {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: Date;
}

export interface SerializedRoom {
  id: string;
  hostId: string;
  hostName: string;
  settings: RoomSettings;
  members: SerializedMember[];
  createdAt: Date;
}

export interface LeaveResult {
  room: Room | null;
  deleted?: boolean;
  hostTransferred?: boolean;
  newHostId?: string;
  newHostName?: string;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

export function createRoom(hostSocketId: string, hostName: string): Room {
  const code = generateRoomCode();
  const room: Room = {
    id: code,
    hostId: hostSocketId,
    hostName,
    settings: { allowSkip: false, allowSeek: false },
    members: new Map(),
    createdAt: new Date(),
  };
  room.members.set(hostSocketId, { name: hostName, isHost: true, joinedAt: new Date() });
  rooms.set(code, room);
  return room;
}

export function joinRoom(
  roomCode: string,
  socketId: string,
  memberName: string
): { room?: Room; error?: string } {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Phòng không tồn tại' };

  for (const [, member] of room.members) {
    if (member.name === memberName) return { error: 'Tên này đã được sử dụng trong phòng' };
  }

  room.members.set(socketId, { name: memberName, isHost: false, joinedAt: new Date() });
  return { room };
}

export function leaveRoom(roomCode: string, socketId: string): LeaveResult | null {
  const room = rooms.get(roomCode);
  if (!room) return null;

  const member = room.members.get(socketId);
  if (!member) return null;

  room.members.delete(socketId);
  const isHost = socketId === room.hostId;

  if (isHost) {
    if (room.members.size > 0) {
      const [newHostId, newHostMember] = [...room.members.entries()][0] as [string, Member];
      room.hostId = newHostId;
      room.hostName = newHostMember.name;
      newHostMember.isHost = true;
      return { room, hostTransferred: true, newHostId, newHostName: newHostMember.name };
    } else {
      rooms.delete(roomCode);
      return { room: null, deleted: true };
    }
  }

  return { room, hostTransferred: false };
}

export function updateSettings(
  roomCode: string,
  socketId: string,
  newSettings: Partial<RoomSettings>
): { room?: Room; error?: string } {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Phòng không tồn tại' };
  if (room.hostId !== socketId) return { error: 'Chỉ host mới có quyền thay đổi cài đặt' };
  room.settings = { ...room.settings, ...newSettings };
  return { room };
}

export function getRoom(roomCode: string): Room | null {
  return rooms.get(roomCode) ?? null;
}

export function getRoomBySocket(socketId: string): string | null {
  for (const [code, room] of rooms) {
    if (room.members.has(socketId)) return code;
  }
  return null;
}

export function serializeRoom(room: Room): SerializedRoom {
  const members: SerializedMember[] = [];
  for (const [id, member] of room.members) {
    members.push({ id, name: member.name, isHost: member.isHost, joinedAt: member.joinedAt });
  }
  return {
    id: room.id,
    hostId: room.hostId,
    hostName: room.hostName,
    settings: room.settings,
    members,
    createdAt: room.createdAt,
  };
}
```

- [ ] **Step 2: Verify**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/roomService.ts
git commit -m "feat: add roomService (TypeScript conversion of roomManager)"
```

---

## Task 5: queueService.ts

**Files:**
- Create: `server/src/services/queueService.ts`

- [ ] **Step 1: Create `server/src/services/queueService.ts`**

```typescript
import { v4 as uuidv4 } from 'uuid';
import { Track, SerializedTrack, QueueState } from '../types';

interface QueueEntry {
  queue: Track[];
  currentIndex: number;
}

const queues = new Map<string, QueueEntry>();

export function initQueue(roomCode: string): void {
  if (!queues.has(roomCode)) {
    queues.set(roomCode, { queue: [], currentIndex: -1 });
  }
}

export function addToQueue(roomCode: string, track: Partial<Track>): Track {
  initQueue(roomCode);
  const q = queues.get(roomCode)!;

  const queueItem: Track = {
    id: uuidv4(),
    url: track.url ?? '',
    title: track.title || 'Unknown Track',
    thumbnail: track.thumbnail ?? '',
    duration: track.duration ?? 0,
    source: track.source ?? 'youtube',
    addedBy: track.addedBy ?? 'Unknown',
    addedBySocketId: track.addedBySocketId ?? '',
    sourceId: track.sourceId ?? '',
    displaySource: track.displaySource,
    spotifyUrl: track.spotifyUrl,
    addedAt: new Date(),
    votes: 0,
    votedBy: new Set(),
  };

  q.queue.push(queueItem);

  if (q.queue.length === 1 && q.currentIndex === -1) {
    q.currentIndex = 0;
  }

  return queueItem;
}

export function removeFromQueue(roomCode: string, trackId: string): Track | null {
  const q = queues.get(roomCode);
  if (!q) return null;

  const index = q.queue.findIndex((t) => t.id === trackId);
  if (index === -1) return null;

  const removed = q.queue.splice(index, 1)[0];

  if (index < q.currentIndex) {
    q.currentIndex--;
  } else if (index === q.currentIndex) {
    if (q.queue.length === 0) {
      q.currentIndex = -1;
    } else if (q.currentIndex >= q.queue.length) {
      q.currentIndex = q.queue.length - 1;
    }
  }

  return removed;
}

export function getCurrentTrack(roomCode: string): Track | null {
  const q = queues.get(roomCode);
  if (!q || q.currentIndex === -1 || q.currentIndex >= q.queue.length) return null;
  return q.queue[q.currentIndex];
}

export function removeCurrentAndGetNext(
  roomCode: string
): { removedId: string | null; nextTrack: Track | null } {
  const q = queues.get(roomCode);
  if (!q || q.currentIndex === -1 || q.queue.length === 0) {
    return { removedId: null, nextTrack: null };
  }

  const removedId = q.queue[q.currentIndex].id;
  q.queue.splice(q.currentIndex, 1);

  if (q.queue.length === 0) {
    q.currentIndex = -1;
    return { removedId, nextTrack: null };
  }

  if (q.currentIndex >= q.queue.length) {
    q.currentIndex = q.queue.length - 1;
  }

  return { removedId, nextTrack: q.queue[q.currentIndex] };
}

export function reorderQueue(roomCode: string, trackIds: string[]): boolean {
  const q = queues.get(roomCode);
  if (!q) return false;

  const currentTrackId = q.currentIndex >= 0 ? q.queue[q.currentIndex]?.id : null;
  const trackMap = new Map(q.queue.map((t) => [t.id, t]));
  const newQueue = trackIds.map((id) => trackMap.get(id)).filter((t): t is Track => t !== undefined);

  if (newQueue.length !== q.queue.length) return false;

  q.queue = newQueue;

  if (currentTrackId) {
    q.currentIndex = q.queue.findIndex((t) => t.id === currentTrackId);
  }

  return true;
}

export function skipToTrack(roomCode: string, trackId: string): Track | null {
  const q = queues.get(roomCode);
  if (!q) return null;

  const index = q.queue.findIndex((t) => t.id === trackId);
  if (index === -1) return null;

  q.currentIndex = index;
  return q.queue[index];
}

export function upvoteTrack(
  roomCode: string,
  trackId: string,
  socketId: string
): { voted: boolean; votes: number } | null {
  const q = queues.get(roomCode);
  if (!q) return null;

  const track = q.queue.find((t) => t.id === trackId);
  if (!track) return null;

  const previousVotedTrack = q.queue.find((t) => t.votedBy.has(socketId));

  if (previousVotedTrack && previousVotedTrack.id === trackId) {
    track.votedBy.delete(socketId);
    track.votes = Math.max(0, track.votes - 1);
  } else {
    if (previousVotedTrack) {
      previousVotedTrack.votedBy.delete(socketId);
      previousVotedTrack.votes = Math.max(0, previousVotedTrack.votes - 1);
    }
    track.votedBy.add(socketId);
    track.votes++;
  }

  const pivot = q.currentIndex + 1;
  const played = q.queue.slice(0, pivot);
  const upcoming = q.queue.slice(pivot);
  upcoming.sort((a, b) => b.votes - a.votes);
  q.queue = [...played, ...upcoming];

  return { voted: track.votedBy.has(socketId), votes: track.votes };
}

export function getQueue(roomCode: string): { queue: Track[]; currentIndex: number } {
  const q = queues.get(roomCode);
  if (!q) return { queue: [], currentIndex: -1 };
  return { queue: q.queue, currentIndex: q.currentIndex };
}

export function clearQueue(roomCode: string): void {
  queues.delete(roomCode);
}

function serializeTrack(t: Track): SerializedTrack {
  return {
    id: t.id,
    url: t.url,
    title: t.title,
    thumbnail: t.thumbnail,
    duration: t.duration,
    source: t.source,
    sourceId: t.sourceId,
    addedBy: t.addedBy,
    votes: t.votes,
  };
}

export function serializeQueue(roomCode: string): QueueState {
  const { queue, currentIndex } = getQueue(roomCode);
  return {
    tracks: queue.map(serializeTrack),
    currentIndex,
    currentTrack: currentIndex >= 0 ? serializeTrack(queue[currentIndex]) : null,
  };
}
```

- [ ] **Step 2: Verify**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/queueService.ts
git commit -m "feat: add queueService (TypeScript conversion of queueManager)"
```

---

## Task 6: syncService.ts

**Files:**
- Create: `server/src/services/syncService.ts`

- [ ] **Step 1: Create `server/src/services/syncService.ts`**

```typescript
import { Track, PlaybackState } from '../types';

interface PlaybackEntry {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  lastSyncAt: number;
  startedAt: number | null;
}

const playbackStates = new Map<string, PlaybackEntry>();

export function initPlayback(roomCode: string): void {
  if (!playbackStates.has(roomCode)) {
    playbackStates.set(roomCode, {
      currentTrack: null,
      isPlaying: false,
      currentTime: 0,
      lastSyncAt: Date.now(),
      startedAt: null,
    });
  }
}

export function getPlaybackState(roomCode: string): PlaybackState | null {
  const state = playbackStates.get(roomCode);
  if (!state) return null;

  if (state.isPlaying && state.startedAt !== null) {
    const elapsed = (Date.now() - state.startedAt) / 1000;
    state.currentTime += elapsed;
    state.startedAt = Date.now();
    state.lastSyncAt = Date.now();
  }

  return {
    currentTrack: state.currentTrack,
    isPlaying: state.isPlaying,
    currentTime: state.currentTime,
    lastSyncAt: state.lastSyncAt,
  };
}

export function setTrack(roomCode: string, track: Track): PlaybackState | null {
  initPlayback(roomCode);
  const state = playbackStates.get(roomCode)!;
  state.currentTrack = track;
  state.isPlaying = false;
  state.currentTime = 0;
  state.startedAt = null;
  state.lastSyncAt = Date.now();
  return getPlaybackState(roomCode);
}

export function play(roomCode: string, fromTime?: number): PlaybackState | null {
  initPlayback(roomCode);
  const state = playbackStates.get(roomCode)!;
  if (fromTime !== undefined) state.currentTime = fromTime;
  state.isPlaying = true;
  state.startedAt = Date.now();
  state.lastSyncAt = Date.now();
  return getPlaybackState(roomCode);
}

export function pause(roomCode: string): PlaybackState | null {
  const state = playbackStates.get(roomCode);
  if (!state) return null;

  if (state.isPlaying && state.startedAt !== null) {
    const elapsed = (Date.now() - state.startedAt) / 1000;
    state.currentTime += elapsed;
  }

  state.isPlaying = false;
  state.startedAt = null;
  state.lastSyncAt = Date.now();
  return getPlaybackState(roomCode);
}

export function seek(roomCode: string, time: number): PlaybackState | null {
  const state = playbackStates.get(roomCode);
  if (!state) return null;

  state.currentTime = time;
  if (state.isPlaying) state.startedAt = Date.now();
  state.lastSyncAt = Date.now();
  return getPlaybackState(roomCode);
}

export function clearPlayback(roomCode: string): void {
  playbackStates.delete(roomCode);
}
```

- [ ] **Step 2: Verify**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/syncService.ts
git commit -m "feat: add syncService (TypeScript conversion of syncManager)"
```

---

## Task 7: youtubeSearch Utility

**Files:**
- Create: `server/src/utils/youtubeSearch.ts`

- [ ] **Step 1: Create `server/src/utils/youtubeSearch.ts`**

```typescript
import { ResolvedTrack } from '../types';

const MAX_QUERY_LEN = 200;
const FETCH_TIMEOUT_MS = 12000;
const OEMBED_TIMEOUT_MS = 5000;
const MAX_CANDIDATES = 8;

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
};

interface VideoRenderer {
  videoId?: string;
  title?: {
    accessibility?: { accessibilityData?: { label?: string } };
    runs?: Array<{ text?: string }>;
  };
  thumbnail?: { thumbnails?: Array<{ url?: string }> };
}

function buildTrackFromVideoRenderer(vr: VideoRenderer): ResolvedTrack | null {
  const videoId = vr.videoId;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;

  let title = '';
  if (vr.title?.accessibility?.accessibilityData?.label) {
    title = vr.title.accessibility.accessibilityData.label;
  } else if (Array.isArray(vr.title?.runs)) {
    title = vr.title!.runs!.map((r) => r.text ?? '').join('');
  }

  let thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  const thumbs = vr.thumbnail?.thumbnails;
  if (Array.isArray(thumbs) && thumbs.length > 0) {
    const best = thumbs[thumbs.length - 1];
    if (best?.url) thumbnail = best.url;
  }

  return { source: 'youtube', sourceId: videoId, url: `https://www.youtube.com/watch?v=${videoId}`, title, thumbnail, duration: 0 };
}

function findVideoRenderers(root: unknown, limit = MAX_CANDIDATES): VideoRenderer[] {
  const queue: unknown[] = [root];
  const found: VideoRenderer[] = [];
  const seen = new Set<string>();
  let iters = 0;

  while (queue.length > 0 && iters++ < 200000 && found.length < limit) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;

    const n = node as Record<string, unknown>;
    if (n.videoRenderer && typeof n.videoRenderer === 'object') {
      const vr = n.videoRenderer as VideoRenderer;
      if (vr.videoId && !seen.has(vr.videoId)) {
        seen.add(vr.videoId);
        found.push(vr);
      }
    }

    if (Array.isArray(node)) {
      for (const item of node) queue.push(item);
      continue;
    }

    for (const val of Object.values(n)) {
      if (val && typeof val === 'object') queue.push(val);
    }
  }
  return found;
}

function extractYtInitialDataJson(html: string): unknown | null {
  const marker = 'var ytInitialData = ';
  const pos = html.indexOf(marker);
  if (pos === -1) return null;
  const start = pos + marker.length;
  const end = html.indexOf(';</script>', start);
  if (end === -1) return null;
  try {
    return JSON.parse(html.slice(start, end));
  } catch {
    return null;
  }
}

function fallbackVideoIds(html: string, limit = MAX_CANDIDATES): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const regex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null && ids.length < limit) {
    const id = m[1];
    if (!seen.has(id)) { seen.add(id); ids.push(id); }
  }
  return ids;
}

async function fetchTextWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function isEmbeddableVideo(videoId: string): Promise<boolean> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
  try {
    const response = await fetch(oembedUrl, { signal: controller.signal });
    return response.ok;
  } catch {
    return true;
  } finally {
    clearTimeout(t);
  }
}

export async function searchYouTubeFirstVideo(rawQuery: string): Promise<ResolvedTrack | null> {
  const query = String(rawQuery ?? '').trim().slice(0, MAX_QUERY_LEN);
  if (!query) return null;

  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const html = await fetchTextWithTimeout(url, FETCH_TIMEOUT_MS);
  if (!html) return null;

  const candidateTracks: ResolvedTrack[] = [];
  const seen = new Set<string>();

  const pushTrack = (track: ResolvedTrack | null) => {
    if (!track || !track.sourceId || seen.has(track.sourceId) || candidateTracks.length >= MAX_CANDIDATES) return;
    seen.add(track.sourceId);
    candidateTracks.push(track);
  };

  const ytData = extractYtInitialDataJson(html);
  if (ytData) {
    for (const vr of findVideoRenderers(ytData, MAX_CANDIDATES)) {
      pushTrack(buildTrackFromVideoRenderer(vr));
    }
  }

  for (const vid of fallbackVideoIds(html, MAX_CANDIDATES)) {
    pushTrack({ source: 'youtube', sourceId: vid, url: `https://www.youtube.com/watch?v=${vid}`, title: '', thumbnail: `https://img.youtube.com/vi/${vid}/mqdefault.jpg`, duration: 0 });
  }

  if (candidateTracks.length === 0) return null;

  for (const track of candidateTracks) {
    if (await isEmbeddableVideo(track.sourceId)) return track;
  }

  return candidateTracks[0];
}

export { MAX_QUERY_LEN };
```

- [ ] **Step 2: Verify**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/utils/youtubeSearch.ts
git commit -m "feat: add youtubeSearch util (TypeScript conversion)"
```

---

## Task 8: mediaService.ts

**Files:**
- Create: `server/src/services/mediaService.ts`

- [ ] **Step 1: Create `server/src/services/mediaService.ts`**

```typescript
import { ResolvedTrack } from '../types';
import { searchYouTubeFirstVideo } from '../utils/youtubeSearch';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function extractYouTubeVideoId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();

    if (host === 'youtu.be' || host === 'www.youtu.be') {
      const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      const v = parsed.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      const parts = parsed.pathname.split('/').filter(Boolean);
      const markerIdx = parts.findIndex((p) => p === 'shorts' || p === 'embed' || p === 'live');
      if (markerIdx !== -1) {
        const id = parts[markerIdx + 1];
        if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }
    }
  } catch {
    // invalid URL
  }
  return null;
}

export async function resolveUrl(url: string): Promise<ResolvedTrack | null> {
  const videoId = extractYouTubeVideoId(url);
  if (videoId) {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let title = '';
    let thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    try {
      const oembed = await fetchJson<{ title?: string; thumbnail_url?: string }>(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`
      );
      title = oembed.title ?? '';
      if (oembed.thumbnail_url) thumbnail = oembed.thumbnail_url;
    } catch (e) {
      console.warn('[Resolve] YouTube oEmbed failed:', (e as Error).message);
    }
    return { source: 'youtube', sourceId: videoId, url: videoUrl, title, thumbnail, duration: 0 };
  }

  if (url.includes('soundcloud.com/')) {
    const cleanUrl = url.split('?')[0];
    let title = '';
    let thumbnail = '';
    try {
      const oembed = await fetchJson<{ title?: string; thumbnail_url?: string }>(
        `https://soundcloud.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`
      );
      title = oembed.title ?? '';
      if (oembed.thumbnail_url) thumbnail = oembed.thumbnail_url;
    } catch (e) {
      console.warn('[Resolve] SoundCloud oEmbed failed:', (e as Error).message);
    }
    return { source: 'soundcloud', sourceId: cleanUrl, url: cleanUrl, title, thumbnail, duration: 0 };
  }

  return null;
}

export async function resolvePlaylist(url: string): Promise<ResolvedTrack[] | null> {
  const listMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (!listMatch) return null;

  const playlistId = listMatch[1];
  let html: string;
  try {
    const response = await fetch(`https://www.youtube.com/playlist?list=${playlistId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!response.ok) return null;
    html = await response.text();
  } catch {
    return null;
  }

  const videos: Array<{ videoId: string; title: string }> = [];
  const dataMarker = 'var ytInitialData = ';
  const markerPos = html.indexOf(dataMarker);

  if (markerPos !== -1) {
    const jsonStart = markerPos + dataMarker.length;
    const scriptClose = html.indexOf(';</script>', jsonStart);
    if (scriptClose !== -1) {
      try {
        const ytData = JSON.parse(html.slice(jsonStart, scriptClose)) as unknown;
        const stack: unknown[] = [ytData];
        let iters = 0;
        while (stack.length > 0 && videos.length < 50 && iters++ < 100000) {
          const node = stack.pop();
          if (!node || typeof node !== 'object') continue;
          if (Array.isArray(node)) { for (const item of node) stack.push(item); continue; }
          const n = node as Record<string, unknown>;
          if (n.playlistVideoRenderer && typeof n.playlistVideoRenderer === 'object') {
            const v = n.playlistVideoRenderer as Record<string, unknown>;
            if (typeof v.videoId === 'string') {
              const titleRuns = (v.title as Record<string, unknown> | undefined)?.runs;
              const title = Array.isArray(titleRuns) ? (titleRuns[0] as Record<string, unknown>)?.text as string ?? '' : '';
              videos.push({ videoId: v.videoId, title });
              continue;
            }
          }
          for (const val of Object.values(n)) {
            if (val && typeof val === 'object') stack.push(val);
          }
        }
      } catch {
        // fall through to regex
      }
    }
  }

  if (videos.length === 0) {
    const seen = new Set<string>();
    const regex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(html)) !== null && videos.length < 50) {
      if (!seen.has(m[1])) { seen.add(m[1]); videos.push({ videoId: m[1], title: '' }); }
    }
  }

  if (videos.length === 0) return null;

  return videos.map((v) => ({
    source: 'youtube' as const,
    sourceId: v.videoId,
    url: `https://www.youtube.com/watch?v=${v.videoId}`,
    title: v.title,
    thumbnail: `https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`,
    duration: 0,
  }));
}

export async function resolveSpotify(url: string): Promise<ResolvedTrack> {
  if (!url.includes('open.spotify.com/track/')) {
    throw new Error('Chỉ hỗ trợ link track Spotify (open.spotify.com/track/...)');
  }

  const spotifyUrl = url.split('?')[0];
  const oembed = await fetchJson<{ title?: string; author_name?: string; thumbnail_url?: string }>(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`
  );

  const title = oembed.title ?? '';
  const artist = oembed.author_name ?? '';
  const thumbnail = oembed.thumbnail_url ?? '';

  if (!title) throw new Error('Không đọc được tên bài từ Spotify.');

  const searchQuery = artist ? `${title} ${artist}` : title;
  const ytTrack = await searchYouTubeFirstVideo(searchQuery);
  if (!ytTrack?.sourceId) throw new Error('Không tìm được video YouTube cho bài này.');

  return {
    source: 'youtube',
    displaySource: 'spotify',
    sourceId: ytTrack.sourceId,
    url: `https://www.youtube.com/watch?v=${ytTrack.sourceId}`,
    spotifyUrl,
    title,
    artist,
    thumbnail,
    duration: 0,
  };
}

export async function searchFirst(query: string): Promise<ResolvedTrack | null> {
  const track = await searchYouTubeFirstVideo(query);
  if (!track) return null;

  if (track.url) {
    const enriched = await resolveUrl(track.url);
    if (!enriched?.sourceId) return null;
    track.sourceId = enriched.sourceId;
    if (enriched.title) track.title = enriched.title;
    if (enriched.thumbnail) track.thumbnail = enriched.thumbnail;
  }

  return track;
}
```

- [ ] **Step 2: Verify**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/mediaService.ts
git commit -m "feat: add mediaService (URL resolution extracted from index.js)"
```

---

## Task 9: mediaController + Routes

**Files:**
- Create: `server/src/controllers/mediaController.ts`
- Create: `server/src/routes/media.ts`

- [ ] **Step 1: Create `server/src/controllers/mediaController.ts`**

```typescript
import { NextFunction, Request, Response } from 'express';
import * as mediaService from '../services/mediaService';
import { AppError } from '../middlewares/errorHandler';

export async function resolveUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') throw new AppError(400, 'URL is required');
    const result = await mediaService.resolveUrl(url);
    if (!result) throw new AppError(400, 'URL không được hỗ trợ. Hãy dùng link YouTube hoặc SoundCloud.');
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function resolvePlaylist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') throw new AppError(400, 'URL is required');
    const tracks = await mediaService.resolvePlaylist(url);
    if (!tracks || tracks.length === 0) throw new AppError(400, 'Không thể tải playlist. Hãy kiểm tra link và thử lại.');
    res.json({ tracks });
  } catch (err) {
    next(err);
  }
}

export async function resolveSpotify(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') throw new AppError(400, 'URL là bắt buộc');
    const result = await mediaService.resolveSpotify(url);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function searchFirst(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) throw new AppError(400, 'Nhập từ khóa tìm kiếm.');
    const track = await mediaService.searchFirst(q);
    if (!track) throw new AppError(404, 'Không tìm thấy video có thể phát nhúng. Thử từ khóa khác.');
    res.json({ track });
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 2: Create `server/src/routes/media.ts`**

```typescript
import { Router } from 'express';
import * as mediaController from '../controllers/mediaController';

const router = Router();

router.get('/resolve', mediaController.resolveUrl);
router.get('/resolve-playlist', mediaController.resolvePlaylist);
router.get('/resolve-spotify', mediaController.resolveSpotify);
router.get('/youtube-search-first', mediaController.searchFirst);

export default router;
```

- [ ] **Step 3: Verify**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/mediaController.ts server/src/routes/media.ts
git commit -m "feat: add media controller and routes"
```

---

## Task 10: syncHandlers.ts (with heartbeat)

**Files:**
- Create: `server/src/sockets/syncHandlers.ts`

- [ ] **Step 1: Create `server/src/sockets/syncHandlers.ts`**

```typescript
import { Server, Socket } from 'socket.io';
import * as syncService from '../services/syncService';
import * as queueService from '../services/queueService';
import * as roomService from '../services/roomService';

const heartbeatIntervals = new Map<string, NodeJS.Timeout>();

export function startHeartbeat(io: Server, roomCode: string): void {
  if (heartbeatIntervals.has(roomCode)) return;

  const interval = setInterval(() => {
    const room = roomService.getRoom(roomCode);
    if (!room || room.members.size === 0) {
      stopHeartbeat(roomCode);
      return;
    }
    const state = syncService.getPlaybackState(roomCode);
    if (state) io.to(roomCode).emit('sync:heartbeat', state);
  }, 5000);

  heartbeatIntervals.set(roomCode, interval);
}

export function stopHeartbeat(roomCode: string): void {
  const interval = heartbeatIntervals.get(roomCode);
  if (interval) {
    clearInterval(interval);
    heartbeatIntervals.delete(roomCode);
  }
}

export function registerSyncHandlers(io: Server, socket: Socket): void {
  socket.on('sync:play', ({ time }: { time?: number }, callback: (r: Record<string, unknown>) => void) => {
    const roomCode = roomService.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false });
    const room = roomService.getRoom(roomCode);
    if (!room || room.hostId !== socket.id) return callback?.({ success: false, error: 'Chỉ host' });
    const state = syncService.play(roomCode, time);
    io.to(roomCode).emit('sync:state', state);
    callback?.({ success: true });
  });

  socket.on('sync:pause', (_: unknown, callback: (r: Record<string, unknown>) => void) => {
    const roomCode = roomService.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false });
    const room = roomService.getRoom(roomCode);
    if (!room || room.hostId !== socket.id) return callback?.({ success: false, error: 'Chỉ host' });
    const state = syncService.pause(roomCode);
    io.to(roomCode).emit('sync:state', state);
    callback?.({ success: true });
  });

  socket.on('sync:seek', ({ time }: { time: number }, callback: (r: Record<string, unknown>) => void) => {
    const roomCode = roomService.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false, error: 'Không trong phòng nào' });
    const room = roomService.getRoom(roomCode);
    if (!room) return callback?.({ success: false });
    const isHost = room.hostId === socket.id;
    if (!isHost && !room.settings.allowSeek) return callback?.({ success: false, error: 'Chỉ host mới có quyền tua' });

    const t = Number(time);
    if (!Number.isFinite(t)) return callback?.({ success: false, error: 'Thời gian không hợp lệ' });

    const before = syncService.getPlaybackState(roomCode);
    if (!before?.currentTrack) return callback?.({ success: false, error: 'Chưa có bài để tua' });

    let clamped = Math.max(0, t);
    const dur = before.currentTrack.duration;
    if (dur > 0 && clamped > dur) clamped = dur;

    const state = syncService.seek(roomCode, clamped);
    if (!state) return callback?.({ success: false, error: 'Không thể tua' });
    io.to(roomCode).emit('sync:state', state);
    callback?.({ success: true });
  });

  socket.on('sync:track-ended', (_: unknown, callback: (r: Record<string, unknown>) => void) => {
    const roomCode = roomService.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false });
    const room = roomService.getRoom(roomCode);
    if (!room || room.hostId !== socket.id) return callback?.({ success: false });

    const { removedId, nextTrack } = queueService.removeCurrentAndGetNext(roomCode);
    if (removedId) io.to(roomCode).emit('queue:track-removed', { trackId: removedId });

    if (nextTrack) {
      syncService.setTrack(roomCode, nextTrack);
      const playState = syncService.play(roomCode);
      io.to(roomCode).emit('sync:track-changed', { track: nextTrack, playback: playState });
    } else {
      const state = syncService.pause(roomCode);
      io.to(roomCode).emit('sync:queue-ended', state);
    }
    callback?.({ success: true });
  });

  socket.on('sync:next', (_: unknown, callback: (r: Record<string, unknown>) => void) => {
    const roomCode = roomService.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false });
    const room = roomService.getRoom(roomCode);
    if (!room) return callback?.({ success: false });
    const isHost = room.hostId === socket.id;
    if (!isHost && !room.settings.allowSkip) return callback?.({ success: false, error: 'Chỉ host mới có quyền chuyển bài' });

    const { removedId, nextTrack } = queueService.removeCurrentAndGetNext(roomCode);
    if (removedId) io.to(roomCode).emit('queue:track-removed', { trackId: removedId });

    if (nextTrack) {
      syncService.setTrack(roomCode, nextTrack);
      const playState = syncService.play(roomCode);
      io.to(roomCode).emit('sync:track-changed', { track: nextTrack, playback: playState });
    } else {
      const state = syncService.pause(roomCode);
      io.to(roomCode).emit('sync:queue-ended', state);
    }
    callback?.({ success: true });
  });

  socket.on('sync:request-state', (_: unknown, callback: (r: Record<string, unknown>) => void) => {
    const roomCode = roomService.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false });
    const state = syncService.getPlaybackState(roomCode);
    const queue = queueService.serializeQueue(roomCode);
    callback?.({ success: true, playback: state, queue });
  });
}
```

- [ ] **Step 2: Verify**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/sockets/syncHandlers.ts
git commit -m "feat: add syncHandlers with heartbeat management"
```

---

## Task 11: roomHandlers.ts

**Files:**
- Create: `server/src/sockets/roomHandlers.ts`

- [ ] **Step 1: Create `server/src/sockets/roomHandlers.ts`**

```typescript
import { Server, Socket } from 'socket.io';
import { RoomSettings } from '../types';
import * as roomService from '../services/roomService';
import * as queueService from '../services/queueService';
import * as syncService from '../services/syncService';
import { startHeartbeat, stopHeartbeat } from './syncHandlers';

export function handleLeave(io: Server, socket: Socket): void {
  const roomCode = roomService.getRoomBySocket(socket.id);
  if (!roomCode) return;

  const room = roomService.getRoom(roomCode);
  if (!room) return;

  const member = room.members.get(socket.id);
  const memberName = member?.name ?? 'Unknown';

  const result = roomService.leaveRoom(roomCode, socket.id);

  if (result?.deleted) {
    stopHeartbeat(roomCode);
    queueService.clearQueue(roomCode);
    syncService.clearPlayback(roomCode);
    console.log(`[Room] Room ${roomCode} deleted (empty)`);
  } else if (result?.hostTransferred) {
    io.to(roomCode).emit('room:host-transferred', { newHostId: result.newHostId, newHostName: result.newHostName });
    io.to(roomCode).emit('room:member-left', { memberId: socket.id, memberName });
    console.log(`[Room] Host transferred to ${result.newHostName} in room ${roomCode}`);
  } else if (result) {
    io.to(roomCode).emit('room:member-left', { memberId: socket.id, memberName });
  }
}

export function registerRoomHandlers(io: Server, socket: Socket): void {
  socket.on('room:create', ({ hostName }: { hostName: string }, callback: (r: Record<string, unknown>) => void) => {
    const room = roomService.createRoom(socket.id, hostName);
    socket.join(room.id);
    queueService.initQueue(room.id);
    syncService.initPlayback(room.id);
    startHeartbeat(io, room.id);
    console.log(`[Room] ${hostName} created room ${room.id}`);
    callback({ success: true, room: roomService.serializeRoom(room) });
  });

  socket.on('room:join', (
    { roomCode, memberName }: { roomCode: string; memberName: string },
    callback: (r: Record<string, unknown>) => void
  ) => {
    const code = roomCode.toUpperCase().trim();
    const result = roomService.joinRoom(code, socket.id, memberName);
    if (result.error) return callback({ success: false, error: result.error });

    socket.join(code);
    const room = result.room!;
    console.log(`[Room] ${memberName} joined room ${code}`);

    socket.to(code).emit('room:member-joined', { member: { id: socket.id, name: memberName, isHost: false } });

    callback({
      success: true,
      room: roomService.serializeRoom(room),
      queue: queueService.serializeQueue(code),
      playback: syncService.getPlaybackState(code),
    });
  });

  socket.on('room:update-settings', (
    { settings }: { settings: Partial<RoomSettings> },
    callback: (r: Record<string, unknown>) => void
  ) => {
    const roomCode = roomService.getRoomBySocket(socket.id);
    if (!roomCode) return callback({ success: false, error: 'Không trong phòng nào' });
    const result = roomService.updateSettings(roomCode, socket.id, settings);
    if (result.error) return callback({ success: false, error: result.error });
    io.to(roomCode).emit('room:settings-updated', { settings: result.room!.settings });
    callback({ success: true });
  });

  socket.on('room:leave', (_: unknown, callback: (r: Record<string, unknown>) => void) => {
    handleLeave(io, socket);
    callback?.({ success: true });
  });
}
```

- [ ] **Step 2: Verify**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/sockets/roomHandlers.ts
git commit -m "feat: add roomHandlers with handleLeave shared helper"
```

---

## Task 12: queueHandlers.ts

**Files:**
- Create: `server/src/sockets/queueHandlers.ts`

- [ ] **Step 1: Create `server/src/sockets/queueHandlers.ts`**

```typescript
import { Server, Socket } from 'socket.io';
import { Track } from '../types';
import * as roomService from '../services/roomService';
import * as queueService from '../services/queueService';
import * as syncService from '../services/syncService';

export function registerQueueHandlers(io: Server, socket: Socket): void {
  socket.on('queue:add', ({ track }: { track: Partial<Track> }, callback: (r: Record<string, unknown>) => void) => {
    const roomCode = roomService.getRoomBySocket(socket.id);
    if (!roomCode) return callback({ success: false, error: 'Không trong phòng nào' });

    const room = roomService.getRoom(roomCode)!;
    const member = room.members.get(socket.id);
    track.addedBy = member?.name ?? 'Unknown';
    track.addedBySocketId = socket.id;

    const queueItem = queueService.addToQueue(roomCode, track);
    console.log(`[Queue] ${track.addedBy} added "${track.title}" to room ${roomCode}`);
    io.to(roomCode).emit('queue:track-added', { track: queueItem });

    const { queue } = queueService.getQueue(roomCode);
    if (queue.length === 1) {
      const state = syncService.setTrack(roomCode, queueItem);
      io.to(roomCode).emit('sync:track-changed', { track: queueItem, playback: state });
    }

    callback({ success: true, track: queueItem });
  });

  socket.on('queue:add-batch', (
    { tracks: incoming }: { tracks: Partial<Track>[] },
    callback: ((r: Record<string, unknown>) => void) | undefined
  ) => {
    const roomCode = roomService.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false, error: 'Không trong phòng nào' });

    const room = roomService.getRoom(roomCode)!;
    const member = room.members.get(socket.id);
    const { queue: existingQueue } = queueService.getQueue(roomCode);
    const wasEmpty = existingQueue.length === 0;

    const addedTracks: Track[] = [];
    for (const track of (incoming ?? []).slice(0, 50)) {
      track.addedBy = member?.name ?? 'Unknown';
      track.addedBySocketId = socket.id;
      addedTracks.push(queueService.addToQueue(roomCode, track));
    }

    if (addedTracks.length === 0) return callback?.({ success: false, error: 'Không có bài nào được thêm' });

    io.to(roomCode).emit('queue:tracks-added', { tracks: addedTracks });

    if (wasEmpty) {
      const state = syncService.setTrack(roomCode, addedTracks[0]);
      io.to(roomCode).emit('sync:track-changed', { track: addedTracks[0], playback: state });
    }

    console.log(`[Queue] ${member?.name} added ${addedTracks.length} tracks (batch) to room ${roomCode}`);
    callback?.({ success: true, tracks: addedTracks });
  });

  socket.on('queue:remove', ({ trackId }: { trackId: string }, callback: (r: Record<string, unknown>) => void) => {
    const roomCode = roomService.getRoomBySocket(socket.id);
    if (!roomCode) return callback({ success: false, error: 'Không trong phòng nào' });

    const room = roomService.getRoom(roomCode)!;
    if (room.hostId !== socket.id) return callback({ success: false, error: 'Chỉ host mới có quyền xóa bài' });

    const removed = queueService.removeFromQueue(roomCode, trackId);
    if (!removed) return callback({ success: false, error: 'Không tìm thấy bài hát' });

    io.to(roomCode).emit('queue:track-removed', { trackId });
    callback({ success: true });
  });

  socket.on('queue:reorder', (
    { trackIds }: { trackIds: string[] },
    callback: ((r: Record<string, unknown>) => void) | undefined
  ) => {
    const roomCode = roomService.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false, error: 'Không trong phòng nào' });

    const room = roomService.getRoom(roomCode)!;
    if (room.hostId !== socket.id) return callback?.({ success: false, error: 'Chỉ host mới có quyền sắp xếp' });

    const ok = queueService.reorderQueue(roomCode, trackIds);
    if (!ok) return callback?.({ success: false, error: 'Lỗi sắp xếp' });

    io.to(roomCode).emit('queue:reordered', { queue: queueService.serializeQueue(roomCode) });
    callback?.({ success: true });
  });

  socket.on('queue:upvote', (
    { trackId }: { trackId: string },
    callback: ((r: Record<string, unknown>) => void) | undefined
  ) => {
    const roomCode = roomService.getRoomBySocket(socket.id);
    if (!roomCode) return callback?.({ success: false, error: 'Không trong phòng nào' });

    const result = queueService.upvoteTrack(roomCode, trackId, socket.id);
    if (!result) return callback?.({ success: false, error: 'Không tìm thấy bài hát' });

    io.to(roomCode).emit('queue:reordered', { queue: queueService.serializeQueue(roomCode) });
    callback?.({ success: true, voted: result.voted, votes: result.votes });
  });

  socket.on('queue:skip-to', ({ trackId }: { trackId: string }, callback: (r: Record<string, unknown>) => void) => {
    const roomCode = roomService.getRoomBySocket(socket.id);
    if (!roomCode) return callback({ success: false, error: 'Không trong phòng nào' });

    const room = roomService.getRoom(roomCode)!;
    if (room.hostId !== socket.id) return callback({ success: false, error: 'Chỉ host mới có quyền chuyển bài' });

    const currentTrack = queueService.getCurrentTrack(roomCode);
    if (currentTrack && currentTrack.id !== trackId) {
      queueService.removeFromQueue(roomCode, currentTrack.id);
      io.to(roomCode).emit('queue:track-removed', { trackId: currentTrack.id });
    }

    const track = queueService.skipToTrack(roomCode, trackId);
    if (!track) return callback({ success: false, error: 'Không tìm thấy bài hát' });

    syncService.setTrack(roomCode, track);
    const playState = syncService.play(roomCode);
    io.to(roomCode).emit('sync:track-changed', { track, playback: playState });
    callback({ success: true });
  });
}
```

- [ ] **Step 2: Verify**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/sockets/queueHandlers.ts
git commit -m "feat: add queueHandlers for all queue:* socket events"
```

---

## Task 13: chatHandlers.ts + sockets/index.ts

**Files:**
- Create: `server/src/sockets/chatHandlers.ts`
- Create: `server/src/sockets/index.ts`

- [ ] **Step 1: Create `server/src/sockets/chatHandlers.ts`**

```typescript
import { Server, Socket } from 'socket.io';
import * as roomService from '../services/roomService';

export function registerChatHandlers(io: Server, socket: Socket): void {
  socket.on('chat:message', ({ message }: { message: string }) => {
    const roomCode = roomService.getRoomBySocket(socket.id);
    if (!roomCode) return;

    const room = roomService.getRoom(roomCode);
    const member = room?.members.get(socket.id);
    if (!member) return;

    io.to(roomCode).emit('chat:message', {
      senderId: socket.id,
      senderName: member.name,
      message: message.substring(0, 500),
      timestamp: Date.now(),
      isHost: member.isHost,
    });
  });
}
```

- [ ] **Step 2: Create `server/src/sockets/index.ts`**

```typescript
import { Server, Socket } from 'socket.io';
import { registerRoomHandlers, handleLeave } from './roomHandlers';
import { registerQueueHandlers } from './queueHandlers';
import { registerSyncHandlers } from './syncHandlers';
import { registerChatHandlers } from './chatHandlers';

export function initSockets(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`[Connect] ${socket.id}`);
    registerRoomHandlers(io, socket);
    registerQueueHandlers(io, socket);
    registerSyncHandlers(io, socket);
    registerChatHandlers(io, socket);
    socket.on('disconnect', () => {
      console.log(`[Disconnect] ${socket.id}`);
      handleLeave(io, socket);
    });
  });
}
```

- [ ] **Step 3: Verify**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/sockets/chatHandlers.ts server/src/sockets/index.ts
git commit -m "feat: add chatHandlers and socket registry"
```

---

## Task 14: app.ts

**Files:**
- Create: `server/src/app.ts`

- [ ] **Step 1: Create `server/src/app.ts`**

```typescript
import express, { Application } from 'express';
import path from 'path';
import mediaRouter from './routes/media';
import { errorHandler } from './middlewares/errorHandler';

export function createApp(): Application {
  const app = express();

  // process.cwd() is always `server/` regardless of compiled file location
  app.use(express.static(path.join(process.cwd(), '..', 'public')));
  app.use(express.json());
  app.use('/api', mediaRouter);
  app.use(errorHandler);

  return app;
}
```

- [ ] **Step 2: Verify**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/app.ts
git commit -m "feat: add Express app factory"
```

---

## Task 15: index.ts Entry Point

**Files:**
- Create: `server/index.ts`

- [ ] **Step 1: Create `server/index.ts`**

```typescript
import http from 'http';
import { Server } from 'socket.io';
import { createApp } from './src/app';
import { initSockets } from './src/sockets';
import { config } from './src/config';

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

initSockets(io);

server.listen(config.port, () => {
  console.log(`\n  JAMSC Server running on http://localhost:${config.port}\n`);
});
```

- [ ] **Step 2: Full type check**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors at all.

- [ ] **Step 3: Verify dev server starts**

```bash
cd server && npm run dev
```
Expected output:
```
JAMSC Server running on http://localhost:3000
```
Press Ctrl+C to stop.

- [ ] **Step 4: Commit**

```bash
git add server/index.ts
git commit -m "feat: add TypeScript entry point"
```

---

## Task 16: Delete Old Files + Final Verification

**Files:**
- Delete: `server/index.js`
- Delete: `server/roomManager.js`
- Delete: `server/queueManager.js`
- Delete: `server/syncManager.js`
- Delete: `server/youtubeSearch.js`

- [ ] **Step 1: Delete old JavaScript files**

```bash
rm server/index.js server/roomManager.js server/queueManager.js server/syncManager.js server/youtubeSearch.js
```

- [ ] **Step 2: Verify TypeScript still compiles**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Test production build**

```bash
cd server && npm run build
```
Expected: creates `server/dist/` with compiled JS files, no errors.

- [ ] **Step 4: Verify dev server still starts with tsx**

From repo root:
```bash
npm run dev:server
```
Expected:
```
JAMSC Server running on http://localhost:3000
```
Press Ctrl+C to stop.

- [ ] **Step 5: Add dist/ to .gitignore if not present**

Check `server/.gitignore` or root `.gitignore`. If `dist/` is not listed, add it:
```bash
echo "dist/" >> server/.gitignore
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: remove old .js files after TypeScript migration complete"
```

---

## Post-implementation Checklist

- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run dev:server` (from root) starts server on port 3000
- [ ] `npm run build` (from root) compiles server TypeScript to `dist/`
- [ ] All Socket.IO event names unchanged: `room:*`, `queue:*`, `sync:*`, `chat:*`
- [ ] All REST endpoints unchanged: `/api/resolve`, `/api/resolve-playlist`, `/api/resolve-spotify`, `/api/youtube-search-first`
- [ ] Client code requires zero changes
