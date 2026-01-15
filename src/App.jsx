import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";

// FullCalendar end is exclusive; convert inclusive end_date by adding 1 day
function addOneDayYYYYMMDD(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Uses profile name if available, otherwise first part of email
function makeDisplayName(profileName, email) {
  if (profileName && profileName.trim().length > 0) return profileName.trim();
  if (!email) return "";
  const left = email.split("@")[0] || "";
  return left.charAt(0).toUpperCase() + left.slice(1);
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(1200px 600px at 20% 0%, rgba(99,102,241,0.12), transparent 60%), radial-gradient(900px 500px at 80% 10%, rgba(16,185,129,0.10), transparent 55%), #f8fafc",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    color: "#0f172a",
  },
  container: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "28px 18px 60px",
  },
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "16px 18px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.85)",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    boxShadow: "0 12px 30px rgba(2, 6, 23, 0.06)",
    backdropFilter: "blur(10px)",
    marginBottom: 18,
  },
  brand: { display: "flex", flexDirection: "column", lineHeight: 1.1 },
  title: { margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em" },
  subtitle: { margin: 0, fontSize: 13, color: "#475569", marginTop: 4 },
  badge: {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(15, 23, 42, 0.10)",
    background: "rgba(15, 23, 42, 0.04)",
    color: "#0f172a",
    fontWeight: 700,
  },
  card: {
    borderRadius: 16,
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    boxShadow: "0 12px 30px rgba(2, 6, 23, 0.06)",
    padding: 16,
    backdropFilter: "blur(10px)",
  },
  cardTitleRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  cardTitle: { margin: 0, fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em" },
  muted: { color: "#64748b", fontSize: 13 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  label: { fontSize: 12, fontWeight: 800, color: "#334155", marginBottom: 6 },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(15, 23, 42, 0.12)",
    background: "white",
    outline: "none",
    fontSize: 14,
  },
  textarea: {
    width: "100%",
    minHeight: 90,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(15, 23, 42, 0.12)",
    background: "white",
    outline: "none",
    fontSize: 14,
    resize: "vertical",
  },
  row: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  btn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(15, 23, 42, 0.12)",
    background: "white",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
  },
  btnPrimary: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(79,70,229,0.25)",
    background: "linear-gradient(180deg, rgba(99,102,241,1), rgba(79,70,229,1))",
    color: "white",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 14,
    boxShadow: "0 10px 18px rgba(79,70,229,0.25)",
  },
  btnDanger: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(239,68,68,0.25)",
    background: "rgba(239,68,68,0.08)",
    color: "#b91c1c",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 14,
  },
  btnWarn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(245,158,11,0.25)",
    background: "rgba(245,158,11,0.10)",
    color: "#92400e",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 14,
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
  divider: { height: 1, background: "rgba(15, 23, 42, 0.08)", margin: "12px 0" },
  listItem: {
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid rgba(15, 23, 42, 0.08)",
    background: "rgba(255,255,255,0.75)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  status: (s) => {
    const base = {
      display: "inline-flex",
      alignItems: "center",
      padding: "6px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 900,
      border: "1px solid rgba(15, 23, 42, 0.10)",
      textTransform: "capitalize",
    };
    if (s === "approved") return { ...base, background: "rgba(16,185,129,0.12)", color: "#065f46" };
    if (s === "denied") return { ...base, background: "rgba(239,68,68,0.12)", color: "#991b1b" };
    if (s === "pending") return { ...base, background: "rgba(99,102,241,0.12)", color: "#3730a3" };
    if (s === "cancelled") return { ...base, background: "rgba(148,163,184,0.20)", color: "#334155" };
    if (s === "revoked") return { ...base, background: "rgba(245,158,11,0.15)", color: "#92400e" };
    return base;
  },
};

