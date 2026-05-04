import express from "express";
import { createServer } from "http";
import path from "path";
import { createRoom, getRoom } from "./rooms";
import { attachSignaling } from "./signaling";

const app = express();
const server = createServer(app);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/rooms", (_req, res) => {
  const room = createRoom();
  res.status(201).json({ id: room.id });
});

app.get("/rooms/:id", (req, res) => {
  const room = getRoom(req.params.id);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json({ id: room.id, createdAt: room.createdAt });
});

attachSignaling(server);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
