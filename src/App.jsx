import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";

// FullCalendar uses an exclusive end date, so add 1 day to end_date
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

function prettyNameFromEmail(email) {
  if (!email) return "";
  const left = (email.split("@")[0] || "").trim();
  if (!left) return "";
  return left.charAt(0).toUpperCase() + left.slice(1);
}

function isSmallScreen() {
  if (typeof window === "undefined") return false;
  return window.matchMedia && window.matchMedia("(max-width: 860px)").matches;
}

const styles = {
  // Top-level page wrapper: iPhone safe & no horizontal sliding
  page: {
    minHeight: "100svh",
    width: "100%",
    maxWidth: "100vw",
    overflowX: "hidden",
    background:
      "radial-gradient(1200px 700px at 20% 0%, rgba(99,102,241,0.13), transparent 60%), radial-gradient(900px 600px at 85% 10%, rgba(16,185,129,0.11), transparent 58%), #f8fafc",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    color: "#0f172a",
  },

  // Safe-area wrapper
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

  container: {
    width: "100%",
    maxWidth: 1100,
    margin: "0 auto",
    padding: "18px 14px 50px",
  },

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

  h3row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 10,
    marginBottom: 10,
  },

  h3: { margin: 0, fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em" },
  muted: { margin: 0, color: "#64748b", fontSize: 13 },

  label: { fontSize: 12, fontWeight: 900, color: "#334155", marginBottom: 6 },

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

  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },

  btn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(15, 23, 42, 0.12)",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
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
    background: "rgba(239,68,68,0.10)",
    color: "#b91c1c",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 14,
  },

  btnWarn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(245,158,11,0.25)",
    background: "rgba(245,158,11,0.12)",
    color: "#92400e",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 14,
  },

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
    if (s === "approved") return { ...base, background: "rgba(16,185,129,0.12)", color: "#065f46" };
    if (s === "denied") return { ...base, background: "rgba(239,68,68,0.12)", color: "#991b1b" };
    if (s === "pending") return { ...base, background: "rgba(99,102,241,0.12)", color: "#3730a3" };
    if (s === "cancelled") return { ...base, background: "rgba(148,163,184,0.20)", color: "#334155" };
    if (s === "revoked") return { ...base, background: "rgba(245,158,11,0.15)", color: "#92400e" };
    return base;
  },

  // Calendar wrapper to prevent full-page horizontal panning
  calendarWrap: {
    width: "100%",
    maxWidth: "100%",
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "rgba(255,255,255,0.85)",
  },
};

