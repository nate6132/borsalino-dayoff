import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // We don't trust client timers. This endpoint is meant to be called on a schedule (cron)
    // It auto-ends expired breaks so the next person can start.
    //
    // Assumes your table is: active_breaks
    // Columns used: id, active, ends_at, created_at, email, user_id
    //
    // If your column names differ, tell me and I’ll adjust.

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Find all expired active breaks
    const expiredRes = await fetch(
      `${SUPABASE_URL}/rest/v1/active_breaks?select=id,email,user_id,ends_at&active=eq.true&ends_at=lt.${encodeURIComponent(
        new Date().toISOString()
      )}`,
      {
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
      }
    );

    const expiredText = await expiredRes.text();
    if (!expiredRes.ok) {
      return new Response(JSON.stringify({ ok: false, step: "select_expired", response: expiredText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expired = JSON.parse(expiredText) as Array<{
      id: string;
      email: string | null;
      user_id: string | null;
      ends_at: string | null;
    }>;

    if (!expired.length) {
      return new Response(JSON.stringify({ ok: true, ended: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) End each expired break + optionally write history
    let ended = 0;

    for (const b of expired) {
      // Mark it inactive
      const patch = await fetch(`${SUPABASE_URL}/rest/v1/active_breaks?id=eq.${b.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          active: false,
        }),
      });

      const patchText = await patch.text();
      if (!patch.ok) {
        console.log("FAILED TO PATCH:", b.id, patchText);
        continue;
      }

      ended++;

      // Optional: write to break_history if you have it.
      // Comment this out if you don’t have the table.
      await fetch(`${SUPABASE_URL}/rest/v1/break_history`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          user_id: b.user_id,
          email: b.email,
          ended_at: new Date().toISOString(),
          reason: "auto_end",
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true, ended }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
