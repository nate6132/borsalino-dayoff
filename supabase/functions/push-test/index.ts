// supabase/functions/push-test/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

function makeCors(origin: string | null) {
  // allow your prod + localhost + Vercel preview domains
  const allowed =
    origin === "https://borsalinodayoff.com" ||
    origin === "https://www.borsalinodayoff.com" ||
    origin?.startsWith("http://localhost:") ||
    origin?.endsWith(".vercel.app");

  return {
    "Access-Control-Allow-Origin": allowed ? origin! : "https://borsalinodayoff.com",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = makeCors(origin);

  // ✅ preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers });
  }

  // ✅ allow GET too so you can open it in the browser and see it work
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }

  // ✅ Read body safely
  let body: unknown = {};
  try {
    if (req.method === "POST") body = await req.json();
  } catch {
    body = {};
  }

  // ✅ Echo some useful debug info (NO secrets)
  const auth = req.headers.get("authorization") || "";
  const apikey = req.headers.get("apikey") || "";

  return new Response(
    JSON.stringify({
      ok: true,
      message: "push-test reached ✅",
      hasAuthorizationHeader: !!auth,
      authorizationStartsWith: auth ? auth.slice(0, 10) : null,
      hasApikeyHeader: !!apikey,
      origin,
      body,
      ts: new Date().toISOString(),
    }),
    { status: 200, headers }
  );
});
