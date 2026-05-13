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
