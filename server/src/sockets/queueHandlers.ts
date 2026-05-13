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