export default function App() {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // profiles table may not have "name"; keep this but don't query unless it exists
  const [profileName, setProfileName] = useState("");

  const [start_date, setStartDate] = useState("");
  const [end_date, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const [requests, setRequests] = useState([]);
  const [daysInfo, setDaysInfo] = useState({ used: 0, allowance: 14, remaining: 14 });

  const [small, setSmall] = useState(isSmallScreen());

  useEffect(() => {
    const onResize = () => setSmall(isSmallScreen());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
    // IMPORTANT: don't select "name" because your profiles table doesn't have it
    const { data, error } = await supabase
      .from("profiles")
      .select("is_admin, annual_allowance, email")
      .eq("id", userId)
      .single();

    if (error) {
      console.log("PROFILE ERROR:", error);
      setIsAdmin(false);
      setProfileName("");
      setDaysInfo({ used: 0, allowance: 14, remaining: 14 });
      return;
    }

    setIsAdmin(!!data?.is_admin);

    // If you later add profiles.name, you can set it here.
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

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("annual_allowance")
      .eq("id", session.user.id)
      .single();

    if (pErr) {
      console.log("ALLOWANCE ERROR:", pErr);
    }

    const allowance = profile?.annual_allowance ?? 14;
    const year = new Date().getFullYear();

    const { data: approved, error: aErr } = await supabase
      .from("day_off_requests")
      .select("start_date,end_date")
      .eq("user_id", session.user.id)
      .eq("status", "approved");

    if (aErr) {
      console.log("APPROVED FETCH ERROR:", aErr);
    }

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

    // Uses RPC if you already created it; otherwise fallback to insert
    // Preferred: RPC "request_day_off"
    const { data, error } = await supabase.rpc("request_day_off", {
      p_start_date: start_date,
      p_end_date: end_date,
      p_reason: reason,
    });

    if (error) {
      // Fallback: direct insert (if you didn’t create the RPC)
      console.log("RPC ERROR (fallback to insert):", error);

      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) return alert("Not logged in.");

      const { error: insErr } = await supabase.from("day_off_requests").insert({
        user_id: user.id,
        email: user.email,
        start_date,
        end_date,
        reason,
        status: "pending",
      });

      if (insErr) return alert(insErr.message);
    } else {
      if (!data?.ok) {
        alert(
          `${data?.error}\nUsed: ${data?.used}\nRequested: ${data?.requested}\nAllowance: ${data?.allowance}`
        );
        return;
      }
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

    // email for approved/denied/revoked
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
  const displayName = profileName?.trim()
    ? profileName.trim()
    : prettyNameFromEmail(session?.user?.email);

  const myRequests = useMemo(() => {
    if (!session) return [];
    return requests.filter((r) => r.user_id === session.user.id);
  }, [requests, session]);

  const pendingRequests = useMemo(() => {
    return requests.filter((r) => r.status === "pending");
  }, [requests]);

  const approvedEvents = useMemo(() => {
    return requests
      .filter((r) => r.status === "approved")
      .map((r) => ({
        id: r.id,
        title: r.email || "Approved",
        start: r.start_date,
        end: addOneDayYYYYMMDD(r.end_date),
      }));
  }, [requests]);

  // ---------- AUTH SCREEN ----------
  if (!session) {
    return (
      <div style={styles.page}>
        <div style={styles.safe}>
          <div style={{ ...styles.container, maxWidth: 460, paddingTop: 70 }}>
            <div style={styles.card}>
              <div style={{ marginBottom: 10 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em" }}>
                  Welcome 👋
                </h2>
                <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
                  Sign in with your work email to request time off.
                </p>
              </div>

              <Auth
                supabaseClient={supabase}
                appearance={{ theme: ThemeSupa }}
                providers={[]} // email/password only
                redirectTo={window.location.origin}
                magicLink={false}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mobile-first layout: 1 column on small screens, 2 columns on desktop
  const employeeLayout = {
    display: "grid",
    gridTemplateColumns: small ? "1fr" : "1.15fr 0.85fr",
    gap: 14,
  };

  const adminLayout = {
    display: "grid",
    gridTemplateColumns: small ? "1fr" : "1.2fr 0.8fr",
    gap: 14,
  };

  return (
    <div style={styles.page}>
      <div style={styles.safe}>
        <div style={styles.container}>
          {/* TOP BAR */}
          <div style={styles.topbar}>
            <div style={styles.brandRow}>
              <img src="/logo.png" alt="DayOff logo" style={styles.logo} />
              <div style={styles.brandText}>
                <h1 style={styles.title}>
                  {getGreeting()}, {displayName}
                </h1>
                <p style={styles.subtitle}>{isAdmin ? "Admin dashboard" : "Request and track your time off"}</p>
              </div>
            </div>

            <div style={styles.rightRow}>
              <span style={styles.badge}>{isAdmin ? "Admin" : "Employee"}</span>
              <button style={styles.btn} onClick={() => supabase.auth.signOut()}>
                Log out
              </button>
            </div>
          </div>

          {/* EMPLOYEE VIEW */}
          {!isAdmin && (
            <div style={employeeLayout}>
              <div style={styles.card}>
                <div style={styles.h3row}>
                  <h3 style={styles.h3}>Request time off</h3>
                  <span style={styles.pill}>
                    Remaining: {daysInfo.remaining} / {daysInfo.allowance}
                  </span>
                </div>
                <p style={styles.muted}>Pick dates and add a reason. You can cancel while pending.</p>

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
                    placeholder="Example: family event, appointment, travel..."
                  />
                </div>

                <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                  <button style={styles.btnPrimary} onClick={submitRequest}>
                    Submit request
                  </button>
                </div>
              </div>

              <div style={styles.card}>
                <div style={styles.h3row}>
                  <h3 style={styles.h3}>My requests</h3>
                  <span style={styles.muted}>{myRequests.length} total</span>
                </div>

                {myRequests.length === 0 ? (
                  <p style={styles.muted}>No requests yet.</p>
                ) : (
                  <div style={styles.list}>
                    {myRequests.map((r) => (
                      <div key={r.id} style={styles.listItem}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <div style={{ fontWeight: 900, minWidth: 0 }}>
                            {r.start_date} → {r.end_date}
                          </div>
                          <span style={styles.status(r.status)}>{r.status}</span>
                        </div>
                        <div style={{ color: "#334155", fontSize: 13, overflowWrap: "anywhere" }}>{r.reason}</div>

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
            <div style={adminLayout}>
              <div style={styles.card}>
                <div style={styles.h3row}>
                  <h3 style={styles.h3}>Calendar</h3>
                  <span style={styles.muted}>Approved time off</span>
                </div>

                {/* prevents full-page horizontal panning */}
                <div style={styles.calendarWrap}>
                  <div style={{ minWidth: 320 }}>
                    <FullCalendar
                      plugins={[dayGridPlugin, interactionPlugin]}
                      initialView="dayGridMonth"
                      events={approvedEvents}
                      height="auto"
                    />
                  </div>
                </div>
              </div>

              <div style={styles.card}>
                <div style={styles.h3row}>
                  <h3 style={styles.h3}>Pending approvals</h3>
                  <span style={styles.muted}>{pendingRequests.length}</span>
                </div>

                {pendingRequests.length === 0 ? (
                  <p style={styles.muted}>No pending requests.</p>
                ) : (
                  <div style={styles.list}>
                    {pendingRequests.map((r) => (
                      <div key={r.id} style={styles.listItem}>
                        <div style={{ fontWeight: 900, overflowWrap: "anywhere" }}>{r.email}</div>
                        <div style={{ fontWeight: 900 }}>
                          {r.start_date} → {r.end_date}
                        </div>
                        <div style={{ color: "#334155", fontSize: 13, overflowWrap: "anywhere" }}>{r.reason}</div>

                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
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

                <div style={{ height: 1, background: "rgba(15,23,42,0.08)", margin: "14px 0" }} />

                <div style={styles.h3row}>
                  <h3 style={styles.h3}>Approved (revoke)</h3>
                  <span style={styles.muted}>{requests.filter((r) => r.status === "approved").length}</span>
                </div>

                {requests.filter((r) => r.status === "approved").length === 0 ? (
                  <p style={styles.muted}>No approved requests yet.</p>
                ) : (
                  <div style={styles.list}>
                    {requests
                      .filter((r) => r.status === "approved")
                      .slice(0, 10)
                      .map((r) => (
                        <div key={r.id} style={styles.listItem}>
                          <div style={{ fontWeight: 900, overflowWrap: "anywhere" }}>{r.email}</div>
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
                  Tip: approved requests show up in the calendar automatically.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
