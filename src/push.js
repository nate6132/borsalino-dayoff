// src/push.js
import { supabase } from "./supabase";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function enablePush(session) {
  if (!session?.user) throw new Error("Not logged in");

  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers not supported");
  }

  // 1️⃣ Register service worker
  const reg = await navigator.serviceWorker.register("/sw.js");

  // 2️⃣ Request permission
  const permission = await Notification.requestPermission();

  // 🔴 iOS BUG FIX: wait a moment before checking
  await new Promise((r) => setTimeout(r, 800));

  if (permission !== "granted") {
    throw new Error("User denied push permission");
  }

  // 3️⃣ Subscribe AFTER permission settles
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) throw new Error("Missing VITE_VAPID_PUBLIC_KEY");

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  const json = sub.toJSON();

  // 4️⃣ Save subscription
  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: session.user.id,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  });

  if (error) throw error;

  return true;
}

