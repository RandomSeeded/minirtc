import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  async function createRoom() {
    const res = await fetch("/api/rooms", { method: "POST" });
    const { id } = await res.json();
    navigate(`/room/${id}`);
  }

  return (
    <div>
      <h1>MiniRTC</h1>
      <button onClick={createRoom}>Create Room</button>
    </div>
  );
}
