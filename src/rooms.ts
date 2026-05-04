import crypto from "crypto";
import { redis } from "./redis";

const ROOM_TTL_SECONDS = 24 * 60 * 60;

export async function createRoom(): Promise<string> {
  const id = crypto.randomUUID();
  await redis.set(`room:${id}`, "1", "EX", ROOM_TTL_SECONDS);
  return id;
}

export async function roomExists(id: string): Promise<boolean> {
  return (await redis.exists(`room:${id}`)) === 1;
}
