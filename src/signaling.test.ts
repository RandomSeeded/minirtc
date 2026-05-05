import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { WebSocket } from "ws";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import Redis from "ioredis";
import { attachSignaling } from "./signaling";
import { createRoom } from "./rooms";
import { redis as moduleRedis, redisSub as moduleRedisSub } from "./redis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// --- helpers ---

function nextMessage(ws: WebSocket, timeoutMs = 3000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for message")), timeoutMs);
    ws.once("message", (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

function connectWs(port: number, roomId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/rooms/${roomId}/ws`);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

async function startServer(redisClient: Redis, redisSubClient: Redis): Promise<{ server: Server; port: number; closeSignaling: () => void }> {
  const server = createServer();
  const { close: closeSignaling } = attachSignaling(server, redisClient, redisSubClient);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return { server, port, closeSignaling };
}

// --- teardown of module-level redis used by rooms.ts ---

afterAll(async () => {
  await Promise.all([moduleRedis.quit(), moduleRedisSub.quit()]);
});

// --- tests ---

describe("signaling", () => {
  let server: Server;
  let port: number;
  let redisClient: Redis;
  let redisSubClient: Redis;
  let closeSignaling: () => void;
  const openSockets: WebSocket[] = [];

  function track(ws: WebSocket): WebSocket {
    openSockets.push(ws);
    return ws;
  }

  beforeEach(async () => {
    redisClient = new Redis(REDIS_URL);
    redisSubClient = new Redis(REDIS_URL);
    ({ server, port, closeSignaling } = await startServer(redisClient, redisSubClient));
  });

  afterEach(async () => {
    for (const ws of openSockets) {
      if (ws.readyState !== WebSocket.CLOSED) ws.close();
    }
    openSockets.length = 0;

    closeSignaling();
    // Allow server-side close handlers to finish their Redis operations before quitting
    await new Promise((r) => setTimeout(r, 100));

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await Promise.all([redisClient.quit(), redisSubClient.quit()]);
  });

  describe("peer lifecycle", () => {
    it("first peer receives no message on connect", async () => {
      const roomId = await createRoom();
      const peer1 = track(await connectWs(port, roomId));

      const messages: unknown[] = [];
      peer1.on("message", (data) => messages.push(JSON.parse(data.toString())));
      await new Promise((r) => setTimeout(r, 100));

      expect(messages).toHaveLength(0);
    });

    it("second peer receives peer-joined with initiator: false", async () => {
      const roomId = await createRoom();
      track(await connectWs(port, roomId));
      const peer2 = track(await connectWs(port, roomId));

      expect(await nextMessage(peer2)).toEqual({ type: "peer-joined", initiator: false });
    });

    it("first peer receives peer-joined with initiator: true when second peer connects", async () => {
      const roomId = await createRoom();
      const peer1 = track(await connectWs(port, roomId));
      const peer1MsgPromise = nextMessage(peer1);
      track(await connectWs(port, roomId));

      expect(await peer1MsgPromise).toEqual({ type: "peer-joined", initiator: true });
    });

    it("rejects a third peer when the room is full", async () => {
      const roomId = await createRoom();
      track(await connectWs(port, roomId));
      const peer2 = track(await connectWs(port, roomId));
      await nextMessage(peer2);

      await expect(connectWs(port, roomId)).rejects.toThrow();
    });

    it("rejects connection to a nonexistent room", async () => {
      await expect(connectWs(port, "does-not-exist")).rejects.toThrow();
    });
  });

  describe("message relay", () => {
    it("relays a message to the other peer", async () => {
      const roomId = await createRoom();
      const peer1 = track(await connectWs(port, roomId));
      const peer1JoinedPromise = nextMessage(peer1);
      const peer2 = track(await connectWs(port, roomId));
      await nextMessage(peer2);
      await peer1JoinedPromise;

      const peer2MsgPromise = nextMessage(peer2);
      peer1.send(JSON.stringify({ type: "offer", sdp: "test-sdp" }));

      expect(await peer2MsgPromise).toEqual({ type: "offer", sdp: "test-sdp" });
    });

    it("does not relay messages back to the sender", async () => {
      const roomId = await createRoom();
      const peer1 = track(await connectWs(port, roomId));
      const peer1JoinedPromise = nextMessage(peer1);
      const peer2 = track(await connectWs(port, roomId));
      await nextMessage(peer2);
      await peer1JoinedPromise;

      const peer1LaterMessages: unknown[] = [];
      peer1.on("message", (data) => peer1LaterMessages.push(JSON.parse(data.toString())));

      const peer2MsgPromise = nextMessage(peer2);
      peer1.send(JSON.stringify({ type: "offer", sdp: "test-sdp" }));
      await peer2MsgPromise;

      await new Promise((r) => setTimeout(r, 50));
      expect(peer1LaterMessages).toHaveLength(0);
    });
  });

  describe("disconnect", () => {
    it("notifies the remaining peer when the other disconnects", async () => {
      const roomId = await createRoom();
      const peer1 = track(await connectWs(port, roomId));
      const peer1JoinedPromise = nextMessage(peer1);
      const peer2 = track(await connectWs(port, roomId));
      await nextMessage(peer2);
      await peer1JoinedPromise;

      const peer1NextMsg = nextMessage(peer1);
      peer2.close();

      expect(await peer1NextMsg).toEqual({ type: "peer-left" });
    });
  });

  describe("cross-node relay", () => {
    let server2: Server;
    let port2: number;
    let redisClient2: Redis;
    let redisSubClient2: Redis;
    let closeSignaling2: () => void;

    beforeEach(async () => {
      redisClient2 = new Redis(REDIS_URL);
      redisSubClient2 = new Redis(REDIS_URL);
      ({ server: server2, port: port2, closeSignaling: closeSignaling2 } = await startServer(redisClient2, redisSubClient2));
    });

    afterEach(async () => {
      closeSignaling2();
      await new Promise((r) => setTimeout(r, 100));
      await new Promise<void>((resolve) => server2.close(() => resolve()));
      await Promise.all([redisClient2.quit(), redisSubClient2.quit()]);
    });

    it("relays a message between peers on different instances via Redis pub/sub", async () => {
      const roomId = await createRoom();
      const peer1 = track(await connectWs(port, roomId));
      const peer1JoinedPromise = nextMessage(peer1);
      const peer2 = track(await connectWs(port2, roomId));
      await nextMessage(peer2);
      await peer1JoinedPromise;

      const peer2MsgPromise = nextMessage(peer2);
      peer1.send(JSON.stringify({ type: "offer", sdp: "cross-node-sdp" }));

      expect(await peer2MsgPromise).toEqual({ type: "offer", sdp: "cross-node-sdp" });
    });
  });
});
