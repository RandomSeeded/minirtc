import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import { createApp } from "./app";

vi.mock("./rooms", () => ({
  createRoom: vi.fn(),
  roomExists: vi.fn(),
}));

vi.mock("./signaling", () => ({
  attachSignaling: vi.fn(),
}));

import { createRoom, roomExists } from "./rooms";

const { app } = createApp();
const request = supertest(app);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await request.get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("POST /api/rooms", () => {
  it("returns 201 with the new room id", async () => {
    vi.mocked(createRoom).mockResolvedValue("test-room-id");

    const res = await request.post("/api/rooms");

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: "test-room-id" });
  });
});

describe("GET /api/rooms/:id", () => {
  it("returns 200 with the room id when the room exists", async () => {
    vi.mocked(roomExists).mockResolvedValue(true);

    const res = await request.get("/api/rooms/test-room-id");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "test-room-id" });
  });

  it("returns 404 when the room does not exist", async () => {
    vi.mocked(roomExists).mockResolvedValue(false);

    const res = await request.get("/api/rooms/nonexistent");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Room not found" });
  });
});
