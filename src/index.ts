import { createApp } from "./app";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const { server } = createApp();

server.listen(PORT, () => {
  console.log(`[${process.env.INSTANCE_ID ?? "local"}] listening on port ${PORT}`);
});
