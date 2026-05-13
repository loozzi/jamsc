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
