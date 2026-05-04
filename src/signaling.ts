import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import crypto from "crypto";
import { redis, redisSub } from "./redis";
import { roomExists } from "./rooms";

const INSTANCE = process.env.INSTANCE_ID ?? "local";

// Local WebSocket connections: roomId → Map<peerId, WebSocket>
const localPeers = new Map<string, Map<string, WebSocket>>();

type ChannelMessage = { type: string; from: string;[key: string]: unknown };

redisSub.on("message", (channel: string, raw: string) => {
  const roomId = channel.slice("room:".length);
  const msg = JSON.parse(raw) as ChannelMessage;
  dispatch(roomId, msg);
});

function dispatch(roomId: string, msg: ChannelMessage): void {
  const peers = localPeers.get(roomId);
  if (!peers) return;

  for (const [peerId, ws] of peers) {
    if (ws.readyState !== WebSocket.OPEN) continue;

    if (msg.type === "peer-connected") {
      if (peerId === msg.from) continue;
      ws.send(JSON.stringify({ type: "peer-joined", initiator: true }));
    } else if (msg.type === "peer-disconnected") {
      if (peerId !== msg.from) {
        ws.send(JSON.stringify({ type: "peer-left" }));
      }
    } else {
      // relay offer/answer/ice-candidate/leave to everyone except the sender
      if (peerId !== msg.from) {
        const { from: _from, ...payload } = msg;
        ws.send(JSON.stringify(payload));
      }
    }
  }
}

export function attachSignaling(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    const match = req.url?.match(/^\/rooms\/([^/]+)\/ws$/);
    if (!match) {
      socket.destroy();
      return;
    }

    const roomId = match[1] ?? "";
    const exists = await roomExists(roomId);
    const peerCount = await redis.scard(`room:${roomId}:peers`);

    if (!exists || peerCount >= 2) {
      console.log(`[${INSTANCE}] rejected — room not found or full`);
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      onConnection(ws, roomId).catch(() => ws.close());
    });
  });
}

async function onConnection(ws: WebSocket, roomId: string): Promise<void> {
  const peerId = crypto.randomUUID();

  // Register peer locally and in Redis
  if (!localPeers.has(roomId)) localPeers.set(roomId, new Map());
  localPeers.get(roomId)!.set(peerId, ws);
  await redis.sadd(`room:${roomId}:peers`, peerId);

  // Subscribe to room channel if this is our first local peer for this room
  if (localPeers.get(roomId)!.size === 1) {
    await redisSub.subscribe(`room:${roomId}`);
  }

  console.log(`[${INSTANCE}] peer ${peerId} connected to room ${roomId}`);

  const totalPeers = await redis.scard(`room:${roomId}:peers`);
  if (totalPeers >= 2) {
    ws.send(JSON.stringify({ type: "peer-joined", initiator: false }));
    await redis.publish(`room:${roomId}`, JSON.stringify({ type: "peer-connected", from: peerId }));
  }

  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString()) as Record<string, unknown>;
      await redis.publish(`room:${roomId}`, JSON.stringify({ ...msg, from: peerId }));
    } catch { }
  });

  ws.on("close", async () => {
    localPeers.get(roomId)?.delete(peerId);
    await redis.srem(`room:${roomId}:peers`, peerId);

    if (localPeers.get(roomId)?.size === 0) {
      localPeers.delete(roomId);
      await redisSub.unsubscribe(`room:${roomId}`);
    }

    await redis.publish(`room:${roomId}`, JSON.stringify({ type: "peer-disconnected", from: peerId }));
    console.log(`[${INSTANCE}] peer ${peerId} disconnected from room ${roomId}`);
  });
}
