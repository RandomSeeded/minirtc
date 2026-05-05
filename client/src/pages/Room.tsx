import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useWebRTC } from "../hooks/useWebRTC";
import type { CallStatus, SignalingMessage } from "../types";

const STATUS_TEXT: Record<CallStatus, string> = {
  waiting: "Waiting for other user...",
  ready: "Peer connected — click Join Call",
  joining: "Getting microphone...",
  connecting: "Connecting...",
  "waiting-for-offer": "Waiting for offer...",
  "in-call": "In call",
  failed: "Connection failed",
};

const IN_CALL_STATUSES: CallStatus[] = ["joining", "connecting", "waiting-for-offer", "in-call"];

export default function Room() {
  const { id: roomId } = useParams<{ id: string }>();
  const [status, setStatus] = useState<CallStatus>("waiting");
  const wsRef = useRef<WebSocket | null>(null);

  const { joinCall, leaveCall, toggleMute, muted, remoteAudioRef,
          hangup, setInitiator, handleOffer, handleAnswer, handleIceCandidate } =
    useWebRTC(wsRef, setStatus);

  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/rooms/${roomId}/ws`);
    wsRef.current = ws;

    ws.addEventListener("message", async (event) => {
      const msg = JSON.parse(event.data) as SignalingMessage;
      switch (msg.type) {
        case "peer-joined":
          setInitiator(msg.initiator);
          setStatus("ready");
          break;
        case "peer-left":
          hangup();
          setStatus("waiting");
          break;
        case "leave":
          hangup();
          setStatus("ready");
          break;
        case "offer":
          await handleOffer(msg.sdp);
          break;
        case "answer":
          await handleAnswer(msg.sdp);
          break;
        case "ice-candidate":
          await handleIceCandidate(msg.candidate);
          break;
      }
    });

    ws.addEventListener("close", () => setStatus("waiting"));

    return () => ws.close();
  }, [roomId]);

  const inCall = IN_CALL_STATUSES.includes(status);
  const isActive = status === "in-call";

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-between py-10 px-4">

      <div className="text-center">
        <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">Room</p>
        <code className="text-xs text-gray-500 bg-gray-900 px-3 py-1 rounded-full">{roomId}</code>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className={`rounded-full transition-all duration-500 ${isActive ? "w-16 h-16 bg-green-400" : "w-3 h-3 bg-gray-600"}`} />
        <p className="text-2xl font-medium">{STATUS_TEXT[status]}</p>
      </div>

      <div className="flex gap-3 items-center h-14">
        {status === "ready" || status === "failed" ? (
          <button
            onClick={joinCall}
            className="bg-green-500 hover:bg-green-400 text-white font-medium px-8 py-3 rounded-full transition-colors cursor-pointer"
          >
            Join Call
          </button>
        ) : null}

        {inCall ? (
          <>
            <button
              onClick={toggleMute}
              className="bg-gray-800 hover:bg-gray-700 text-white font-medium px-6 py-3 rounded-full transition-colors cursor-pointer"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <button
              onClick={leaveCall}
              className="bg-red-600 hover:bg-red-500 text-white font-medium px-6 py-3 rounded-full transition-colors cursor-pointer"
            >
              Leave
            </button>
          </>
        ) : null}
      </div>

      <audio ref={remoteAudioRef} autoPlay />
    </div>
  );
}
