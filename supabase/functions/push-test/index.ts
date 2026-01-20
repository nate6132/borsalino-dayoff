import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://borsalinodayoff.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json(500, {
        ok: false,
        error: "Missing secrets",
        missing: [
          ...(SUPABASE_URL ? [] : ["SUPABASE_URL"]),
          ...(SERVICE_ROLE_KEY ? [] : ["SUPABASE_SERVICE_ROLE_KEY"]),
        ],
      });
    }

    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return json(401, { ok: false, error: "Missing authorization header" });

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return json(401, { ok: false, error: "Invalid JWT", details: userErr?.message || "no user" });
    }

    const userId = userData.user.id;

    const { data: sub, error: subErr } = await sb
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, created_at")
      .eq("user_id", userId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subErr) return json(500, { ok: false, error: "DB read failed", details: subErr.message });

    return json(200, {
      ok: true,
      message: "push-test works ✅ (no push send yet)",
      user_id: userId,
      has_subscription: !!sub,
      subscription_id: sub?.id ?? null,
      endpoint_start: sub?.endpoint ? sub.endpoint.slice(0, 45) + "..." : null,
      ts: new Date().toISOString(),
    });
  } catch (e) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
});
