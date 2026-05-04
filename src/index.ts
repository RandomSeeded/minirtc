import express from "express";
import { createServer } from "http";
import path from "path";
import { createRoom, roomExists } from "./rooms";
import { attachSignaling } from "./signaling";

const app = express();
const server = createServer(app);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/rooms", async (_req, res) => {
  const id = await createRoom();
  res.status(201).json({ id });
});

app.get("/api/rooms/:id", async (req, res) => {
  const exists = await roomExists(req.params.id ?? "");
  if (!exists) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json({ id: req.params.id });
});

attachSignaling(server);

if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "../client/dist");
  app.use(express.static(clientDist));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

server.listen(PORT, () => {
  console.log(`[${process.env.INSTANCE_ID ?? "local"}] listening on port ${PORT}`);
});
