import { useEffect, useMemo, useRef, useState } from "react";
import { enablePush, sendTestPush } from "../push";

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

  const loadSeq = useRef(0);
  const actionInFlight = useRef(false);

  if (!supabase || !session) {
    return (
      <div className="card">
        <b>BreakLock error:</b> missing <code>supabase</code> or <code>session</code>.
      </div>
    );
  }

  async function load({ quiet = true } = {}) {
    const seq = ++loadSeq.current;
    if (!quiet) setMsg("");

    // capacity
    {
      const { data } = await supabase
        .from("break_lock")
        .select("capacity")
        .eq("id", 1)
        .maybeSingle();

      if (seq === loadSeq.current && typeof data?.capacity === "number") {
        setCapacity(data.capacity);
      }
    }

    // active via approved RPC
    {
      const { data, error } = await supabase.rpc("get_active_breaks_v1");
      if (seq !== loadSeq.current) return;

      if (error) setMsg(`Active load error: ${error.message}`);
      else setActive(data || []);
    }

    // optional today stats RPC (leave if you have it)
    {
      const { data } = await supabase.rpc("get_breaks_today_v1");
      if (seq === loadSeq.current && data) setToday(data);
    }
  }

  useEffect(() => {
    load({ quiet: true });
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel("breaklock-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_breaks" }, () => {
        if (!actionInFlight.current) load({ quiet: true });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "break_lock" }, () => {
        if (!actionInFlight.current) load({ quiet: true });
      })
      .subscribe();

    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line
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

  async function startBreak() {
    setBusy(true);
    actionInFlight.current = true;

    const { error } = await supabase.rpc("start_break_v3");
    setBusy(false);

    if (error) {
      actionInFlight.current = false;
      return setMsg(`Start error: ${error.message}`);
    }

    setMsg("Break started.");
    setTimeout(() => {
      actionInFlight.current = false;
      load({ quiet: true });
    }, 250);
  }

  async function endMyBreak() {
    setBusy(true);
    actionInFlight.current = true;

    const { error } = await supabase.rpc("end_my_break_v1");
    setBusy(false);

    if (error) {
      actionInFlight.current = false;
      return setMsg(`End error: ${error.message}`);
    }

    setMsg("Break ended.");
    setTimeout(() => {
      actionInFlight.current = false;
      load({ quiet: true });
    }, 250);
  }

  async function adminEndBreak(row) {
    if (!isAdmin) return;

    if (!confirm(`Override end break for ${row.email}?`)) return;

    setBusy(true);
    actionInFlight.current = true;

    const { error } = await supabase.rpc("breaklock_admin_end", { p_break_id: row.id });
    setBusy(false);

    if (error) {
      actionInFlight.current = false;
      return setMsg(`Admin end error: ${error.message}`);
    }

    setMsg("Admin override ended the break.");
    setTimeout(() => {
      actionInFlight.current = false;
      load({ quiet: true });
    }, 250);
  }

  async function onEnablePush() {
    try {
      await enablePush();
      setMsg("Notifications enabled.");
    } catch (e) {
      setMsg(e?.message || "Failed to enable notifications.");
    }
  }

  async function onTestPush() {
    try {
      const res = await sendTestPush();
      setMsg(`Push sent. (sent: ${res?.sent ?? "?"})`);
    } catch (e) {
      setMsg(e?.message || "Test push failed.");
    }
  }

  // ===== TV BOARD =====
  if (boardMode) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <div className="card">
          <div className="row between">
            <h3 className="h3">BreakLock — TV Board</h3>
            <span className="chip">Capacity: <b>{capacity}</b></span>
          </div>

          <div className="row between wrap">
            <div className="strong">
              {active.length > 0 ? `${active.length} currently on break` : "No one is on break"}
            </div>
            <div className="strong">
              {active.length > 0 ? `Next ends in: ${fmt(soonestRemainingMs)}` : "Unlocked"}
            </div>
          </div>

          {msg && <div className="notice">{msg}</div>}

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {active.length === 0 && <div className="muted">Waiting for someone to start a break…</div>}

            {active.map((b) => (
              <div key={b.id} className="listItem">
                <div className="row between">
                  <div className="strong">{b.email}</div>
                  <span className="chip">{fmt(msUntil(b.ends_at))}</span>
                </div>
                <div className="muted">
                  Started: {prettyTime(b.started_at)} • Ends: {prettyTime(b.ends_at)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="row between">
            <h3 className="h3">Today’s break stats</h3>
            <span className="chip">{today.length} total breaks</span>
          </div>
          <div className="muted">This section depends on get_breaks_today_v1().</div>
        </div>
      </div>
    );
  }

  // ===== NORMAL PAGE =====
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card">
        <div className="row between wrap">
          <h3 className="h3">BreakLock</h3>
          <span className="chip">{isAdmin ? "Admin" : "Employee"}</span>
        </div>

        <p className="muted" style={{ marginTop: 6 }}>
          Break duration is <b>{DEFAULT_DURATION_MIN} minutes</b>. Up to <b>{capacity}</b> people can be on break.
        </p>

        {msg && <div className="notice">{msg}</div>}

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div className="listItem">
            <div className="row between wrap">
              <div className="strong">
                {active.length > 0 ? `On break: ${active.length}/${capacity}` : "No one on break"}
              </div>
              <span className="chip">{locked ? "Locked" : "Unlocked"}</span>
            </div>

            {active.length > 0 && (
              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                {active.map((b) => (
                  <div key={b.id} className="row between">
                    <div className="strong">{b.email}</div>
                    <div className="strong">{fmt(msUntil(b.ends_at))}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="listItem">
            <div className="row wrap" style={{ gap: 10 }}>
              <button className="btn primary" onClick={startBreak} disabled={busy || !canStart}>
                {busy ? "Working…" : myActive ? "On break" : "Start break"}
              </button>

              {myActive && (
                <button className="btn" onClick={endMyBreak} disabled={busy}>
                  End my break
                </button>
              )}

              <button className="btn" onClick={onEnablePush} disabled={busy}>
                Enable notifications
              </button>

              <button className="btn" onClick={onTestPush} disabled={busy}>
                Send test push
              </button>

              <button className="btn" onClick={() => load({ quiet: false })} disabled={busy}>
                Refresh
              </button>

              {myActive && (
                <span className="chip">
                  Time left: <b>{fmt(myRemainingMs)}</b>
                </span>
              )}
            </div>

            {!myActive && locked && (
              <div className="muted" style={{ marginTop: 10 }}>
                Breaks locked — capacity reached.
              </div>
            )}
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="card">
          <div className="row between">
            <h3 className="h3">Admin controls</h3>
            <span className="chip">Capacity: {capacity}</span>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {active.length === 0 && <div className="muted">No active breaks.</div>}

            {active.map((b) => (
              <div key={b.id} className="listItem">
                <div className="row between">
                  <div className="strong">{b.email}</div>
                  <span className="chip">{fmt(msUntil(b.ends_at))}</span>
                </div>

                <div style={{ marginTop: 10 }}>
                  <button className="btn warn" onClick={() => adminEndBreak(b)} disabled={busy}>
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
