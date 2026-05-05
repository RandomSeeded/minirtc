import Redis from "ioredis";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";

function attachLogs(client: Redis, name: string): void {
  client.on("connect",      () => console.log(`[redis:${name}] connected`));
  client.on("reconnecting", () => console.warn(`[redis:${name}] reconnecting`));
  client.on("error",        (err: Error) => console.error(`[redis:${name}] error`, err.message));
}

// Two connections required: SUBSCRIBE puts a connection into subscribe-only mode
export const redis = new Redis(url);
export const redisSub = new Redis(url);

attachLogs(redis, "cmd");
attachLogs(redisSub, "sub");
