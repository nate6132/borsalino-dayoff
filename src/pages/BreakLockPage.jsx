import { useEffect, useMemo, useRef, useState } from "react";

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
  const [active, setActive] = useState([]);
  const [today, setToday] = useState([]);

  // 1-second ticker for countdown display
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ====== Flicker fix helpers ======
  // loadSeq ensures only the newest load() response updates the UI.
  const loadSeq = useRef(0);

  // we use this so realtime doesn't spam load() while a button action is happening
  const actionInFlight = useRef(false);

  if (!supabase || !session) {
    return (
      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <b>BreakLock error:</b> missing <code>supabase</code> or <code>session</code>.
      </div>
    );
  }

  async function load({ quiet = true } = {}) {
    const seq = ++loadSeq.current;

    // Quiet means: don't clear message while refreshing (prevents UI blink)
    if (!quiet) setMsg("");

    // capacity from break_lock (id=1)
    {
      const { data, error } = await supabase
        .from("break_lock")
        .select("capacity")
        .eq("id", 1)
        .maybeSingle();

      // only apply if this is still the latest load call
      if (seq === loadSeq.current && !error && typeof data?.capacity === "number") {
        setCapacity(data.capacity);
      }
    }

    // active via RPC
    {
      const { data, error } = await supabase.rpc("get_active_breaks_v1");
      if (seq !== loadSeq.current) return;

      if (error) {
        console.log("get_active_breaks_v1 error:", error);
        // Don’t wipe UI to empty unless truly needed; show error instead
        setMsg(`Active load error: ${error.message}`);
      } else {
        setActive(data || []);
      }
    }

    // today stats via RPC
    {
      const { data, error } = await supabase.rpc("get_breaks_today_v1");
      if (seq !== loadSeq.current) return;

      if (error) {
        console.log("get_breaks_today_v1 error:", error);
        // keep whatever was there; avoids blinking
      } else {
        setToday(data || []);
      }
    }
  }

  useEffect(() => {
    load({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // realtime refresh (but don't spam while an action is in flight)
  useEffect(() => {
    const ch = supabase
      .channel("breaklock-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_breaks" }, () => {
        if (actionInFlight.current) return;
        load({ quiet: true });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "break_lock" }, () => {
        if (actionInFlight.current) return;
        load({ quiet: true });
      })
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

  // ===== actions (RPC-ONLY) =====

  async function startBreak() {
    setBusy(true);
    // don't clear msg instantly; avoids message flicker
    actionInFlight.current = true;

    const { data, error } = await supabase.rpc("breaklock_start");

    setBusy(false);

    if (error) {
      actionInFlight.current = false;
      return setMsg(`Start error: ${error.message}`);
    }
    if (!data?.ok) {
      actionInFlight.current = false;
      return setMsg(`Could not start: ${data?.error || "unknown"}`);
    }

    setMsg(data?.already_active ? "ℹ️ You are already on break" : "✅ Break started");

    // Let realtime bring the update. Backup refresh after a tiny delay.
    setTimeout(() => {
      actionInFlight.current = false;
      load({ quiet: true });
    }, 250);
  }

  async function endMyBreak() {
    setBusy(true);
    actionInFlight.current = true;

    const { data, error } = await supabase.rpc("breaklock_end_my");

    setBusy(false);

    if (error) {
      actionInFlight.current = false;
      return setMsg(`End error: ${error.message}`);
    }
    if (!data?.ok) {
      actionInFlight.current = false;
      return setMsg(`Could not end: ${data?.error || "unknown"}`);
    }

    setMsg("✅ Break ended");

    setTimeout(() => {
      actionInFlight.current = false;
      load({ quiet: true });
    }, 250);
  }

  async function adminEndBreak(row) {
    if (!isAdmin) return alert("Admins only");

    const ok = confirm(`Override end break for ${row.email}?`);
    if (!ok) return;

    setBusy(true);
    actionInFlight.current = true;

    const { data, error } = await supabase.rpc("breaklock_admin_end", {
      p_break_id: row.id,
    });

    setBusy(false);

    if (error) {
      actionInFlight.current = false;
      return setMsg(`Admin end error: ${error.message}`);
    }
    if (!data?.ok) {
      actionInFlight.current = false;
      return setMsg(`Admin end failed: ${data?.error || "unknown"}`);
    }

    setMsg("✅ Admin override ended the break");

    setTimeout(() => {
      actionInFlight.current = false;
      load({ quiet: true });
    }, 250);
  }

  // ===== TV BOARD =====
  if (boardMode) {
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
                        <div style={{ fontWeight: 900 }}>
                          {br.end_reason || (br.ended_at ? "ended" : "active")}
                        </div>
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
                {busy ? "Working…" : myActive ? "On Break" : "Start Break"}
              </button>

              {myActive && (
                <button style={styles?.btn} onClick={endMyBreak} disabled={busy}>
                  End My Break
                </button>
              )}

              <button style={styles?.btn} onClick={() => load({ quiet: false })} disabled={busy}>
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
