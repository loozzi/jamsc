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
