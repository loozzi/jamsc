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
