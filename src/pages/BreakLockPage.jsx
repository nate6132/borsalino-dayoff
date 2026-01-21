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
  const { supabase, session, profile } = app || {};
  const org = profile?.org;
  const isAdmin = !!profile?.is_admin;

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [capacity, setCapacity] = useState(2);
  const [durationMin, setDurationMin] = useState(30);

  const [active, setActive] = useState([]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const loadSeq = useRef(0);
  const actionInFlight = useRef(false);

  async function load({ quiet = true } = {}) {
    const seq = ++loadSeq.current;
    if (!quiet) setMsg("");

    if (!org) return;

    // org settings
    const { data: os } = await supabase
      .from("org_settings")
      .select("break_capacity, break_duration_minutes")
      .eq("org", org)
      .single();

    if (seq === loadSeq.current && os) {
      setCapacity(os.break_capacity ?? 2);
      setDurationMin(os.break_duration_minutes ?? 30);
    }

    // active via RPC (already scoped by org in SQL we gave you)
    const { data, error } = await supabase.rpc("get_active_breaks_v1");
    if (seq !== loadSeq.current) return;

    if (error) setMsg(error.message);
    else setActive(data || []);
  }

  useEffect(() => {
    if (session && org) load({ quiet: true });
    // eslint-disable-next-line
  }, [session, org]);

  useEffect(() => {
    if (!supabase || !org) return;

    const ch = supabase
      .channel("breaklock-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_breaks" }, () => {
        if (!actionInFlight.current) load({ quiet: true });
      })
      .subscribe();

    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line
  }, [supabase, org]);

  const myEmail = (session?.user?.email || "").trim().toLowerCase();
  const myActive = useMemo(
    () => (active || []).find((b) => (b.email || "").trim().toLowerCase() === myEmail) || null,
    [active, myEmail]
  );

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

    const { data, error } = await supabase.rpc("start_break_v3");
    setBusy(false);

    if (error) {
      actionInFlight.current = false;
      return setMsg(`Start error: ${error.message}`);
    }
    if (data?.ok === false && data?.error === "already_active") {
      actionInFlight.current = false;
      return setMsg("You’re already on break.");
    }

    setMsg("Break started ✅");
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

    setMsg("Break ended ✅");
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

    setMsg("Override ended ✅");
    setTimeout(() => {
      actionInFlight.current = false;
      load({ quiet: true });
    }, 250);
  }

  async function onEnablePush() {
    try {
      setBusy(true);
      await enablePush();
      setMsg("Notifications enabled ✅");
    } catch (e) {
      setMsg(e?.message || "Failed to enable notifications");
    } finally {
      setBusy(false);
    }
  }

  async function onTestPush() {
    try {
      setBusy(true);
      const res = await sendTestPush();
      setMsg(`Test push sent ✅ (sent: ${res?.sent ?? "?"})`);
    } catch (e) {
      setMsg(e?.message || "Test push failed");
    } finally {
      setBusy(false);
    }
  }

  if (!supabase || !session) return <div className="card">Missing session.</div>;
  if (!org) return <div className="card">Your org isn’t set yet. Go to Settings.</div>;

  // Board mode
  if (boardMode) {
    return (
      <div className="stack">
        <div className="card">
          <div className="row between wrap">
            <h3 className="h3">BreakLock — TV</h3>
            <span className="chip soft">
              {org === "atica" ? "Atica" : "Borsalino"} • Capacity {capacity}
            </span>
          </div>

          <div className="row between wrap" style={{ marginTop: 10 }}>
            <div className="strong">
              {active.length ? `🟢 ${active.length} currently on break` : "✅ Nobody on break"}
            </div>
            <div className="strong">
              {active.length ? `Next ends in ${fmt(soonestRemainingMs)}` : "Unlocked"}
            </div>
          </div>

          {msg && <div className="notice">{msg}</div>}

          <div className="list" style={{ marginTop: 12 }}>
            {active.length === 0 && <div className="muted">Waiting for someone to start…</div>}
            {active.map((b) => (
              <div key={b.id} className="listItem">
                <div className="row between">
                  <div className="strong">{b.email}</div>
                  <span className="chip">{fmt(msUntil(b.ends_at))}</span>
                </div>
                <div className="muted">
                  {prettyTime(b.started_at)} → {prettyTime(b.ends_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Normal
  return (
    <div className="stack">
      <div className="card">
        <div className="row between wrap">
          <div>
            <h3 className="h3">BreakLock</h3>
            <p className="muted">
              {durationMin} minutes • capacity {capacity} • {org === "atica" ? "Atica" : "Borsalino"}
            </p>
          </div>
          <span className="chip soft">{isAdmin ? "Admin" : "Employee"}</span>
        </div>

        {msg && <div className="notice">{msg}</div>}

        <div className="grid" style={{ marginTop: 12 }}>
          <div className="listItem">
            <div className="row between wrap">
              <div className="strong">
                {active.length ? `On break: ${active.length}/${capacity}` : "✅ No one on break"}
              </div>
              <span className="chip">{locked ? "Locked" : "Open"}</span>
            </div>

            {active.length > 0 && (
              <div className="list" style={{ marginTop: 10 }}>
                {active.map((b) => (
                  <div key={b.id} className="row between">
                    <div className="muted">{b.email}</div>
                    <div className="strong">{fmt(msUntil(b.ends_at))}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="listItem">
            <div className="row wrap" style={{ gap: 10 }}>
              <button className="btn primary" onClick={startBreak} disabled={busy || !canStart}>
                {myActive ? "On break" : busy ? "Working…" : "Start break"}
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

              <button className="btn ghost" onClick={() => load({ quiet: false })} disabled={busy}>
                Refresh
              </button>

              {myActive && (
                <span className="chip soft">
                  Time left: <b>{fmt(myRemainingMs)}</b>
                </span>
              )}
            </div>

            {!myActive && locked && (
              <div className="muted" style={{ marginTop: 10 }}>
                Breaks are locked — wait for someone to finish.
              </div>
            )}
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="card">
          <div className="row between wrap">
            <h3 className="h3">Admin override</h3>
            <span className="chip">Active: {active.length}</span>
          </div>

          <div className="list" style={{ marginTop: 12 }}>
            {active.length === 0 && <div className="muted">No active breaks.</div>}
            {active.map((b) => (
              <div key={b.id} className="listItem">
                <div className="row between">
                  <div className="strong">{b.email}</div>
                  <span className="chip">{fmt(msUntil(b.ends_at))}</span>
                </div>
                <button className="btn warn" onClick={() => adminEndBreak(b)} disabled={busy}>
                  Override end
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
