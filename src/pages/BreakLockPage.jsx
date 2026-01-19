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
    return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export default function BreakLockPage({ app, boardMode = false }) {
  const { supabase, session, isAdmin, styles } = app || {};

  if (!supabase || !session) {
    return (
      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <b>BreakLock error:</b> missing supabase/session
      </div>
    );
  }

  // Admin-only TV
  if (boardMode && !isAdmin) {
    return (
      <div style={styles?.card || { padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <h3 style={styles?.h3 || { margin: 0 }}>Admin only</h3>
        <p style={styles?.muted || { opacity: 0.8 }}>The TV board is only visible to admins.</p>
      </div>
    );
  }

  const DEFAULT_DURATION_MIN = 30;

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [capacity, setCapacity] = useState(2);
  const [active, setActive] = useState([]);
  const [myActive, setMyActive] = useState(null);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  async function load() {
    setMsg("");

    // capacity
    {
      const { data } = await supabase
        .from("break_lock")
        .select("capacity")
        .eq("id", 1)
        .maybeSingle();
      if (data?.capacity) setCapacity(data.capacity);
    }

    // ✅ my active via RPC (bypasses RLS problems)
    {
      const { data, error } = await supabase.rpc("get_my_active_break_v1");
      if (error) {
        console.log("get_my_active_break_v1 error:", error);
        setMyActive(null);
      } else {
        setMyActive((data && data[0]) || null);
      }
    }

    // ✅ all active via RPC (TV + list)
    {
      const { data, error } = await supabase.rpc("get_active_breaks_v1");
      if (error) {
        console.log("get_active_breaks_v1 error:", error);
        setActive([]);
      } else {
        setActive(data || []);
      }
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("breaklock-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_breaks" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "break_lock" }, () => load())
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myRemainingMs = useMemo(() => msUntil(myActive?.ends_at), [myActive?.ends_at, tick]);

  const soonestRemainingMs = useMemo(() => {
    if (!active?.length) return 0;
    const soonest = [...active].sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at))[0];
    return msUntil(soonest?.ends_at);
  }, [active, tick]);

  const locked = active.length >= capacity;
  const canStart = !myActive && !locked;

  async function startBreak() {
    setBusy(true);
    setMsg("");

    const { data, error } = await supabase.rpc("start_break_v3", {
      p_duration_minutes: DEFAULT_DURATION_MIN,
    });

    setBusy(false);

    if (error) return setMsg(`Start error: ${error.message}`);
    if (!data?.ok) return setMsg(`Could not start: ${data?.error || "unknown"}`);

    setMsg("✅ Break started");
    await load();
  }

  async function endMyBreak() {
    setBusy(true);
    setMsg("");

    const { data, error } = await supabase.rpc("end_my_break_v1", {
      p_reason: "manual",
    });

    setBusy(false);

    if (error) return setMsg(`End error: ${error.message}`);
    if (!data?.ok) return setMsg(`Could not end: ${data?.error || "unknown"}`);

    setMsg("✅ Break ended");
    await load();
  }

  async function adminEndBreak(row) {
    if (!isAdmin) return alert("Admins only");
    if (!row?.id) return alert("Missing break id. Refresh and try again.");

    const ok = confirm(`Override end break for ${row.email}?`);
    if (!ok) return;

    setBusy(true);
    setMsg("");

    const { data, error } = await supabase.rpc("admin_end_break_v1", {
      p_break_id: row.id, // uuid
      p_reason: "admin_override",
    });

    setBusy(false);

    if (error) return setMsg(`Admin end error: ${error.message}`);
    if (!data?.ok) return setMsg(`Admin override failed: ${data?.error || "unknown"}`);

    setMsg(`✅ Ended ${row.email}'s break`);
    await load();
  }

  // ===== TV =====
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

          {msg && <div style={{ marginTop: 10, fontWeight: 900, whiteSpace: "pre-wrap" }}>{msg}</div>}

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {active.length === 0 && <div style={styles?.muted}>Waiting for someone to start a break…</div>}

            {active.map((b) => (
              <div key={b.id} style={styles?.listItem}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 1000, fontSize: 18 }}>{b.email}</div>
                  <span style={styles?.pill}>⏱ {fmt(msUntil(b.ends_at))}</span>
                </div>
                <div style={styles?.muted}>
                  Started: {prettyTime(b.started_at)} • Ends: {prettyTime(b.ends_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ===== NORMAL =====
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

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div style={styles?.listItem}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>
                {active.length > 0 ? `🟢 On break: ${active.length}/${capacity}` : "✅ No one on break"}
              </div>
              <span style={styles?.pill}>{locked ? "Locked" : "Unlocked"}</span>
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

          <div style={styles?.listItem}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button style={styles?.btnPrimary} onClick={startBreak} disabled={busy || !canStart}>
                {busy ? "Working…" : "Start Break"}
              </button>

              {/* ✅ Will ALWAYS show when myActive exists */}
              <button style={styles?.btn} onClick={endMyBreak} disabled={busy || !myActive}>
                End My Break
              </button>

              <button style={styles?.btn} onClick={load} disabled={busy}>
                Refresh
              </button>

              {myActive && (
                <span style={styles?.pill}>
                  You are on break • <b>{fmt(myRemainingMs)}</b> left
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div style={styles?.card}>
          <div style={styles?.h3row}>
            <h3 style={styles?.h3}>Admin controls</h3>
            <span style={styles?.pill}>Capacity: {capacity}</span>
          </div>

          <div style={styles?.list}>
            {active.length === 0 && <div style={styles?.muted}>No active breaks.</div>}

            {active.map((b) => (
              <div key={b.id} style={styles?.listItem}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900 }}>{b.email}</div>
                  <span style={styles?.pill}>⏱ {fmt(msUntil(b.ends_at))}</span>
                </div>

                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={styles?.btnWarn} onClick={() => adminEndBreak(b)} disabled={busy}>
                    Override end break
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
