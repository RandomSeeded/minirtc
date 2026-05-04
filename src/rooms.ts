import crypto from "crypto";
import type { WebSocket } from "ws";

export interface Room {
  id: string;
  createdAt: Date;
  peers: Set<WebSocket>;
}

const rooms = new Map<string, Room>();

export function createRoom(): Room {
  const room: Room = { id: crypto.randomUUID(), createdAt: new Date(), peers: new Set() };
  rooms.set(room.id, room);
  return room;
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}
