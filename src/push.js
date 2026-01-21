import { supabase } from "./supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function requireEnv(val, name) {
  if (!val) throw new Error(`Missing ${name}. Add it to Vercel env vars (.env.local for dev).`);
  return val;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("Service workers not supported.");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return reg;
}

export async function enablePush() {
  requireEnv(VAPID_PUBLIC_KEY, "VITE_VAPID_PUBLIC_KEY");

  if (!("Notification" in window)) throw new Error("Notifications not supported.");
  if (!("PushManager" in window)) throw new Error("Push not supported.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications permission not granted.");

  const reg = await ensureServiceWorker();

  const existing = await reg.pushManager.getSubscription();
  const subscription =
    existing ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!endpoint || !p256dh || !auth) throw new Error("Push subscription missing endpoint/keys.");

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) throw new Error("Not logged in.");

  const { error: upsertErr } = await supabase
    .from("push_subscriptions")
    .upsert({ user_id: userData.user.id, endpoint, p256dh, auth }, { onConflict: "endpoint" });

  if (upsertErr) throw new Error(upsertErr.message);

  return { ok: true };
}

export async function sendTestPush() {
  const { data, error } = await supabase.functions.invoke("push-send", {
    body: { title: "BreakLock", body: "Test push ✅", url: "/breaks" },
  });
  if (error) throw new Error(error.message || "push-send failed");
  return data;
}
