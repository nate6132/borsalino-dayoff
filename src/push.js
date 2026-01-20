// src/push.js
import { supabase } from "./supabase";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function enablePush() {
  // 0) Confirm user is logged in
  const { data, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) throw sessErr;

  const session = data?.session;
  if (!session?.user) throw new Error("Not logged in. Refresh and log in again.");

  // 1) Must be secure context (https or localhost)
  if (!window.isSecureContext) {
    throw new Error("Push requires HTTPS (or localhost). Your site is not HTTPS.");
  }

  // 2) Service worker supported?
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers not supported in this browser.");
  }

  // 3) Register SW (sw.js must be in /public so it serves at /sw.js)
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

  // Optional but helpful: make sure we’re using the latest service worker
  try {
    await reg.update();
  } catch {
    // ignore
  }

  // 4) Permission
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications blocked. Enable in browser/device settings.");
  }

  // 5) Subscribe (or reuse existing subscription)
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) throw new Error("Missing VITE_VAPID_PUBLIC_KEY");

  // If already subscribed, reuse it
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  }

  const json = sub.toJSON();
  const endpoint = json?.endpoint;
  const p256dh = json?.keys?.p256dh;
  const auth = json?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new Error("Push subscription missing keys (browser/device blocked).");
  }

  // 6) Save subscription to DB using UPSERT on endpoint
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: session.user.id,
        endpoint,
        p256dh,
        auth,
      },
      { onConflict: "endpoint" }
    );

  if (error) throw new Error(`DB save failed: ${error.message}`);

  return true;
}
