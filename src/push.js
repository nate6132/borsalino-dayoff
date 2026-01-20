// src/push.js
import { supabase } from "./supabase";

// Vercel env:
// VITE_VAPID_PUBLIC_KEY=...
// VITE_SUPABASE_FUNCTIONS_URL=https://<project-ref>.functions.supabase.co
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const FUNCTIONS_BASE_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

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
  if (!("PushManager" in window)) throw new Error("Push not supported in this browser.");
  if (!VAPID_PUBLIC_KEY) throw new Error("Missing VITE_VAPID_PUBLIC_KEY env var.");

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

  if (!endpoint || !p256dh || !auth) throw new Error("Subscription missing endpoint/keys.");

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) throw new Error("Not logged in.");

  const { error: upsertErr } = await supabase
    .from("push_subscriptions")
    .upsert({ user_id: userData.user.id, endpoint, p256dh, auth }, { onConflict: "endpoint" });

  if (upsertErr) throw upsertErr;

  return { ok: true };
}

export async function sendTestPush() {
  if (!FUNCTIONS_BASE_URL) throw new Error("Missing VITE_SUPABASE_FUNCTIONS_URL env var.");

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("No access token. Log out and log back in.");

  const res = await fetch(`${FUNCTIONS_BASE_URL}/push-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: "BreakLock",
      body: "Test push received ✅",
      url: "/breaklock",
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`push-send failed (${res.status}): ${text}`);

  // Optional: return the JSON response for debugging
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
