// supabase/functions/push-test/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const ALLOWED_ORIGINS = new Set<string>([
  "https://borsalinodayoff.com",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://borsalinodayoff.com";
  return {
    "Access-Control-Allow-Origin": o,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  // ✅ MUST handle preflight FIRST
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers });
  }

  try {
    // Basic auth sanity check (doesn't need to be perfect for test)
    const auth = req.headers.get("authorization") || "";
    const apikey = req.headers.get("apikey") || "";

    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "missing_authorization" }), {
        status: 401,
        headers,
      });
    }
    if (!apikey) {
      return new Response(JSON.stringify({ ok: false, error: "missing_apikey" }), {
        status: 401,
        headers,
      });
    }

    // ✅ For now, just return success so we prove CORS is fixed.
    // Later we’ll actually send a real push from DB subscriptions.
    return new Response(JSON.stringify({ ok: true, message: "push-test reached ✅" }), {
      status: 200,
      headers,
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers,
    });
  }
});
