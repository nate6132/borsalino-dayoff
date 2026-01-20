import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  // ✅ Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json({ ok: false, error: "missing_supabase_env" }, 500);
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
      return json({ ok: false, error: "missing_vapid_env" }, 500);
    }

    // Authenticate caller (must be logged in)
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "not_authenticated" }, 401);

    const userId = userData.user.id;

    // Load subscriptions for this user
    const { data: subs, error: subErr } = await supabase
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", userId)
      .order("id", { ascending: false });

    if (subErr) return json({ ok: false, error: subErr.message }, 500);
    if (!subs || subs.length === 0) return json({ ok: false, error: "no_subscriptions_found" }, 400);

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const payload = JSON.stringify({
      title: "BreakLock Test",
      body: "If you see this, push notifications are working ✅",
      ts: new Date().toISOString(),
    });

    const results: any[] = [];
    for (const s of subs) {
      try {
        const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
        await webpush.sendNotification(subscription as any, payload);
        results.push({ endpoint: s.endpoint, ok: true });
      } catch (e) {
        results.push({ endpoint: s.endpoint, ok: false, error: String(e?.message || e) });
      }
    }

    return json({ ok: true, sent: results.length, results });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
