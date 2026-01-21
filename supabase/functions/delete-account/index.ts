import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") return json({ ok: true }, 200);

  try {
    const confirm = (await req.json().catch(() => ({})))?.confirm;
    if (!confirm) return json({ error: "Missing confirm" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
    if (!url || !serviceKey) return json({ error: "Missing SUPABASE_URL or SB_SERVICE_ROLE_KEY" }, 500);

    const auth = req.headers.get("authorization") || "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!jwt) return json({ error: "Missing Authorization bearer token" }, 401);

    const admin = createClient(url, serviceKey);

    // Who is calling?
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Invalid user token" }, 401);

    const userId = userData.user.id;

    // Delete user
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return json({ error: delErr.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}
