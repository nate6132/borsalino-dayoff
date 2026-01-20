import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import { supabase } from "./supabase";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import BreakLockPage from "./pages/BreakLockPage.jsx";
import { enablePush } from "./push";
import SuggestionsPage from "./pages/SuggestionsPage.jsx";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function prettyNameFromEmail(email) {
  if (!email) return "";
  const left = (email.split("@")[0] || "").trim();
  if (!left) return "";
  return left.charAt(0).toUpperCase() + left.slice(1);
}

function normalizeStatus(s) {
  return String(s || "").trim().toLowerCase();
}

const styles = {
  page: {
    minHeight: "100svh",
    width: "100%",
    maxWidth: "100vw",
    overflowX: "hidden",
    background:
      "radial-gradient(1200px 700px at 20% 0%, rgba(99,102,241,0.13), transparent 60%), radial-gradient(900px 600px at 85% 10%, rgba(16,185,129,0.11), transparent 58%), #f8fafc",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial',
    color: "#0f172a",
  },
  safe: {
    minHeight: "100svh",
    width: "100%",
    maxWidth: "100vw",
    overflowX: "hidden",
    paddingTop: "env(safe-area-inset-top)",
    paddingBottom: "env(safe-area-inset-bottom)",
    paddingLeft: "env(safe-area-inset-left)",
    paddingRight: "env(safe-area-inset-right)",
  },
  container: { width: "100%", maxWidth: 1100, margin: "0 auto", padding: "18px 14px 50px" },
  card: {
    borderRadius: 16,
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    boxShadow: "0 12px 30px rgba(2, 6, 23, 0.06)",
    padding: 16,
    backdropFilter: "blur(10px)",
  },
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 14px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    boxShadow: "0 12px 30px rgba(2, 6, 23, 0.06)",
    backdropFilter: "blur(10px)",
    marginBottom: 14,
    flexWrap: "wrap",
  },
  brandRow: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 },
  logo: {
    height: 42,
    width: 42,
    objectFit: "cover",
    borderRadius: 10,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "white",
    flex: "0 0 auto",
  },
  brandText: { display: "flex", flexDirection: "column", minWidth: 0 },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: "-0.02em",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  subtitle: { margin: "4px 0 0", fontSize: 13, color: "#475569" },
  rightRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  badge: {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(15, 23, 42, 0.10)",
    background: "rgba(15, 23, 42, 0.04)",
    color: "#0f172a",
    fontWeight: 800,
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid rgba(15, 23, 42, 0.10)",
    background: "rgba(15, 23, 42, 0.04)",
    fontSize: 13,
    color: "#0f172a",
    fontWeight: 800,
  },
  h3row: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" },
  h3: { margin: 0, fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em" },
  muted: { margin: 0, color: "#64748b", fontSize: 13 },
  label: { fontSize: 12, fontWeight: 900, color: "#334155", marginBottom: 6 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(15, 23, 42, 0.12)", background: "white", outline: "none", fontSize: 14 },
  textarea: { width: "100%", minHeight: 90, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(15, 23, 42, 0.12)", background: "white", outline: "none", fontSize: 14, resize: "vertical" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  btn: { padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(15, 23, 42, 0.12)", background: "white", cursor: "pointer", fontWeight: 900, fontSize: 14 },
  btnPrimary: { padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(79,70,229,0.25)", background: "linear-gradient(180deg, rgba(99,102,241,1), rgba(79,70,229,1))", color: "white", cursor: "pointer", fontWeight: 900, fontSize: 14, boxShadow: "0 10px 18px rgba(79,70,229,0.25)" },
  btnDanger: { padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.10)", color: "#b91c1c", cursor: "pointer", fontWeight: 900, fontSize: 14 },
  btnWarn: { padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(245,158,11,0.25)", background: "rgba(245,158,11,0.12)", color: "#92400e", cursor: "pointer", fontWeight: 900, fontSize: 14 },
  list: { display: "grid", gap: 10 },
  listItem: {
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid rgba(15, 23, 42, 0.08)",
    background: "rgba(255,255,255,0.75)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  },
  status: (s) => {
    const val = normalizeStatus(s);
    const base = {
      display: "inline-flex",
      alignItems: "center",
      padding: "6px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 900,
      border: "1px solid rgba(15, 23, 42, 0.10)",
      textTransform: "capitalize",
      flex: "0 0 auto",
    };
    if (val === "approved") return { ...base, background: "rgba(16,185,129,0.12)", color: "#065f46" };
    if (val === "denied") return { ...base, background: "rgba(239,68,68,0.12)", color: "#991b1b" };
    if (val === "pending") return { ...base, background: "rgba(99,102,241,0.12)", color: "#3730a3" };
    if (val === "cancelled") return { ...base, background: "rgba(148,163,184,0.20)", color: "#334155" };
    if (val === "revoked") return { ...base, background: "rgba(245,158,11,0.15)", color: "#92400e" };
    return base;
  },
};

export default function App() {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

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
      if (data.session) loadProfileStuff(data.session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) loadProfileStuff(newSession.user.id);
      else setIsAdmin(false);
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfileStuff(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("is_admin, annual_allowance")
      .eq("id", userId)
      .single();

    if (error) {
      console.log("PROFILE ERROR:", error);
      setIsAdmin(false);
      setDaysInfo({ used: 0, allowance: 14, remaining: 14 });
      return;
    }

    setIsAdmin(!!data?.is_admin);

    const allowance = data?.annual_allowance ?? 14;
    setDaysInfo((prev) => ({ ...prev, allowance }));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function refreshDaysInfo() {
    if (!session) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("annual_allowance")
      .eq("id", session.user.id)
      .single();

    const allowance = profile?.annual_allowance ?? 14;
    const year = new Date().getFullYear();

    const { data: allMine } = await supabase
      .from("day_off_requests")
      .select("start_date,end_date,status")
      .eq("user_id", session.user.id);

    const used = (allMine || [])
      .filter((r) => new Date(r.start_date).getFullYear() === year)
      .filter((r) => normalizeStatus(r.status) === "approved")
      .reduce((sum, r) => {
        const s = new Date(r.start_date + "T00:00:00");
        const e = new Date(r.end_date + "T00:00:00");
        const days = Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1;
        return sum + days;
      }, 0);

    setDaysInfo({ used, allowance, remaining: allowance - used });
  }

  useEffect(() => {
    if (session) refreshDaysInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, requests.length]);

  async function submitRequest(e) {
    e.preventDefault();
    setMsg("");

    if (!startDate || !endDate) return setMsg("Pick a start and end date.");
    if (!reason.trim()) return setMsg("Please add a reason.");

    const s = new Date(startDate + "T00:00:00");
    const en = new Date(endDate + "T00:00:00");
    if (en < s) return setMsg("End date must be the same or after the start date.");

    const daysRequested = Math.floor((en - s) / (1000 * 60 * 60 * 24)) + 1;
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
      console.log("SUBMIT ERROR:", error);
      setMsg(error.message);
      return;
    }

    setStartDate("");
    setEndDate("");
    setReason("");
    setMsg("Request submitted ✅");

    await loadRequests();
    await refreshDaysInfo();
  }

  async function cancelMyRequest(row) {
    const ok = confirm("Cancel this request? (Only works if still pending)");
    if (!ok) return;

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

    if (["approved", "denied", "revoked"].includes(newStatus)) {
      const { error: fnErr } = await supabase.functions.invoke("send-approval-email", {
        body: { email: row.email, start_date: row.start_date, end_date: row.end_date, status: newStatus },
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
      alert("Notifications enabled ✅");
    } catch (e) {
      console.error(e);
      alert(e?.message || "Failed to enable notifications");
    } finally {
      setPushBusy(false);
    }
  }

  async function onSendTestPush() {
    try {
      setPushBusy(true);

      const { data, error } = await supabase.functions.invoke("push-test", { body: {} });
      console.log("push-test result:", { data, error });

      if (error) {
        alert(`push-test failed: ${error.message}`);
        return;
      }

      alert("push-test OK ✅ (check console for details)");
    } catch (e) {
      console.error(e);
      alert(e?.message || "push-test failed");
    } finally {
      setPushBusy(false);
    }
  }

  if (!session) {
    return (
      <div style={styles.page}>
        <div style={styles.safe}>
          <div style={{ ...styles.container, maxWidth: 460, paddingTop: 70 }}>
            <div style={styles.card}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Welcome 👋</h2>
              <p style={{ margin: "6px 0 12px", color: "#64748b" }}>
                Sign in with your work email.
              </p>

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

  const displayName = prettyNameFromEmail(session?.user?.email);
  const myEmail = (session?.user?.email || "").trim().toLowerCase();

  const myRequests = (requests || []).filter(
    (r) => String(r.email || "").trim().toLowerCase() === myEmail
  );

  const pendingForAdmin = (requests || []).filter(
    (r) => normalizeStatus(r.status) === "pending"
  );

  function DayOffPage() {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <div style={styles.card}>
          <div style={styles.h3row}>
            <h3 style={styles.h3}>Your allowance</h3>
            <span style={styles.pill}>
              {daysInfo.remaining} remaining / {daysInfo.allowance} total
            </span>
          </div>
          <p style={styles.muted}>
            Used this year: <b>{daysInfo.used}</b>
          </p>
        </div>

        <div style={styles.card}>
          <div style={styles.h3row}>
            <h3 style={styles.h3}>Request time off</h3>
            <button
              style={styles.btn}
              onClick={() => {
                loadRequests();
                refreshDaysInfo();
              }}
            >
              Refresh
            </button>
          </div>

          <form onSubmit={submitRequest} style={{ display: "grid", gap: 12 }}>
            <div style={styles.grid2}>
              <div>
                <div style={styles.label}>Start date</div>
                <input
                  type="date"
                  style={styles.input}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <div style={styles.label}>End date</div>
                <input
                  type="date"
                  style={styles.input}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div style={styles.label}>Reason</div>
              <textarea
                style={styles.textarea}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Briefly explain why you need the day(s) off…"
              />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button type="submit" style={styles.btnPrimary} disabled={busy}>
                {busy ? "Submitting…" : "Submit request"}
              </button>
              {msg && <span style={{ ...styles.muted, fontWeight: 800 }}>{msg}</span>}
            </div>
          </form>
        </div>

        <div style={styles.card}>
          <div style={styles.h3row}>
            <h3 style={styles.h3}>My requests</h3>
            <p style={styles.muted}>{myRequests.length} total</p>
          </div>

          <div style={styles.list}>
            {myRequests.length === 0 && <p style={styles.muted}>No requests yet.</p>}

            {myRequests.map((r) => (
              <div key={r.id} style={styles.listItem}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900 }}>
                    {r.start_date} → {r.end_date}
                  </div>
                  <span style={styles.status(r.status)}>{normalizeStatus(r.status) || "unknown"}</span>
                </div>

                <div style={styles.muted}>{r.reason}</div>

                {normalizeStatus(r.status) === "pending" && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button style={styles.btnDanger} onClick={() => cancelMyRequest(r)}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div style={styles.card}>
            <div style={styles.h3row}>
              <h3 style={styles.h3}>Admin approvals</h3>
              <p style={styles.muted}>{pendingForAdmin.length} pending</p>
            </div>

            <div style={styles.list}>
              {pendingForAdmin.length === 0 && (
                <p style={styles.muted}>No pending requests. (If you just submitted, hit Refresh)</p>
              )}

              {pendingForAdmin.map((r) => (
                <div key={r.id} style={styles.listItem}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.email}
                    </div>
                    <span style={styles.status(r.status)}>{normalizeStatus(r.status)}</span>
                  </div>

                  <div style={styles.muted}>
                    {r.start_date} → {r.end_date}
                  </div>
                  <div style={styles.muted}>{r.reason}</div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    <button style={styles.btnPrimary} onClick={() => adminSetStatus(r, "approved")}>
                      Approve
                    </button>
                    <button style={styles.btnDanger} onClick={() => adminSetStatus(r, "denied")}>
                      Deny
                    </button>
                    <button style={styles.btnWarn} onClick={() => adminSetStatus(r, "revoked")}>
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
      <div style={styles.page}>
        <div style={styles.safe}>
          <div style={styles.container}>
            <div style={styles.topbar}>
              <div style={styles.brandRow}>
                <img src="/logo.png" alt="DayOff logo" style={styles.logo} />
                <div style={styles.brandText}>
                  <h1 style={styles.title}>
                    {getGreeting()}, {displayName}
                  </h1>
                  <p style={styles.subtitle}>{isAdmin ? "Admin dashboard" : "Welcome back"}</p>
                </div>
              </div>

              <div style={styles.rightRow}>
                <span style={styles.badge}>{isAdmin ? "Admin" : "Employee"}</span>

                <button style={styles.btn} onClick={onEnablePush} disabled={pushBusy}>
                  {pushBusy ? "Working…" : "Enable Notifications"}
                </button>

                <button style={styles.btn} onClick={onSendTestPush} disabled={pushBusy}>
                  {pushBusy ? "Working…" : "Send Test Push"}
                </button>

                <button style={styles.btn} onClick={() => supabase.auth.signOut()}>
                  Log out
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <Link to="/" style={{ ...styles.btn, textDecoration: "none" }}>DayOff</Link>
              <Link to="/breaklock" style={{ ...styles.btn, textDecoration: "none" }}>BreakLock</Link>
              {isAdmin && (
                <Link to="/breaklock/board" style={{ ...styles.btn, textDecoration: "none" }}>
                  BreakLock TV
                </Link>
              )}
              <Link to="/suggestions" style={{ ...styles.btn, textDecoration: "none" }}>
                Suggestions
              </Link>
            </div>

            <Routes>
              <Route path="/" element={<DayOffPage />} />
              <Route
                path="/breaklock"
                element={<BreakLockPage app={{ supabase, session, isAdmin, styles }} boardMode={false} />}
              />
              <Route
                path="/breaklock/board"
                element={
                  isAdmin
                    ? <BreakLockPage app={{ supabase, session, isAdmin, styles }} boardMode />
                    : <Navigate to="/breaklock" replace />
                }
              />
              <Route
                path="/suggestions"
                element={<SuggestionsPage app={{ supabase, session, isAdmin, styles }} />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
}
