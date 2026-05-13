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
