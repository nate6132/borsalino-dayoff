// supabase/functions/push-test/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import * as webpush from "jsr:@negrel/webpush";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://borsalinodayoff.com";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-test-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  // ✅ CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  try {
    const origin = req.headers.get("origin") || "";
    if (origin && origin !== ALLOWED_ORIGIN) {
      return json(403, { ok: false, error: "Origin not allowed", origin });
    }

    // Read body (safe)
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // ---- AUTH GATE ----
    // Option A: x-test-token (simple testing)
    const testToken = req.headers.get("x-test-token") || "";
    const expected = Deno.env.get("PUSH_TEST_TOKEN") || "";
    const usedTestToken = expected && testToken && testToken === expected;

    // Option B: Supabase JWT
    const auth = req.headers.get("authorization") || "";
    const hasJwt = auth.toLowerCase().startsWith("bearer ");

    if (!usedTestToken && !hasJwt) {
      return json(401, { ok: false, code: 401, message: "Missing authorization header" });
    }

    // If you only want “ping”, stop here:
    // return json(200, { ok: true, message: "push-test reached ✅", used: usedTestToken ? "x-test-token" : "jwt", origin, ts: new Date().toISOString(), body });

    // ---- REAL PUSH SEND (optional) ----
    // Requires secrets:
    // VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
    // SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    // If VAPID not set, just return ping success (so you can confirm function works)
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(200, {
        ok: true,
        message: "push-test reached ✅ (no VAPID/service role configured, so not sending)",
        used: usedTestToken ? "x-test-token" : "jwt",
        origin,
        ts: new Date().toISOString(),
        body,
      });
    }

    // Init VAPID + app server
    const vapidKeys = { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY };
    const appServer = await webpush.ApplicationServer.new({
      contactInformation: VAPID_SUBJECT,
      vapidKeys,
    });

    // Pull subscriptions from DB
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // If you pass { user_id } in the body we’ll target that user; otherwise send to all
    const userId = body?.user_id ?? null;

    let query = supabase.from("push_subscriptions").select("endpoint,p256dh,auth,user_id");
    if (userId) query = query.eq("user_id", userId);

    const { data, error } = await query;
    if (error) return json(500, { ok: false, error: error.message });

    const subs = data || [];
    let sent = 0;
    let failed = 0;

    // Send a simple notification payload
    const payload = JSON.stringify({
      title: "Borsalino DayOff",
      body: body?.message || "Test push ✅",
      url: "https://borsalinodayoff.com",
    });

    for (const s of subs) {
      try {
        const pushSub = {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        };

        const subscriber = appServer.subscribe(pushSub);
        await subscriber.pushTextMessage(payload, {});
        sent++;
      } catch (e) {
        console.error("push send failed:", e);
        failed++;
      }
    }

    return json(200, {
      ok: true,
      used: usedTestToken ? "x-test-token" : "jwt",
      origin,
      ts: new Date().toISOString(),
      targeted_user_id: userId,
      subscriptions: subs.length,
      sent,
      failed,
    });
  } catch (e) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
});
