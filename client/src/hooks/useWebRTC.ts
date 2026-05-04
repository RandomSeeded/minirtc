import { useRef, useState } from "react";
import type { RefObject } from "react";
import type { CallStatus, SignalingMessage } from "../types";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export function useWebRTC(
  wsRef: RefObject<WebSocket | null>,
  setStatus: (s: CallStatus) => void
) {
  const [muted, setMuted] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const isInitiatorRef = useRef(false);
  const pendingOfferRef = useRef<string | null>(null);

  function createPeerConnection(): RTCPeerConnection {
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

  async function handleOffer(sdp: string): Promise<void> {
    const pc = pcRef.current!;
    await pc.setRemoteDescription({ type: "offer", sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    wsRef.current?.send(JSON.stringify({ type: "answer", sdp: answer.sdp }));
  }

  function hangup(): void {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pendingOfferRef.current = null;
    setMuted(false);
  }

  async function joinCall(): Promise<void> {
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

  function leaveCall(): void {
    wsRef.current?.send(JSON.stringify({ type: "leave" }));
    hangup();
    setStatus("ready");
  }

  function toggleMute(): void {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }

  async function onMessage(msg: SignalingMessage): Promise<void> {
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
      pcRef.current ? await handleOffer(msg.sdp) : (pendingOfferRef.current = msg.sdp);
    }
    if (msg.type === "answer") {
      await pcRef.current?.setRemoteDescription({ type: "answer", sdp: msg.sdp });
      setStatus("in-call");
    }
    if (msg.type === "ice-candidate") {
      await pcRef.current?.addIceCandidate(msg.candidate);
    }
  }

  return { joinCall, leaveCall, toggleMute, muted, remoteAudioRef, onMessage };
}
