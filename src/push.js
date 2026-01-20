import { supabase } from "./supabase";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function enablePush() {
  // 0) Confirm user is logged in
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session?.user) throw new Error("Not logged in (open the app, then try again)");

  // 1) Must be secure context (https or localhost)
  if (!window.isSecureContext) {
    throw new Error("Push requires HTTPS (or localhost). Your site is not HTTPS.");
  }

  // 2) Service worker supported?
  if (!("serviceWorker" in navigator)) throw new Error("Service workers not supported");

  // 3) Register SW
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

  // 4) Permission
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("User denied notifications (enable in device/browser settings)");
  }

  // 5) Subscribe
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) throw new Error("Missing VITE_VAPID_PUBLIC_KEY");

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  const json = sub.toJSON();
  const keys = json?.keys || {};

   const json = sub.toJSON();
  const keys = json?.keys || {};

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: session.user.id,
        endpoint: json.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      { onConflict: "endpoint" }
    );

  if (error) throw new Error(`DB save failed: ${error.message}`);

  return true;
}
