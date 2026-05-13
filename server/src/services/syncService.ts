import { Track, PlaybackState } from '../types';

interface PlaybackEntry {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  lastSyncAt: number;
  startedAt: number | null;
}

const playbackStates = new Map<string, PlaybackEntry>();

// getHeartbeat from the original syncManager is intentionally omitted — callers use getPlaybackState directly

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
