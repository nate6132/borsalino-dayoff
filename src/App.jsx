import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";

// your already-working approval email function URL:
const APPROVAL_EMAIL_FUNCTION_URL =
  "https://qwaawlmfybjdnakwygsu.supabase.co/functions/v1/send-approval-email";

function addOneDayYYYYMMDD(dateStr) {
  // dateStr: "YYYY-MM-DD"
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // request form (matches your DB columns)
  const [start_date, setStartDate] = useState("");
  const [end_date, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  // all requests (admin sees all, users see theirs)
  const [requests, setRequests] = useState([]);

  // days tracking
  const [daysInfo, setDaysInfo] = useState({ used: 0, allowance: 7, remaining: 7 });

  // ---------- AUTH ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) checkAdmin(data.session.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) checkAdmin(session.user.id);
      else setIsAdmin(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkAdmin(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("is_admin, annual_allowance")
      .eq("id", userId)
      .single();

    if (error) {
      console.log("PROFILE ERROR:", error);
      setIsAdmin(false);
      return;
    }

    setIsAdmin(!!data?.is_admin);

    // set allowance from profile if exists
    const allowance = data?.annual_allowance ?? 7;
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

    // get allowance from profiles (default 7)
    const { data: profile } = await supabase
      .from("profiles")
      .select("annual_allowance")
      .eq("id", session.user.id)
      .single();

    const allowance = profile?.annual_allowance ?? 7;
    const year = new Date().getFullYear();

    // get approved requests for this user
    const { data: approved, error } = await supabase
      .from("day_off_requests")
      .select("start_date,end_date,status")
      .eq("user_id", session.user.id)
      .eq("status", "approved");

    if (error) {
      console.log("DAYS FETCH ERROR:", error);
      setDaysInfo({ used: 0, allowance, remaining: allowance });
      return;
    }

    const used = (approved || [])
      .filter((r) => new Date(r.start_date).getFullYear() === year)
      .reduce((sum, r) => {
        const s = new Date(r.start_date + "T00:00:00");
        const e = new Date(r.end_date + "T00:00:00");
        const days = Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1; // inclusive
        return sum + days;
      }, 0);

    setDaysInfo({
      used,
      allowance,
      remaining: allowance - used,
    });
  }

  // refresh days when requests change
  useEffect(() => {
    if (session) refreshDaysInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, requests.length]);

  // ---------- SUBMIT REQUEST (ENFORCES 7 DAYS/YEAR IN DB) ----------
  async function submitRequest() {
    if (!start_date || !end_date || !reason) return alert("Fill all fields");
    if (end_date < start_date) return alert("End date cannot be before start date");

    // Calls your SQL function: request_day_off(p_start_date, p_end_date, p_reason)
    const { data, error } = await supabase.rpc("request_day_off", {
      p_start_date: start_date,
      p_end_date: end_date,
      p_reason: reason,
    });

    if (error) {
      console.log("RPC ERROR:", error);
      alert(error.message);
      return;
    }

    if (!data?.ok) {
      alert(
        `${data?.error}\nUsed: ${data?.used}\nRequested: ${data?.requested}\nAllowance: ${data?.allowance}`
      );
      return;
    }

    alert("Request sent!");
    setStartDate("");
    setEndDate("");
    setReason("");
    await loadRequests();
    await refreshDaysInfo();
  }

  // ---------- ADMIN APPROVE/DENY + EMAIL ON APPROVE ----------
  async function updateStatus(requestRow, newStatus) {
    const { error } = await supabase
      .from("day_off_requests")
      .update({ status: newStatus })
      .eq("id", requestRow.id);

    if (error) {
      console.log("UPDATE ERROR:", error);
      alert(error.message);
      return;
    }

    // email on approval (no triggers)
    if (newStatus === "approved") {
      try {
        const resp = await fetch(APPROVAL_EMAIL_FUNCTION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: requestRow.email,
            start_date: requestRow.start_date,
            end_date: requestRow.end_date,
            status: "approved",
          }),
        });

        if (!resp.ok) {
          const txt = await resp.text();
          console.log("EMAIL FUNCTION ERROR:", txt);
          alert("Approved, but email failed (check Edge Function logs).");
        }
      } catch (e) {
        console.log("EMAIL CRASH:", e);
        alert("Approved, but email failed (check console).");
      }
    }

    await loadRequests();
    await refreshDaysInfo();
  }

  // ---------- DERIVED LISTS ----------
  const myRequests = useMemo(() => {
    if (!session) return [];
    return requests.filter((r) => r.user_id === session.user.id);
  }, [requests, session]);

  const pendingRequests = useMemo(() => {
    return requests.filter((r) => r.status === "pending");
  }, [requests]);

  const approvedEvents = useMemo(() => {
    // FullCalendar "end" is exclusive, so we add 1 day
    return requests
      .filter((r) => r.status === "approved")
      .map((r) => ({
        id: r.id,
        title: r.email,
        start: r.start_date,
        end: addOneDayYYYYMMDD(r.end_date),
      }));
  }, [requests]);

  // ---------- UI ----------
  if (!session) {
    return (
      <div style={{ maxWidth: 420, margin: "60px auto" }}>
        <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} />
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Borsalino Day Off</h2>
        <button onClick={() => supabase.auth.signOut()}>Logout</button>
      </div>

      {/* EMPLOYEE VIEW */}
      {!isAdmin && (
        <>
          <div style={{ border: "1px solid #ddd", padding: 12, marginBottom: 20 }}>
            <h3>Request Day Off</h3>

            <p>
              Days used: <b>{daysInfo.used}</b> / {daysInfo.allowance} — Remaining:{" "}
              <b>{daysInfo.remaining}</b>
            </p>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div>Start date</div>
                <input
                  type="date"
                  value={start_date}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <div>End date</div>
                <input
                  type="date"
                  value={end_date}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div>Reason</div>
              <textarea
                style={{ width: "100%", minHeight: 80 }}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why do you need time off?"
              />
            </div>

            <button style={{ marginTop: 10 }} onClick={submitRequest}>
              Submit
            </button>
          </div>

          <div>
            <h3>My Requests</h3>
            {myRequests.length === 0 ? (
              <p>No requests yet.</p>
            ) : (
              myRequests.map((r) => (
                <div key={r.id} style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                  <b>{r.start_date}</b> → <b>{r.end_date}</b> — {r.reason} —{" "}
                  <b>{r.status}</b>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ADMIN VIEW */}
      {isAdmin && (
        <>
          <div style={{ marginTop: 20, marginBottom: 20 }}>
            <h3>Admin Calendar (Approved Time Off)</h3>
            <div style={{ border: "1px solid #ddd", padding: 10, borderRadius: 8 }}>
              <FullCalendar
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                events={approvedEvents}
                height="auto"
              />
            </div>
          </div>

          <div>
            <h3>Pending Requests</h3>
            {pendingRequests.length === 0 ? (
              <p>No pending requests.</p>
            ) : (
              pendingRequests.map((r) => (
                <div
                  key={r.id}
                  style={{
                    border: "1px solid #ccc",
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <b>{r.email}</b>
                  </div>
                  <div>
                    <b>{r.start_date}</b> → <b>{r.end_date}</b>
                  </div>
                  <div>Reason: {r.reason}</div>
                  <div>
                    Status: <b>{r.status}</b>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                    <button onClick={() => updateStatus(r, "approved")}>Approve</button>
                    <button onClick={() => updateStatus(r, "denied")}>Deny</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
