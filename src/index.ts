import express from "express";
import { createServer } from "http";
import path from "path";

const app = express();
const server = createServer(app);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
