export type CallStatus =
  | "waiting"
  | "ready"
  | "joining"
  | "waiting-for-offer"
  | "in-call"
  | "failed";

export type SignalingMessage =
  | { type: "peer-joined"; initiator: boolean }
  | { type: "peer-left" }
  | { type: "leave" }
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice-candidate"; candidate: RTCIceCandidateInit };
