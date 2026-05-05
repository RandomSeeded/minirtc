import express from "express";
import { createServer } from "http";
import path from "path";
import { createRoom, roomExists } from "./rooms";
import { attachSignaling } from "./signaling";
import { redis, redisSub } from "./redis";

export function createApp() {
  const app = express();
  const server = createServer(app);

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/rooms", async (_req, res) => {
    const id = await createRoom();
    console.log(`[api] room created: ${id}`);
    res.status(201).json({ id });
  });

  app.get("/api/rooms/:id", async (req, res) => {
    const exists = await roomExists(req.params.id ?? "");
    if (!exists) {
      console.warn(`[api] room not found: ${req.params.id}`);
      res.status(404).json({ error: "Room not found" });
      return;
    }
    res.json({ id: req.params.id });
  });

  attachSignaling(server, redis, redisSub);

  if (process.env.NODE_ENV === "production") {
    const clientDist = path.join(__dirname, "../client/dist");
    app.use(express.static(clientDist));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  return { app, server };
}
