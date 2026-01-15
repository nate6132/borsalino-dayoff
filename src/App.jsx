import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";

function addOneDayYYYYMMDD(dateStr) {
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

  const [start_date, setStartDate] = useState("");
  const [end_date, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const [requests, setRequests] = useState([]);

  const [daysInfo, setDaysInfo] = useState({
    used: 0,
    allowance: 14,
    remaining: 14,
  });

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
      else setIsAdmin(false);
    });

    return () => subscription.unsubscribe();
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
      setDaysInfo((prev) => ({ ...prev, allowance: 14, remaining: 14 }));
      return;
    }

    setIsAdmin(!!data?.is_admin);
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

    alert("Request sent!");
    setStartDate("");
    setEndDate("");
    setReason("");
    await loadRequests();
  }

  // ---------- USER CANCEL (only pending) ----------
  async function cancelMyRequest(row) {
    const ok = confirm("Cancel this request? (Only works if still pending)");
    if (!ok) return;

    const { error } = await supabase
      .from("day_off_requests")
      .update({ status: "cancelled" })
      .eq("id", row.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadRequests();
  }

  // ---------- ADMIN UPDATE STATUS + EMAIL (approved/denied only) ----------
  async function adminSetStatus(row, newStatus) {
    const { error } = await supabase
      .from("day_off_requests")
      .update({ status: newStatus })
      .eq("id", row.id);

    if (error) {
      alert(error.message);
      return;
    }

    // Send email for approved OR denied
    if (["approved", "denied", "revoked"].includes(newStatus)) {
  const { data, error: fnErr } = await supabase.functions.invoke("send-approval-email", {
    body: {
      email: row.email,
      start_date: row.start_date,
      end_date: row.end_date,
      status: newStatus, // will be "revoked"
    },
  });

  console.log("EMAIL INVOKE:", newStatus, data, fnErr);

  if (fnErr) alert(`Status updated to ${newStatus}, but email failed. Check function logs.`);
}

    await loadRequests();
  }

  // ---------- DERIVED LISTS ----------
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
                <input type="date" value={start_date} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <div>End date</div>
                <input type="date" value={end_date} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div>Reason</div>
              <textarea
                style={{ width: "100%", minHeight: 80 }}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <button style={{ marginTop: 10 }} onClick={submitRequest}>
              Submit
            </button>
          </div>

          <h3>My Requests</h3>
          {myRequests.length === 0 ? (
            <p>No requests yet.</p>
          ) : (
            myRequests.map((r) => (
              <div key={r.id} style={{ borderBottom: "1px solid #eee", padding: 10 }}>
                <div>
                  <b>{r.start_date}</b> → <b>{r.end_date}</b>
                </div>
                <div>Reason: {r.reason}</div>
                <div>
                  Status: <b>{r.status}</b>
                </div>

                {r.status === "pending" && (
                  <button style={{ marginTop: 6 }} onClick={() => cancelMyRequest(r)}>
                    Cancel request
                  </button>
                )}
              </div>
            ))
          )}
        </>
      )}

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

          <h3>Pending Requests</h3>
          {pendingRequests.length === 0 ? (
            <p>No pending requests.</p>
          ) : (
            pendingRequests.map((r) => (
              <div key={r.id} style={{ border: "1px solid #ccc", padding: 12, marginBottom: 10 }}>
                <div><b>{r.email}</b></div>
                <div><b>{r.start_date}</b> → <b>{r.end_date}</b></div>
                <div>Reason: {r.reason}</div>
                <div>Status: <b>{r.status}</b></div>

                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <button onClick={() => adminSetStatus(r, "approved")}>Approve</button>
                  <button onClick={() => adminSetStatus(r, "denied")}>Deny</button>
                </div>
              </div>
            ))
          )}

          <h3 style={{ marginTop: 25 }}>Already Approved (Admin can revoke)</h3>
          {requests.filter((r) => r.status === "approved").length === 0 ? (
            <p>No approved requests yet.</p>
          ) : (
            requests
              .filter((r) => r.status === "approved")
              .map((r) => (
                <div key={r.id} style={{ border: "1px solid #eee", padding: 10, marginBottom: 8 }}>
                  <div><b>{r.email}</b></div>
                  <div><b>{r.start_date}</b> → <b>{r.end_date}</b></div>
                  <div>Status: <b>{r.status}</b></div>

                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                    <button onClick={() => adminSetStatus(r, "revoked")}>
                      Revoke approval
                    </button>
                    <button onClick={() => adminSetStatus(r, "denied")}>
                      Change to denied
                    </button>
                  </div>
                </div>
              ))
          )}
        </>
      )}
    </div>
  );
}
