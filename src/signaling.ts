import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import crypto from "crypto";
import { redis, redisSub } from "./redis";
import { roomExists } from "./rooms";

const INSTANCE = process.env.INSTANCE_ID ?? "local";
const PING_INTERVAL_MS = 30_000;

const localPeers = new Map<string, Map<string, WebSocket>>();
const isAlive = new WeakMap<WebSocket, boolean>();

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

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!isAlive.get(ws)) {
        console.warn(`[${INSTANCE}] terminating unresponsive connection`);
        ws.terminate();
        return;
      }
      isAlive.set(ws, false);
      ws.ping();
    });
  }, PING_INTERVAL_MS);

  wss.on("close", () => clearInterval(heartbeat));

  server.on("upgrade", async (req, socket, head) => {
    const match = req.url?.match(/^\/rooms\/([^/]+)\/ws$/);
    if (!match) {
      socket.destroy();
      return;
    }

    const roomId = match[1] ?? "";
    const exists = await roomExists(roomId);
    const peerCount = await redis.scard(`room:${roomId}:peers`);

    if (!exists) {
      console.warn(`[${INSTANCE}] rejected — room not found: ${roomId}`);
      socket.destroy();
      return;
    }
    if (peerCount >= 2) {
      console.warn(`[${INSTANCE}] rejected — room full: ${roomId}`);
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      isAlive.set(ws, true);
      ws.on("pong", () => isAlive.set(ws, true));
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

  if (localPeers.get(roomId)!.size === 1) {
    await redisSub.subscribe(`room:${roomId}`);
    console.log(`[${INSTANCE}] subscribed to room:${roomId}`);
  }

  console.log(`[${INSTANCE}] peer ${peerId} connected to room ${roomId}`);

  const totalPeers = await redis.scard(`room:${roomId}:peers`);
  if (totalPeers >= 2) {
    ws.send(JSON.stringify({ type: "peer-joined", initiator: false }));
    await redis.publish(`room:${roomId}`, JSON.stringify({ type: "peer-connected", from: peerId }));
    console.log(`[${INSTANCE}] peer-joined sent to ${peerId}, peer-connected published for room ${roomId}`);
  }

  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString()) as Record<string, unknown>;
      console.log(`[${INSTANCE}] relay ${msg.type} from ${peerId} in room ${roomId}`);
      await redis.publish(`room:${roomId}`, JSON.stringify({ ...msg, from: peerId }));
    } catch (err) {
      console.error(`[${INSTANCE}] failed to parse message from ${peerId}:`, err);
    }
  });

  ws.on("close", async () => {
    localPeers.get(roomId)?.delete(peerId);
    await redis.srem(`room:${roomId}:peers`, peerId);

    if (localPeers.get(roomId)?.size === 0) {
      localPeers.delete(roomId);
      await redisSub.unsubscribe(`room:${roomId}`);
      console.log(`[${INSTANCE}] unsubscribed from room:${roomId}`);
    }

    await redis.publish(`room:${roomId}`, JSON.stringify({ type: "peer-disconnected", from: peerId }));
    console.log(`[${INSTANCE}] peer ${peerId} disconnected from room ${roomId}`);
  });
}
