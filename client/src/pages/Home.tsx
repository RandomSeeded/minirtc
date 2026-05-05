import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function createRoom() {
    setLoading(true);
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      if (!res.ok) throw new Error(`unexpected status ${res.status}`);
      const { id } = await res.json();
      navigate(`/room/${id}`);
    } catch (err) {
      console.error("failed to create room", err);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-8 text-white">
      <h1 className="text-4xl font-semibold tracking-tight">MiniRTC</h1>
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={createRoom}
          disabled={loading}
          className="bg-white text-gray-950 font-medium px-8 py-3 rounded-full hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creating..." : "Create Room"}
        </button>
        <p className="text-sm text-gray-500">Share the link with one other person to start a call.</p>
      </div>
    </div>
  );
}
