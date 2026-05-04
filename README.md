# MiniRTC

A minimal 1:1 WebRTC audio calling app.

## Running locally

Requires Docker and Docker Compose.

```bash
docker compose -f docker-compose.local.yml up --build
```

Open [http://localhost:8080](http://localhost:8080), create a room, and share the URL with someone else.

## What's built

- **1:1 audio calls** over WebRTC (peer-to-peer, no media goes through the server)
- **WebSocket signaling** — offer/answer/ICE candidate exchange to establish the peer connection
- **Redis pub/sub** — routes signaling messages across multiple server instances so peers don't need to land on the same node
- **Multi-instance deployment** — nginx load balancer in front of 3 Node.js instances, demonstrating horizontal scalability
- **React frontend** — room creation, call state UI, mute toggle

## What's not built

- **TURN server** — only Google's public STUN is used. Calls will fail on networks that block direct peer connections (e.g., symmetric NAT)
- **Authentication** — anyone with a room URL can join
- **More than 2 participants** — rooms are hard-limited to 2 peers
- **Reconnection** — if either peer disconnects mid-call, they must rejoin manually
- **Video** — audio only
- **Persistent rooms** — no database; room state lives in Redis with a 24-hour TTL