export default function App() {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [profileName, setProfileName] = useState("");

  const [start_date, setStartDate] = useState("");
  const [end_date, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const [requests, setRequests] = useState([]);
  const [daysInfo, setDaysInfo] = useState({ used: 0, allowance: 14, remaining: 14 });

  // ---------- AUTH ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfileStuff(data.session.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) loadProfileStuff(newSession.user.id);
      else {
        setIsAdmin(false);
        setProfileName("");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfileStuff(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("is_admin, annual_allowance, email")
      .eq("id", userId)
      .single();

    if (error) {
      console.log("PROFILE ERROR:", error);
      setIsAdmin(false);
      setProfileName("");
      setDaysInfo((prev) => ({ ...prev, allowance: 14, remaining: 14 }));
      return;
    }

    setIsAdmin(!!data?.is_admin);
    setProfileName("");
    const allowance = data?.annual_allowance ?? 14;
    setDaysInfo((prev) => ({ ...prev, allowance }));
  }

  // ---------- LOAD REQUESTS ----------
  async function loadRequests() {
    const { data, error } = await supabase
      .from("day_off_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.log("LOAD ERROR:", error);
      return;
    }
    setRequests(data || []);
  }

  useEffect(() => {
    if (session) loadRequests();
  }, [session]);

  // ---------- DAYS USED / REMAINING ----------
  async function refreshDaysInfo() {
    if (!session) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("annual_allowance")
      .eq("id", session.user.id)
      .single();

    const allowance = profile?.annual_allowance ?? 14;
    const year = new Date().getFullYear();

    const { data: approved } = await supabase
      .from("day_off_requests")
      .select("start_date,end_date")
      .eq("user_id", session.user.id)
      .eq("status", "approved");

    const used = (approved || [])
      .filter((r) => new Date(r.start_date).getFullYear() === year)
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

  // ---------- SUBMIT REQUEST ----------
  async function submitRequest() {
    if (!start_date || !end_date || !reason) return alert("Fill all fields");
    if (end_date < start_date) return alert("End date cannot be before start date");

    const { data, error } = await supabase.rpc("request_day_off", {
      p_start_date: start_date,
      p_end_date: end_date,
      p_reason: reason,
    });

    if (error) return alert(error.message);

    if (!data?.ok) {
      alert(
        `${data?.error}\nUsed: ${data?.used}\nRequested: ${data?.requested}\nAllowance: ${data?.allowance}`
      );
      return;
    }

    setStartDate("");
    setEndDate("");
    setReason("");
    await loadRequests();
  }

  // ---------- USER CANCEL ----------
  async function cancelMyRequest(row) {
    const ok = confirm("Cancel this request? (Only works if still pending)");
    if (!ok) return;

    const { error } = await supabase
      .from("day_off_requests")
      .update({ status: "cancelled" })
      .eq("id", row.id);

    if (error) return alert(error.message);
    await loadRequests();
  }

  // ---------- ADMIN UPDATE STATUS + EMAIL ----------
  async function adminSetStatus(row, newStatus) {
    const { error } = await supabase
      .from("day_off_requests")
      .update({ status: newStatus })
      .eq("id", row.id);

    if (error) return alert(error.message);

    // Email on approved/denied/revoked
    if (["approved", "denied", "revoked"].includes(newStatus)) {
      const { data, error: fnErr } = await supabase.functions.invoke("send-approval-email", {
        body: {
          email: row.email,
          start_date: row.start_date,
          end_date: row.end_date,
          status: newStatus,
        },
      });

      console.log("EMAIL INVOKE:", newStatus, data, fnErr);
      if (fnErr) alert(`Status updated to ${newStatus}, but email failed (check function logs).`);
    }

    await loadRequests();
  }

  // ---------- DERIVED ----------
  const myRequests = useMemo(() => {
    if (!session) return [];
    return requests.filter((r) => r.user_id === session.user.id);
  }, [requests, session]);

  const pendingRequests = useMemo(() => requests.filter((r) => r.status === "pending"), [requests]);

  const approvedEvents = useMemo(() => {
    return requests
      .filter((r) => r.status === "approved")
      .map((r) => ({
        id: r.id,
        title: r.email,
        start: r.start_date,
        end: addOneDayYYYYMMDD(r.end_date),
      }));
  }, [requests]);

  // ---------- AUTH SCREEN ----------
  if (!session) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.container, maxWidth: 460, paddingTop: 80 }}>
          <div style={styles.card}>
            <div style={{ marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em" }}>
                Welcome 👋
              </h2>
              <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
                Sign in to request time off and view your status.
              </p>
            </div>
            <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} />
          </div>
        </div>
      </div>
    );
  }

  const displayName = makeDisplayName(profileName, session.user.email);


  // ---------- APP ----------
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* TOP BAR */}
        <div style={styles.topbar}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Put your logo file at: /public/logo.png */}
            <img
              src="/logo.png"
              alt="Borsalino logo"
              style={{ height: 44, width: "auto", borderRadius: 10 }}
            />

            <div style={styles.brand}>
              <h1 style={styles.title}>
                {getGreeting()}, {displayName}
              </h1>
              <p style={styles.subtitle}>
                {isAdmin ? "Admin dashboard" : "Request and track your time off"}
              </p>
            </div>
          </div>

          <div style={styles.row}>
            <span style={styles.badge}>{isAdmin ? "Admin" : "Employee"}</span>
            <button style={styles.btn} onClick={() => supabase.auth.signOut()}>
              Log out
            </button>
          </div>
        </div>

        {/* EMPLOYEE VIEW */}
        {!isAdmin && (
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 14 }}>
            <div style={styles.card}>
              <div style={styles.cardTitleRow}>
                <h3 style={styles.cardTitle}>Request time off</h3>
                <span style={styles.pill}>
                  Remaining: {daysInfo.remaining} / {daysInfo.allowance}
                </span>
              </div>
              <p style={styles.muted}>
                Pick your dates and add a short reason. You can cancel while it’s still pending.
              </p>

              <div style={styles.grid2}>
                <div>
                  <div style={styles.label}>Start date</div>
                  <input
                    style={styles.input}
                    type="date"
                    value={start_date}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <div style={styles.label}>End date</div>
                  <input
                    style={styles.input}
                    type="date"
                    value={end_date}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={styles.label}>Reason</div>
                <textarea
                  style={styles.textarea}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Example: Family event, appointment, travel…"
                />
              </div>

              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                <button style={styles.btnPrimary} onClick={submitRequest}>
                  Submit request
                </button>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardTitleRow}>
                <h3 style={styles.cardTitle}>My requests</h3>
                <span style={styles.muted}>{myRequests.length} total</span>
              </div>

              {myRequests.length === 0 ? (
                <p style={styles.muted}>No requests yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {myRequests.map((r) => (
                    <div key={r.id} style={styles.listItem}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 900 }}>
                          {r.start_date} → {r.end_date}
                        </div>
                        <span style={styles.status(r.status)}>{r.status}</span>
                      </div>
                      <div style={{ color: "#334155", fontSize: 13 }}>{r.reason}</div>
                      {r.status === "pending" && (
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button style={styles.btnDanger} onClick={() => cancelMyRequest(r)}>
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ADMIN VIEW */}
        {isAdmin && (
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 14 }}>
            <div style={styles.card}>
              <div style={styles.cardTitleRow}>
                <h3 style={styles.cardTitle}>Calendar</h3>
                <span style={styles.muted}>Approved time off</span>
              </div>
              <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(15,23,42,0.08)" }}>
                <FullCalendar
                  plugins={[dayGridPlugin, interactionPlugin]}
                  initialView="dayGridMonth"
                  events={approvedEvents}
                  height="auto"
                />
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardTitleRow}>
                <h3 style={styles.cardTitle}>Pending approvals</h3>
                <span style={styles.muted}>{pendingRequests.length}</span>
              </div>

              {pendingRequests.length === 0 ? (
                <p style={styles.muted}>No pending requests.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {pendingRequests.map((r) => (
                    <div key={r.id} style={styles.listItem}>
                      <div style={{ fontWeight: 900 }}>{r.email}</div>
                      <div style={{ fontWeight: 900 }}>
                        {r.start_date} → {r.end_date}
                      </div>
                      <div style={{ color: "#334155", fontSize: 13 }}>{r.reason}</div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button style={styles.btnPrimary} onClick={() => adminSetStatus(r, "approved")}>
                          Approve
                        </button>
                        <button style={styles.btnDanger} onClick={() => adminSetStatus(r, "denied")}>
                          Deny
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={styles.divider} />

              <div style={styles.cardTitleRow}>
                <h3 style={styles.cardTitle}>Approved (revoke)</h3>
                <span style={styles.muted}>{requests.filter((r) => r.status === "approved").length}</span>
              </div>

              {requests.filter((r) => r.status === "approved").length === 0 ? (
                <p style={styles.muted}>No approved requests yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {requests
                    .filter((r) => r.status === "approved")
                    .slice(0, 10)
                    .map((r) => (
                      <div key={r.id} style={styles.listItem}>
                        <div style={{ fontWeight: 900 }}>{r.email}</div>
                        <div style={{ fontWeight: 900 }}>
                          {r.start_date} → {r.end_date}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button style={styles.btnWarn} onClick={() => adminSetStatus(r, "revoked")}>
                            Revoke
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              <p style={{ ...styles.muted, marginTop: 10 }}>
                Tip: you can always find older approved items in the calendar.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
