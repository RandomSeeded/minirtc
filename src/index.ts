import express from "express";
import { createServer } from "http";
import path from "path";
import { createRoom, getRoom } from "./rooms";
import { attachSignaling } from "./signaling";

const app = express();
const server = createServer(app);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/rooms", (_req, res) => {
  const room = createRoom();
  res.status(201).json({ id: room.id });
});

app.get("/api/rooms/:id", (req, res) => {
  const room = getRoom(req.params.id ?? "");
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json({ id: room.id, createdAt: room.createdAt });
});

attachSignaling(server);

// serve client build in production
if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
