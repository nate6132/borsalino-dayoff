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
  const DEFAULT_DURATION_MIN = 30;

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [capacity, setCapacity] = useState(2);

  // pulled from RPCs
  const [active, setActive] = useState([]);
  const [today, setToday] = useState([]);

  // ticker for countdown display
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!supabase || !session) {
    return (
      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <b>BreakLock error:</b> missing <code>supabase</code> or <code>session</code>.
      </div>
    );
  }

  async function load() {
    setMsg("");

    // capacity from break_lock (id=1)
    {
      const { data, error } = await supabase
        .from("break_lock")
        .select("capacity")
        .eq("id", 1)
        .maybeSingle();

      if (!error && data?.capacity) setCapacity(data.capacity);
    }

    // active via RPC (avoids RLS weirdness)
    {
      const { data, error } = await supabase.rpc("get_active_breaks_v1");
      if (error) {
        console.log("get_active_breaks_v1 error:", error);
        setMsg(`Active load error: ${error.message}`);
        setActive([]);
      } else {
        setActive(data || []);
      }
    }

    // today stats via RPC
    {
      const { data, error } = await supabase.rpc("get_breaks_today_v1");
      if (error) {
        console.log("get_breaks_today_v1 error:", error);
        setToday([]);
      } else {
        setToday(data || []);
      }
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // realtime refresh
  useEffect(() => {
    const ch = supabase
      .channel("breaklock-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_breaks" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "break_lock" }, () => load())
      .subscribe();

    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myEmail = (session?.user?.email || "").trim().toLowerCase();
  const myActive = useMemo(() => {
    return (active || []).find((b) => (b.email || "").trim().toLowerCase() === myEmail) || null;
  }, [active, myEmail]);

  const myRemainingMs = useMemo(() => msUntil(myActive?.ends_at), [myActive?.ends_at, tick]);

  const soonestRemainingMs = useMemo(() => {
    if (!active?.length) return 0;
    const soonest = [...active].sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at))[0];
    return msUntil(soonest?.ends_at);
  }, [active, tick]);

  const locked = active.length >= capacity;
  const canStart = !myActive && !locked;

  // ===== actions =====
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
    if (!myActive) return;

    setBusy(true);
    setMsg("");

    const { error } = await supabase
      .from("active_breaks")
      .update({ ended_at: new Date().toISOString(), end_reason: "manual" })
      .eq("id", myActive.id);

    setBusy(false);

    if (error) return setMsg(`End error: ${error.message}`);

    setMsg("✅ Break ended");
    await load();
  }

  async function adminOverrideEnd(row) {
    if (!isAdmin) return alert("Admins only");
    const ok = confirm(`Override end break for ${row.email}?`);
    if (!ok) return;

    setBusy(true);
    setMsg("");

    const { error } = await supabase
      .from("active_breaks")
      .update({ ended_at: new Date().toISOString(), end_reason: "admin_override" })
      .eq("id", row.id);

    setBusy(false);

    if (error) return setMsg(`Admin end error: ${error.message}`);

    // optional email/push is handled by tick function (server side), but you can keep this too if you want.
    setMsg(`✅ Ended ${row.email}'s break`);
    await load();
  }

  // ===== TV BOARD (admin-only from App.jsx route) =====
  if (boardMode) {
    // build “today stats” grouped by email
    const byPerson = {};
    for (const r of today) {
      const key = (r.email || "unknown").toLowerCase();
      if (!byPerson[key]) byPerson[key] = { email: r.email, breaks: [] };
      byPerson[key].breaks.push(r);
    }
    const people = Object.values(byPerson).sort((a, b) => (a.email || "").localeCompare(b.email || ""));

    return (
      <div style={{ display: "grid", gap: 14 }}>
        <div style={styles?.card}>
          <div style={styles?.h3row}>
            <h3 style={{ ...styles?.h3, fontSize: 22 }}>BreakLock — TV Board</h3>
            <span style={styles?.pill}>Capacity: <b>{capacity}</b></span>
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

        {/* ✅ TODAY STATS */}
        <div style={styles?.card}>
          <div style={styles?.h3row}>
            <h3 style={styles?.h3}>Today’s break stats</h3>
            <span style={styles?.pill}>{today.length} total breaks</span>
          </div>

          {people.length === 0 ? (
            <div style={styles?.muted}>No breaks recorded today yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {people.map((p) => (
                <div key={p.email} style={styles?.listItem}>
                  <div style={{ fontWeight: 1000 }}>{p.email}</div>
                  <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                    {p.breaks.map((br) => (
                      <div key={br.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={styles?.muted}>
                          {prettyTime(br.started_at)} → {br.ended_at ? prettyTime(br.ended_at) : "—"}
                        </div>
                        <div style={{ fontWeight: 900 }}>{br.end_reason || (br.ended_at ? "ended" : "active")}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== NORMAL PAGE =====
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

        {/* status */}
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

          {/* actions */}
          <div style={styles?.listItem}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button style={styles?.btnPrimary} onClick={startBreak} disabled={busy || !canStart}>
                {busy ? "Working…" : myActive ? "On Break" : "Start Break"}
              </button>

              {/* ✅ always show End button when you actually have an active break */}
              {myActive && (
                <button style={styles?.btn} onClick={endMyBreak} disabled={busy}>
                  End My Break
                </button>
              )}

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

      {/* admin controls */}
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

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <button style={styles?.btnWarn} onClick={() => adminOverrideEnd(b)} disabled={busy}>
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
