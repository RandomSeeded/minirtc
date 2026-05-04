import Redis from "ioredis";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";

// Two connections required: SUBSCRIBE puts a connection into subscribe-only mode
export const redis = new Redis(url);
export const redisSub = new Redis(url);
