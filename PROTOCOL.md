# WebSocket Signaling Protocol

WebSocket endpoint: `ws(s)://<host>/rooms/:roomId/ws`

## Server → Client

| Message | Fields | Description |
|---------|--------|-------------|
| `peer-joined` | `initiator: boolean` | Sent to both peers when the second peer connects. `initiator: true` to the first peer, `initiator: false` to the second. |
| `peer-left` | — | Sent to the remaining peer when the other disconnects ungracefully. |

## Client → Client (relayed by server)

| Message | Fields | Description |
|---------|--------|-------------|
| `leave` | — | Graceful hangup notification. |
| `offer` | `sdp: string` | WebRTC offer, sent by the initiator. |
| `answer` | `sdp: string` | WebRTC answer, sent by the non-initiator. |
| `ice-candidate` | `candidate: RTCIceCandidateInit` | Trickle ICE candidates, sent by both peers. |
