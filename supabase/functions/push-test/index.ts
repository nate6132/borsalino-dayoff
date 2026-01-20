// supabase/functions/push-test/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

function makeCors(origin: string | null) {
  const allowed =
    origin === "https://borsalinodayoff.com" ||
    origin === "https://www.borsalinodayoff.com" ||
    origin?.startsWith("http://localhost:") ||
    origin?.endsWith(".vercel.app");

  return {
    "Access-Control-Allow-Origin": allowed ? origin! : "https://borsalinodayoff.com",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-test-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = makeCors(origin);

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }

  // ✅ Allow either a valid user JWT OR a test token
  const auth = req.headers.get("authorization") || "";
  const testToken = req.headers.get("x-test-token") || "";

  const expected = Deno.env.get("PUSH_TEST_TOKEN") || "";

  const hasUserJwt = auth.toLowerCase().startsWith("bearer ") && auth.length > 20;
  const hasValidTestToken = expected && testToken === expected;

  if (!hasUserJwt && !hasValidTestToken) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Missing auth",
        hint: "Send Authorization: Bearer <user_jwt> OR x-test-token",
        got: { hasAuth: !!auth, hasTestToken: !!testToken },
      }),
      { status: 401, headers }
    );
  }

  // Body (safe)
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: "push-test reached ✅",
      used: hasValidTestToken ? "x-test-token" : "authorization",
      origin,
      ts: new Date().toISOString(),
      body,
    }),
    { status: 200, headers }
  );
});
