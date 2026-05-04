import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

type CallStatus =
  | "waiting"
  | "ready"
  | "joining"
  | "waiting-for-offer"
  | "in-call"
  | "failed";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export default function Room() {
  const { id: roomId } = useParams<{ id: string }>();

  const [status, setStatus] = useState<CallStatus>("waiting");
  const [muted, setMuted] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const isInitiatorRef = useRef(false);
  const pendingOfferRef = useRef<string | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/rooms/${roomId}/ws`);
    wsRef.current = ws;

    ws.addEventListener("message", async (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "peer-joined") {
        isInitiatorRef.current = msg.initiator;
        setStatus("ready");
      }

      if (msg.type === "peer-left") {
        hangup();
        setStatus("waiting");
      }

      if (msg.type === "leave") {
        hangup();
        setStatus("ready");
      }

      if (msg.type === "offer") {
        if (pcRef.current) {
          await handleOffer(msg.sdp);
        } else {
          pendingOfferRef.current = msg.sdp;
        }
      }

      if (msg.type === "answer") {
        await pcRef.current?.setRemoteDescription({ type: "answer", sdp: msg.sdp });
        setStatus("in-call");
      }

      if (msg.type === "ice-candidate") {
        await pcRef.current?.addIceCandidate(msg.candidate);
      }
    });

    ws.addEventListener("close", () => setStatus("waiting"));

    return () => ws.close();
  }, [roomId]);

  function createPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        wsRef.current?.send(JSON.stringify({ type: "ice-candidate", candidate }));
      }
    };

    pc.ontrack = (event) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0] ?? null;
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("in-call");
      if (pc.connectionState === "failed") setStatus("failed");
    };

    return pc;
  }

  async function handleOffer(sdp: string) {
    const pc = pcRef.current!;
    await pc.setRemoteDescription({ type: "offer", sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    wsRef.current?.send(JSON.stringify({ type: "answer", sdp: answer.sdp }));
  }

  async function joinCall() {
    setStatus("joining");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;

    const pc = createPeerConnection();
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    if (isInitiatorRef.current) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current?.send(JSON.stringify({ type: "offer", sdp: offer.sdp }));
    } else if (pendingOfferRef.current) {
      await handleOffer(pendingOfferRef.current);
      pendingOfferRef.current = null;
    } else {
      setStatus("waiting-for-offer");
    }
  }

  function hangup() {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pendingOfferRef.current = null;
    setMuted(false);
  }

  function leaveCall() {
    wsRef.current?.send(JSON.stringify({ type: "leave" }));
    hangup();
    setStatus("ready");
  }

  function toggleMute() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }

  const statusText: Record<CallStatus, string> = {
    waiting: "Waiting for other user...",
    ready: "Peer connected — click Join Call",
    joining: "Getting microphone...",
    "waiting-for-offer": "Waiting for offer...",
    "in-call": "In call",
    failed: "Connection failed",
  };

  const inCall = status === "in-call" || status === "waiting-for-offer" || status === "joining";
  const isActive = status === "in-call";

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-between py-10 px-4">

      {/* Header */}
      <div className="text-center">
        <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">Room</p>
        <code className="text-xs text-gray-500 bg-gray-900 px-3 py-1 rounded-full">{roomId}</code>
      </div>

      {/* Status */}
      <div className="flex flex-col items-center gap-3">
        <div className={`rounded-full transition-all duration-500 ${isActive ? "w-16 h-16 bg-green-400" : "w-3 h-3 bg-gray-600"}`} />
        <p className="text-2xl font-medium">{statusText[status]}</p>
      </div>

      {/* Controls */}
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
