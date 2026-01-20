// supabase/functions/push-send/index.ts

import * as webpush from "jsr:@negrel/webpush";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // ---- 1) ENV ----
  const SUPABASE_URL = Deno.env.get("SB_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? "";
  const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json(500, { error: "Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY" });
  }

  // ---- 2) AUTH (get caller user id from JWT) ----
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!jwt) {
    return json(401, { error: "Missing Authorization Bearer token" });
  }

  const supabaseAsService = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await supabaseAsService.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json(401, { error: "Invalid token" });
  }
  const userId = userData.user.id;

  // ---- 3) BODY ----
  let payload: { title?: string; body?: string; url?: string } = {};
  try {
    payload = await req.json();
  } catch (_) {
    payload = {};
  }

  const title = payload.title ?? "BreakLock";
  const body = payload.body ?? "";
  const url = payload.url ?? "/breaklock";

  // ---- 4) LOAD SUBSCRIPTIONS FOR THIS USER ----
  const { data: subs, error: subsErr } = await supabaseAsService
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (subsErr) {
    return json(500, { error: "Failed to load subscriptions", detail: subsErr.message });
  }

  if (!subs || subs.length === 0) {
    return json(200, { ok: true, sent: 0, dead_deleted: 0, note: "No subscriptions for user" });
  }

  // ---- 5) INIT WEBPUSH ----
  const vapidKeys = {
    publicKey: VAPID_PUBLIC_KEY,
    privateKey: VAPID_PRIVATE_KEY,
  };

  const appServer = await webpush.ApplicationServer.new({
    contactInformation: VAPID_SUBJECT.startsWith("mailto:")
      ? VAPID_SUBJECT
      : `mailto:${VAPID_SUBJECT}`,
    vapidKeys,
  });

  // ---- 6) SEND TO EACH SUB ----
  let sent = 0;
  let deadDeleted = 0;
  const failures: Array<{ id: number; status?: number; error: string }> = [];

  const messageJson = JSON.stringify({ title, body, url });

  for (const s of subs) {
    try {
      const subscription = {
        endpoint: s.endpoint,
        keys: {
          p256dh: s.p256dh,
          auth: s.auth,
        },
      };

      const subscriber = appServer.subscribe(subscription);
      const res = await subscriber.pushTextMessage(messageJson, {
        // Optional extras:
        // ttl: 60,
        // urgency: "normal",
      });

      // The library returns a Response-like object for fetch outcomes
      const status = (res as Response).status;

      if (status >= 200 && status < 300) {
        sent += 1;
        continue;
      }

      // If the push service says the subscription is dead, delete it.
      // Common: 404/410
      if (status === 404 || status === 410) {
        const { error: delErr } = await supabaseAsService
          .from("push_subscriptions")
          .delete()
          .eq("id", s.id);

        if (!delErr) deadDeleted += 1;
      } else {
        failures.push({ id: s.id, status, error: `Push failed with status ${status}` });
      }
    } catch (e) {
      failures.push({ id: s.id, error: (e as Error)?.message ?? String(e) });
    }
  }

  return json(200, { ok: true, sent, dead_deleted: deadDeleted, failures });
});
