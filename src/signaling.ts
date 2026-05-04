import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { getRoom } from "./rooms";
import type { Room } from "./rooms";

export function attachSignaling(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const match = req.url?.match(/^\/rooms\/([^/]+)\/ws$/);
    if (!match) {
      socket.destroy();
      return;
    }

    const room = getRoom(match[1] ?? "");
    if (!room || room.peers.size >= 2) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      onConnection(ws, room);
    });
  });
}

function onConnection(ws: WebSocket, room: Room): void {
  room.peers.add(ws);
  console.log(`[signaling] peer connected to room ${room.id}, peers now: ${room.peers.size}`);

  const other = getOther(ws, room.peers);
  if (other) {
    console.log(`[signaling] sending peer-joined to both peers (other.readyState=${other.readyState}, ws.readyState=${ws.readyState})`);
    send(other, { type: "peer-joined", initiator: true });
    send(ws,    { type: "peer-joined", initiator: false });
  }

  ws.on("message", (data, isBinary) => {
    const other = getOther(ws, room.peers);
    if (other?.readyState === WebSocket.OPEN) {
      other.send(data, { binary: isBinary });
    }
  });

  ws.on("close", () => {
    room.peers.delete(ws);
    for (const peer of room.peers) {
      send(peer, { type: "peer-left" });
    }
  });
}

function getOther(ws: WebSocket, peers: Set<WebSocket>): WebSocket | undefined {
  for (const peer of peers) {
    if (peer !== ws) return peer;
  }
}

function send(ws: WebSocket, msg: object): void {
  ws.send(JSON.stringify(msg));
}
