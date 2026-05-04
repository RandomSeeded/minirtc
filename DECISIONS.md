# MiniRTC — Design Decisions

## WebRTC for media

The core requirement is real-time audio between two browsers. The alternatives — relaying audio through the server (SFU/MCU style) or using a managed service like Twilio — both route media bytes through infrastructure we operate. WebRTC sends media peer-to-peer, directly between browsers, which has two concrete benefits:

- **Latency**: no extra server hop in the media path
- **Cost**: the server never touches audio data, so bandwidth and compute costs don't scale with call volume

The tradeoff is that WebRTC is complex — the browser handles encoding, packetization, jitter buffering, and network traversal, but the application still has to orchestrate the connection setup (see: signaling). For a product where the primary concern is call quality and cost, that complexity is worth it.

## WebSockets for signaling

Before two WebRTC peers can connect directly, they need to exchange metadata: SDP offers and answers describing their media capabilities, and ICE candidates describing their network reachability. This exchange requires a server intermediary — neither peer knows how to reach the other yet.

The server's job is to relay these messages as quickly as possible. ICE candidates in particular trickle in continuously and need to be forwarded to the other peer immediately as they arrive. This means we need the server to **push** to clients, not wait to be polled.

HTTP polling would work but adds unnecessary latency on every candidate. SSE can push from server to client, but clients would still need to POST in the other direction — two separate channels for what is fundamentally one bidirectional stream. WebSockets are the natural fit: a single persistent connection, full-duplex, low overhead, and the standard choice for signaling servers.

## Redis pub/sub for cross-instance signaling

Running a single server instance means all WebSocket connections land on the same process — routing a message from peer A to peer B is a local map lookup. That breaks when you scale horizontally: if A is connected to instance 1 and B is connected to instance 2, a message from A arrives at instance 1 with no direct path to B.

The solution is a message bus that all instances share. When A sends a signaling message, instance 1 publishes it to a per-room channel. Every instance that has a peer in that room is subscribed to that channel and receives the message, then forwards it to the appropriate local WebSocket connection.

Redis pub/sub is the right primitive here for a few reasons:

- **Ephemeral by nature**: signaling state only matters for the duration of a call. Redis is an in-memory store — there's no durability overhead for data that has no reason to outlive the process.
- **Low latency**: pub/sub delivery in Redis is sub-millisecond in practice, which matters for ICE candidate forwarding.
- **Operationally simple**: pub/sub is a first-class Redis primitive with no schema, no consumer groups, no offset management. A channel per room, subscribe on first peer arrival, unsubscribe when the last local peer leaves.
