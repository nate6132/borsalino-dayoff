import { useEffect, useMemo, useState } from "react";

function msUntil(ts) {
  if (!ts) return 0;
  const t = new Date(ts).getTime();
  return Math.max(0, t - Date.now());
}

function fmt(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function prettyTime(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return "—";
  }
}

export default function BreakLockPage({ app, boardMode = false }) {
  const { supabase, session, isAdmin, styles } = app || {};

  if (!supabase || !session) {
    return (
      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <b>BreakLock error:</b> missing <code>supabase</code> or <code>session</code> props.
        <div style={{ marginTop: 8 }}>
          Fix: In <code>App.jsx</code> route, pass:
          <pre style={{ whiteSpace: "pre-wrap" }}>
{`<BreakLockPage app={{ supabase, session, isAdmin, styles }} />`}
          </pre>
        </div>
      </div>
    );
  }

  // ===== CONFIG =====
  const DEFAULT_DURATION_MIN = 30;

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [settings, setSettings] = useState({ max_concurrent: 2, default_duration_minutes: 30 });
  const [active, setActive] = useState([]);   // active breaks (ended_at IS NULL)
  const [history, setHistory] = useState([]); // ended breaks (ended_at IS NOT NULL)

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const myEmail = (session?.user?.email || "").trim().toLowerCase();

  async function load() {
    setMsg("");

    // 1) settings (optional table)
    {
      const { data, error } = await supabase
        .from("breaklock_settings")
        .select("max_concurrent, default_duration_minutes")
        .eq("id", 1)
        .maybeSingle();

      if (!error && data) {
        setSettings({
          max_concurrent: data.max_concurrent ?? 2,
          default_duration_minutes: data.default_duration_minutes ?? 30,
        });
      }
    }

    // 2) active breaks
    {
      const { data, error } = await supabase
        .from("active_breaks")
        .select("id,user_id,email,started_at,ends_at,ended_at,end_reason,created_at,warn_sent")
        .is("ended_at", null)
        .order("started_at", { ascending: true });

      if (error) {
        console.log("ACTIVE LOAD ERROR:", error);
        setMsg(`Active load error: ${error.message}`);
      }
      setActive(data || []);
    }

    // 3) history (ended)
    {
      const { data, error } = await supabase
        .from("active_breaks")
        .select("id,email,started_at,ends_at,ended_at,end_reason,created_at,warn_sent")
        .not("ended_at", "is", null)
        .order("ended_at", { ascending: false })
        .limit(boardMode ? 10 : 25);

      if (error) console.log("HISTORY LOAD ERROR:", error);
      setHistory(data || []);
    }
  }

  // initial load
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("breaklock-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_breaks" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "breaklock_settings" }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myActive = useMemo(() => {
    return (active || []).find((b) => (b.email || "").trim().toLowerCase() === myEmail) || null;
  }, [active, myEmail]);

  const myRemainingMs = useMemo(() => msUntil(myActive?.ends_at), [myActive?.ends_at, tick]);

  const soonestRemainingMs = useMemo(() => {
    if (!active?.length) return 0;
    const soonest = [...active].sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at))[0];
    return msUntil(soonest?.ends_at);
  }, [active, tick]);

  const capacity = settings?.max_concurrent ?? 2;
  const locked = active.length >= capacity;
  const canStart = !myActive && !locked;

  // ========= ACTIONS =========

  async function startBreak() {
    setBusy(true);
    setMsg("");

    const duration = DEFAULT_DURATION_MIN;

    // Prefer RPC (best + safe)
    const { data, error } = await supabase.rpc("start_break_v3", {
      p_duration_minutes: duration,
    });

    console.log("start_break_v3:", { data, error });

    setBusy(false);

    if (error) {
      // common case: rpc not created
      setMsg(
        `Start failed: ${error.message}\n\n` +
        `Make sure you created RPC: start_break_v3(p_duration_minutes int)`
      );
      return;
    }

    if (!data?.ok) {
      if (data?.error === "locked") {
        setMsg(`❌ Breaks locked — capacity reached (${active.length}/${capacity}).`);
        return;
      }
      if (data?.error === "already_on_break") {
        setMsg("⚠️ You're already on break.");
        return;
      }
      setMsg(`Could not start: ${data?.error || "unknown"}`);
      return;
    }

    setMsg("✅ Break started");
    await load();
  }

  async function endMyBreak() {
    setBusy(true);
    setMsg("");

    const { data, error } = await supabase.rpc("end_break_v3", {
      p_reason: "manual",
    });

    console.log("end_break_v3:", { data, error });

    setBusy(false);

    if (error) {
      setMsg(
        `End failed: ${error.message}\n\n` +
        `Make sure you created RPC: end_break_v3(p_reason text)`
      );
      return;
    }

    if (!data?.ok) {
      setMsg(`Could not end: ${data?.error || "unknown"}`);
      return;
    }

    setMsg("✅ Break ended");
    await load();
  }

  async function adminEndBreak(row) {
    if (!isAdmin) return alert("Admins only");
    const ok = confirm(`Override end break for ${row.email}?`);
    if (!ok) return;

    setBusy(true);
    setMsg("");

    const { data, error } = await supabase.rpc("admin_end_break_v3", {
      p_break_id: row.id,
      p_reason: "admin_override",
    });

    console.log("admin_end_break_v3:", { data, error });

    if (error) {
      setBusy(false);
      setMsg(
        `Admin override failed: ${error.message}\n\n` +
        `Make sure you created RPC: admin_end_break_v3(p_break_id bigint, p_reason text) and it checks is_admin`
      );
      return;
    }

    if (!data?.ok) {
      setBusy(false);
      setMsg(`Admin override failed: ${data?.error || "unknown"}`);
      return;
    }

    // Send email (optional)
    try {
      const { error: fnErr } = await supabase.functions.invoke("breaklock-warning-email", {
        body: {
          email: row.email,
          ends_at: new Date().toISOString(),
          minutes_left: 0,
          reason: "admin_override",
          message: "Your break was ended by a manager.",
        },
      });

      if (fnErr) console.log("OVERRIDE EMAIL FAILED:", fnErr);
    } catch (e) {
      console.log("OVERRIDE EMAIL EXCEPTION:", e);
    }

    setBusy(false);
    setMsg(`✅ Ended ${row.email}'s break`);
    await load();
  }

  // ========= TV BOARD =========
  if (boardMode) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <div style={styles?.card}>
          <div style={styles?.h3row}>
            <h3 style={{ ...styles?.h3, fontSize: 22 }}>BreakLock — Live Board</h3>
            <span style={styles?.pill}>
              Capacity: <b>{capacity}</b>
            </span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              {active.length > 0 ? `🟢 ${active.length} currently on break` : "✅ No one is on break"}
            </div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              {active.length > 0 ? `Next ends in: ${fmt(soonestRemainingMs)}` : "Unlocked"}
            </div>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {msg && <div style={{ fontWeight: 900 }}>{msg}</div>}
            {active.length === 0 && <div style={styles?.muted}>Waiting for someone to start a break…</div>}

            {active.map((b) => {
              const rem = msUntil(b.ends_at);
              return (
                <div key={b.id} style={styles?.listItem}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 1000, fontSize: 18 }}>{b.email}</div>
                    <span style={styles?.pill}>⏱ {fmt(rem)}</span>
                  </div>
                  <div style={styles?.muted}>
                    Started: {prettyTime(b.started_at)} • Ends: {prettyTime(b.ends_at)} • {DEFAULT_DURATION_MIN}m
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ========= NORMAL PAGE =========
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={styles?.card}>
        <div style={styles?.h3row}>
          <h3 style={styles?.h3}>BreakLock</h3>
          <span style={styles?.badge}>{isAdmin ? "Admin" : "Employee"}</span>
        </div>

        <p style={styles?.muted}>
          Break duration is <b>{DEFAULT_DURATION_MIN} minutes</b>. Up to <b>{capacity}</b> people can be on break at once.
        </p>

        {msg && <div style={{ marginTop: 10, fontWeight: 900, whiteSpace: "pre-wrap" }}>{msg}</div>}

        {/* STATUS */}
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div style={styles?.listItem}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>
                {active.length > 0 ? `🟢 On break: ${active.length}/${capacity}` : "✅ No one on break"}
              </div>
              <span style={styles?.pill}>{active.length >= capacity ? "Locked (capacity reached)" : "Unlocked"}</span>
            </div>

            {active.length > 0 && (
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                {active.map((b) => (
                  <div key={b.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>{b.email}</div>
                    <div style={{ fontWeight: 900 }}>{fmt(msUntil(b.ends_at))}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ACTIONS */}
          <div style={styles?.listItem}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button style={styles?.btnPrimary} onClick={startBreak} disabled={busy || !canStart}>
                {busy ? "Working…" : "Start Break"}
              </button>

              <button style={styles?.btn} onClick={endMyBreak} disabled={busy || !myActive}>
                End My Break
              </button>

              <button style={styles?.btn} onClick={load} disabled={busy}>
                Refresh
              </button>

              {myActive && (
                <span style={styles?.pill}>
                  Your time left: <b>{fmt(myRemainingMs)}</b>
                </span>
              )}
            </div>

            {!myActive && locked && (
              <div style={{ marginTop: 8, ...styles?.muted }}>
                ❌ Breaks locked — capacity reached. Wait until someone’s timer ends.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ADMIN CONTROLS */}
      {isAdmin && (
        <div style={styles?.card}>
          <div style={styles?.h3row}>
            <h3 style={styles?.h3}>Admin controls</h3>
            <span style={styles?.pill}>Capacity: {capacity}</span>
          </div>

          <p style={styles?.muted}>
            Capacity is stored in <code>breaklock_settings</code>. If you didn’t create that table, it defaults to 2.
          </p>

          <div style={styles?.list}>
            {active.length === 0 && <div style={styles?.muted}>No active breaks.</div>}

            {active.map((b) => (
              <div key={b.id} style={styles?.listItem}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900 }}>{b.email}</div>
                  <span style={styles?.pill}>⏱ {fmt(msUntil(b.ends_at))}</span>
                </div>
                <div style={styles?.muted}>
                  Started: {prettyTime(b.started_at)} • Ends: {prettyTime(b.ends_at)} • {DEFAULT_DURATION_MIN}m
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <button style={styles?.btnWarn} onClick={() => adminEndBreak(b)} disabled={busy}>
                    Override end break
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HISTORY */}
      <div style={styles?.card}>
        <div style={styles?.h3row}>
          <h3 style={styles?.h3}>Recent break history</h3>
          <p style={styles?.muted}>Last {history.length}</p>
        </div>

        <div style={styles?.list}>
          {history.length === 0 && <div style={styles?.muted}>No history yet.</div>}

          {history.map((b) => (
            <div key={b.id} style={styles?.listItem}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 900 }}>{b.email}</div>
                <span style={styles?.pill}>{b.end_reason || "ended"}</span>
              </div>
              <div style={styles?.muted}>
                Start: {new Date(b.started_at).toLocaleString()}
                {b.ended_at ? ` • End: ${new Date(b.ended_at).toLocaleString()}` : ""}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
