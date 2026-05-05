# MiniRTC — Design Decisions

## Technology choices 

- WebSockets: bidirectional communication layer between backend service and frontend. Other options being http long-polling or SSE, but websockets chosen for simplicity / to unify the communication layer
- WebRTC: p2p handling of audio/video traffic. Chosen to minimize our bandwidth (costs) and e2e user-facing latency (no hop required to our servers)
- Redis pub/sub: enables horizontal scaling of the backend application server. Handles the issue of users not being guaranteed to be colocated on the same backend server instance: we emit an event for a given roomId, and the appropriate backend server instances are subscribed to events for that roomId. NOTE: we could also do colocation for horizontal scaling - this would be the right approach if we wanted to support 3+ clients in a room.

## What breaks if we had 10k rooms/day?

A single instance of a backend server which was handling all traffic might struggle under 10k rooms/day, but we've taken steps to mitigate that:

1. Our backend server is not serving any audio/video traffic directly, only the bare minimum metadata traffic necessary for clients to establish a p2p connection. This is a burst of traffic on call start, not sustained traffic for the duration of the call.
2. We've chosen to make our backend service horizontally scalable, at the cost of some complexity. We no longer expect both clients to connect to the same server instance (colocation), and we use a small redis pub/sub layer such that we can route outbound websocket messages to the correct node. The docker-compose is running 3 backend server nodes with a round-robin load balancer to demonstrate this horizontal scalability.
3. Rooms are short-lived - they will automatically be pruned from both redis and the backend server after the clients disconnect

With the current implementation I would expect us to be able to handle 10k (direct p2p) calls a day on even very budget hardware, though I can't say I load tested my deployed version! 

One minor exception: we are currently using Google's STUN server - at 20k requests/day we might get rate limited and need to run our own (cheap).

## How would we keep costs sane?

Cost considerations:
- our backend server *never touches audio bytes*, so costs generally don't scale with call volume (other than eventually needing additional backend services)
- redis comfortably handles ~100k ops/sec on a single node. At 10k rooms/day with ~10-20 signaling messages per call, we're well within that ceiling for a long time.
- the main long-term cost consideration will be TURN servers, which will be handling orders of magnitude more traffic than our current implementation
- minimize TURN server usage by only using them when required as a direct p2p connection cannot be established

## What can we do about NAT traversal (TURN) in 'real life'?

NAT traversal: unfortunately our clients may not always be able to establish a direct p2p connection with one another. In that situation we will need to forward the actual audio/video traffic between them with TURN servers. Probably worth looking into whether we can simply buy these as a service (Twilio?) rather than build these out ourselves - this is very latency-sensitive, so geographic distribution ends up being very important here.

Mentioned in previous section, but again: we will want to minimize TURN server usage to only those cases where a direct p2p connection cannot be established.

## Deployed:

[https://minirtc.natewillard.com](https://minirtc.natewillard.com)
