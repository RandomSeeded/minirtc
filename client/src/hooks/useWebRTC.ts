import { useRef, useState } from "react";
import type { RefObject } from "react";
import type { CallStatus } from "../types";

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
      if (pc.connectionState === "failed") { hangup(); setStatus("failed"); }
    };

    return pc;
  }

  function hangup(): void {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pendingOfferRef.current = null;
    setMuted(false);
  }

  function setInitiator(initiator: boolean): void {
    isInitiatorRef.current = initiator;
  }

  async function handleOffer(sdp: string): Promise<void> {
    if (!pcRef.current) {
      pendingOfferRef.current = sdp;
      return;
    }
    const pc = pcRef.current;
    await pc.setRemoteDescription({ type: "offer", sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    wsRef.current?.send(JSON.stringify({ type: "answer", sdp: answer.sdp }));
  }

  async function handleAnswer(sdp: string): Promise<void> {
    await pcRef.current?.setRemoteDescription({ type: "answer", sdp });
  }

  async function handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await pcRef.current?.addIceCandidate(candidate);
  }

  async function joinCall(): Promise<void> {
    setStatus("joining");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      setStatus("mic-error");
      return;
    }
    localStreamRef.current = stream;

    const pc = createPeerConnection();
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    if (isInitiatorRef.current) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current?.send(JSON.stringify({ type: "offer", sdp: offer.sdp }));
      setStatus("connecting");
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

  return { joinCall, leaveCall, toggleMute, muted, remoteAudioRef, hangup, setInitiator, handleOffer, handleAnswer, handleIceCandidate };
}
