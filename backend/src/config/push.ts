import { env } from "./env.js";

export const pushConfig = {
  enabled: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
  publicKey: env.VAPID_PUBLIC_KEY ?? "",
  privateKey: env.VAPID_PRIVATE_KEY ?? "",
  subject: env.VAPID_SUBJECT,
};
