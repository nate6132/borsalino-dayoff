import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import { supabase } from "./supabase";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";

import BreakLockPage from "./pages/BreakLockPage.jsx";
import SuggestionsPage from "./pages/SuggestionsPage.jsx";
import { enablePush, sendTestPush } from "./push";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function normalizeStatus(s) {
  return String(s || "").trim().toLowerCase();
}

function daysBetweenInclusive(startDate, endDate) {
  const s = new Date(startDate + "T00:00:00");
  const e = new Date(endDate + "T00:00:00");
  return Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

function NamePrompt({ currentName, onSave }) {
  const [name, setName] = useState(currentName || "");
  const [busy, setBusy] = useState(false);
  const canSave = name.trim().length >= 2;

  return (
    <div className="modalBackdrop">
      <div className="modalCard">
        <h2 className="h2">Welcome</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          What should we call you? This is only used for the greeting.
        </p>

        <div style={{ marginTop: 14 }}>
          <div className="label">Your name</div>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nate"
            autoFocus
          />
        </div>

        <div className="row wrap" style={{ marginTop: 14, gap: 10 }}>
          <button
            className="btn primary"
            disabled={!canSave || busy}
            onClick={async () => {
              try {
                setBusy(true);
                await onSave(name.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // { is_admin, annual_allowance, display_name }
  const isAdmin = !!profile?.is_admin;

  const [requests, setRequests] = useState([]);
  const [daysInfo, setDaysInfo] = useState({ used: 0, allowance: 14, remaining: 14 });

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) loadProfile(newSession.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line
  }, []);

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("is_admin, annual_allowance, display_name")
      .eq("id", userId)
      .single();

    if (error) {
      console.log("PROFILE ERROR:", error);
      setProfile({ is_admin: false, annual_allowance: 14, display_name: "" });
      setDaysInfo({ used: 0, allowance: 14, remaining: 14 });
      return;
    }

    setProfile({
      is_admin: !!data?.is_admin,
      annual_allowance: data?.annual_allowance ?? 14,
      display_name: data?.display_name ?? "",
    });

    const allowance = data?.annual_allowance ?? 14;
    setDaysInfo((prev) => ({ ...prev, allowance }));
  }

  async function saveDisplayName(name) {
    if (!session) return;

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name })
      .eq("id", session.user.id);

    if (error) {
      alert(error.message);
      return;
    }

    setProfile((p) => ({ ...(p || {}), display_name: name }));
  }

  async function loadRequests() {
    const { data, error } = await supabase
      .from("day_off_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.log("LOAD REQUESTS ERROR:", error);
      return;
    }
    setRequests(data || []);
  }

  useEffect(() => {
    if (session) loadRequests();
    // eslint-disable-next-line
  }, [session]);

  async function refreshDaysInfo() {
    if (!session) return;

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("annual_allowance")
      .eq("id", session.user.id)
      .single();

    const allowance = profileRow?.annual_allowance ?? 14;
    const year = new Date().getFullYear();

    const { data: allMine } = await supabase
      .from("day_off_requests")
      .select("start_date,end_date,status")
      .eq("user_id", session.user.id);

    const used = (allMine || [])
      .filter((r) => new Date(r.start_date).getFullYear() === year)
      .filter((r) => normalizeStatus(r.status) === "approved")
      .reduce((sum, r) => sum + daysBetweenInclusive(r.start_date, r.end_date), 0);

    setDaysInfo({ used, allowance, remaining: allowance - used });
  }

  useEffect(() => {
    if (session) refreshDaysInfo();
    // eslint-disable-next-line
  }, [session, requests.length]);

  async function submitRequest(e) {
    e.preventDefault();
    setMsg("");

    if (!startDate || !endDate) return setMsg("Pick a start and end date.");
    if (!reason.trim()) return setMsg("Please add a reason.");

    const s = new Date(startDate + "T00:00:00");
    const en = new Date(endDate + "T00:00:00");
    if (en < s) return setMsg("End date must be the same or after the start date.");

    const daysRequested = daysBetweenInclusive(startDate, endDate);
    if (daysRequested > daysInfo.remaining) {
      return setMsg(`Not enough days remaining. You have ${daysInfo.remaining} left.`);
    }

    setBusy(true);

    const { error } = await supabase.from("day_off_requests").insert({
      user_id: session.user.id,
      email: session.user.email,
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim(),
      status: "pending",
    });

    setBusy(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setStartDate("");
    setEndDate("");
    setReason("");
    setMsg("Request submitted.");

    await loadRequests();
    await refreshDaysInfo();
  }

  async function cancelMyRequest(row) {
    if (!confirm("Cancel this request? (Only works if still pending)")) return;

    const { error } = await supabase
      .from("day_off_requests")
      .update({ status: "cancelled" })
      .eq("id", row.id);

    if (error) return alert(error.message);
    await loadRequests();
    await refreshDaysInfo();
  }

  async function adminSetStatus(row, newStatus) {
    const { error } = await supabase
      .from("day_off_requests")
      .update({ status: newStatus })
      .eq("id", row.id);

    if (error) return alert(error.message);

    // keep your email function logic
    if (["approved", "denied", "revoked"].includes(newStatus)) {
      const { error: fnErr } = await supabase.functions.invoke("send-approval-email", {
        body: {
          email: row.email,
          start_date: row.start_date,
          end_date: row.end_date,
          status: newStatus,
        },
      });
      if (fnErr) console.log("EMAIL FAILED:", fnErr);
    }

    await loadRequests();
    await refreshDaysInfo();
  }

  async function onEnablePush() {
    try {
      setPushBusy(true);
      await enablePush();
      alert("Notifications enabled.");
    } catch (e) {
      console.error(e);
      alert(e?.message || "Failed to enable notifications.");
    } finally {
      setPushBusy(false);
    }
  }

  async function onSendTestPush() {
    try {
      setPushBusy(true);
      const res = await sendTestPush(); // <-- REAL push-send
      console.log("push-send result:", res);
      alert(`Push sent. (sent: ${res?.sent ?? "?"})`);
    } catch (e) {
      console.error(e);
      alert(e?.message || "Test push failed.");
    } finally {
      setPushBusy(false);
    }
  }

  if (!session) {
    return (
      <div className="page">
        <div className="authWrap">
          <div className="card">
            <h2 className="h2">Sign in</h2>
            <p className="muted" style={{ marginTop: 6 }}>
              Use your work email.
            </p>

            <div style={{ marginTop: 14 }}>
              <Auth
                supabaseClient={supabase}
                appearance={{ theme: ThemeSupa }}
                providers={[]}
                redirectTo={window.location.origin}
                magicLink={false}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayName = profile?.display_name?.trim() || "there";
  const myEmail = (session?.user?.email || "").trim().toLowerCase();

  const myRequests = useMemo(
    () => (requests || []).filter((r) => String(r.email || "").trim().toLowerCase() === myEmail),
    [requests, myEmail]
  );

  const pendingForAdmin = useMemo(
    () => (requests || []).filter((r) => normalizeStatus(r.status) === "pending"),
    [requests]
  );

  function DayOffPage() {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <div className="card">
          <div className="row between">
            <h3 className="h3">Your allowance</h3>
            <span className="chip">
              {daysInfo.remaining} remaining / {daysInfo.allowance} total
            </span>
          </div>
          <p className="muted" style={{ marginTop: 6 }}>
            Used this year: <b>{daysInfo.used}</b>
          </p>
        </div>

        <div className="card">
          <div className="row between wrap">
            <h3 className="h3">Request time off</h3>
            <button className="btn" onClick={() => { loadRequests(); refreshDaysInfo(); }}>
              Refresh
            </button>
          </div>

          <form onSubmit={submitRequest} style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <div className="grid2">
              <div>
                <div className="label">Start date</div>
                <input
                  type="date"
                  className="input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <div className="label">End date</div>
                <input
                  type="date"
                  className="input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div className="label">Reason</div>
              <textarea
                className="textarea"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Briefly explain why you need the day(s) off…"
              />
            </div>

            <div className="row wrap" style={{ gap: 10 }}>
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? "Submitting…" : "Submit request"}
              </button>
              {msg && <span className="muted" style={{ fontWeight: 700 }}>{msg}</span>}
            </div>
          </form>
        </div>

        <div className="card">
          <div className="row between">
            <h3 className="h3">My requests</h3>
            <span className="chip">{myRequests.length} total</span>
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {myRequests.length === 0 && <p className="muted">No requests yet.</p>}

            {myRequests.map((r) => (
              <div key={r.id} className="listItem">
                <div className="row between">
                  <div className="strong">
                    {r.start_date} → {r.end_date}
                  </div>
                  <span className={`status ${normalizeStatus(r.status) || "unknown"}`}>
                    {normalizeStatus(r.status) || "unknown"}
                  </span>
                </div>

                <div className="muted">{r.reason}</div>

                {normalizeStatus(r.status) === "pending" && (
                  <div className="row wrap" style={{ marginTop: 10 }}>
                    <button className="btn danger" onClick={() => cancelMyRequest(r)}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div className="card">
            <div className="row between">
              <h3 className="h3">Admin approvals</h3>
              <span className="chip">{pendingForAdmin.length} pending</span>
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {pendingForAdmin.length === 0 && <p className="muted">No pending requests.</p>}

              {pendingForAdmin.map((r) => (
                <div key={r.id} className="listItem">
                  <div className="row between">
                    <div className="strong">{r.email}</div>
                    <span className={`status ${normalizeStatus(r.status)}`}>{normalizeStatus(r.status)}</span>
                  </div>

                  <div className="muted">
                    {r.start_date} → {r.end_date}
                  </div>
                  <div className="muted">{r.reason}</div>

                  <div className="row wrap" style={{ marginTop: 10, gap: 10 }}>
                    <button className="btn primary" onClick={() => adminSetStatus(r, "approved")}>
                      Approve
                    </button>
                    <button className="btn danger" onClick={() => adminSetStatus(r, "denied")}>
                      Deny
                    </button>
                    <button className="btn warn" onClick={() => adminSetStatus(r, "revoked")}>
                      Revoke
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

  return (
    <BrowserRouter>
      <div className="page">
        <div className="container">
          {!profile?.display_name?.trim() && (
            <NamePrompt currentName="" onSave={saveDisplayName} />
          )}

          <div className="topbar">
            <div className="brandRow">
              <img src="/logo.png" alt="Logo" className="logo" />
              <div>
                <div className="titleRow">
                  <h1 className="title">{getGreeting()}, {displayName}</h1>
                  <span className="chip">{isAdmin ? "Admin" : "Employee"}</span>
                </div>
                <p className="muted">{isAdmin ? "Admin dashboard" : "Employee portal"}</p>
              </div>
            </div>

            <div className="row wrap" style={{ gap: 10 }}>
              <button className="btn" onClick={onEnablePush} disabled={pushBusy}>
                {pushBusy ? "Working…" : "Enable notifications"}
              </button>

              <button className="btn" onClick={onSendTestPush} disabled={pushBusy}>
                {pushBusy ? "Working…" : "Send test push"}
              </button>

              <button className="btn" onClick={() => supabase.auth.signOut()}>
                Log out
              </button>
            </div>
          </div>

          <div className="nav">
            <Link to="/" className="navLink">DayOff</Link>
            <Link to="/breaklock" className="navLink">BreakLock</Link>
            {isAdmin && <Link to="/breaklock/board" className="navLink">BreakLock TV</Link>}
            <Link to="/suggestions" className="navLink">Suggestions</Link>
          </div>

          <Routes>
            <Route path="/" element={<DayOffPage />} />
            <Route
              path="/breaklock"
              element={<BreakLockPage app={{ supabase, session, isAdmin, styles: null }} boardMode={false} />}
            />
            <Route
              path="/breaklock/board"
              element={isAdmin ? (
                <BreakLockPage app={{ supabase, session, isAdmin, styles: null }} boardMode />
              ) : (
                <Navigate to="/breaklock" replace />
              )}
            />
            <Route
              path="/suggestions"
              element={<SuggestionsPage app={{ supabase, session, isAdmin, styles: null }} />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
