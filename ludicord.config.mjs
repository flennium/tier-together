import { defineConfig } from "ludicord/config";

const production = process.env.LUDICORD_DEPLOYMENT_ENV === "production" ||
  process.env.NODE_ENV === "production";
const allowedHosts = (process.env.LUDICORD_ALLOWED_HOSTS ?? "localhost,127.0.0.1")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  discord: {
    clientId: process.env.LUDICORD_DISCORD_CLIENT_ID,
    scopes: ["identify"],
    auth: {
      required: production,
      session: "encrypted-cookie",
      proxyVerification: production,
      activityInstanceVerification: production ? true : "auto",
    },
  },
  activity: {
    defaultEmbed: "home",
    outsideDiscord: "allow",
  },
  react: {
    strictMode: true,
  },
  build: {
    clientAssetWarningLimit: 512000,
  },
  imports: {
    aliases: {
      "@/components": "./components",
      "@/lib": "./lib",
      "@": ".",
    },
  },
  server: {
    port: Number(process.env.PORT ?? 3000),
    host: "0.0.0.0",
    allowedHosts,
    limits: { body: "5mb" },
    requestTimeout: 30000,
    shutdownTimeout: 10000,
  },
  websocket: {
    enabled: true,
    heartbeatInterval: 30000,
    maxPayload: 262144,
    compression: false,
    maxMessagesPerSecond: 120,
    maxBytesPerSecond: 524288,
    backpressureLimit: 524288,
    backpressureStrategy: "queue-latest",
    maxQueuedMessages: 64,
    reconnect: {
      enabled: true,
      attempts: 10,
      initialDelay: 500,
      maxDelay: 10000,
    },
  },
});
