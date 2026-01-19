// src/push.js
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Enable push for the currently logged-in user.
 * Pass { supabase, session } from App.jsx
 */
export async function enablePush({ supabase, session }) {
  // Always re-check session in case PWA container has different storage timing
  const { data } = await supabase.auth.getSession();
  const realSession = session || data.session;

  if (!realSession?.user) {
    throw new Error("Not logged in (open the app from your home screen and log in there)");
  }

  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers not supported on this device/browser");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission denied");
  }

  // Register SW (must be in /public/sw.js)
  const reg = await navigator.serviceWorker.register("/sw.js");

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) throw new Error("Missing VITE_VAPID_PUBLIC_KEY");

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  const json = sub.toJSON();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: realSession.user.id,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) throw error;

  return true;
}
