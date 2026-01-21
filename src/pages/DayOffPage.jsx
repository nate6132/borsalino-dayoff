import { useEffect, useMemo, useState } from "react";

function normalizeStatus(s) {
  return String(s || "").trim().toLowerCase();
}

function daysBetweenInclusive(startDate, endDate) {
  const s = new Date(startDate + "T00:00:00");
  const e = new Date(endDate + "T00:00:00");
  return Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

export default function DayOffPage({ app }) {
  const { supabase, session, profile } = app || {};
  const org = profile?.org;

  const [requests, setRequests] = useState([]);
  const [daysInfo, setDaysInfo] = useState({ used: 0, allowance: 14, remaining: 14 });

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const myEmail = (session?.user?.email || "").trim().toLowerCase();

  const myRequests = useMemo(
    () => (requests || []).filter((r) => String(r.email || "").trim().toLowerCase() === myEmail),
    [requests, myEmail]
  );

  const pendingForAdmin = useMemo(
    () => (requests || []).filter((r) => normalizeStatus(r.status) === "pending"),
    [requests]
  );

  async function loadAllowance() {
    if (!org) return;

    const { data } = await supabase
      .from("org_settings")
      .select("annual_allowance")
      .eq("org", org)
      .single();

    const allowance = data?.annual_allowance ?? 14;

    const year = new Date().getFullYear();

    const { data: mine } = await supabase
      .from("day_off_requests")
      .select("start_date,end_date,status,org")
      .eq("user_id", session.user.id)
      .eq("org", org);

    const used = (mine || [])
      .filter((r) => new Date(r.start_date).getFullYear() === year)
      .filter((r) => normalizeStatus(r.status) === "approved")
      .reduce((sum, r) => sum + daysBetweenInclusive(r.start_date, r.end_date), 0);

    setDaysInfo({ used, allowance, remaining: allowance - used });
  }

  async function loadRequests() {
    if (!org) return;

    // Everyone can load org requests, but admins can approve; if you want employee-only view,
    // change this to filter by user_id unless admin.
    const q = supabase
      .from("day_off_requests")
      .select("*")
      .eq("org", org)
      .order("created_at", { ascending: false });

    const { data, error } = await q;

    if (error) {
      console.log("loadRequests error:", error);
      return;
    }

    setRequests(data || []);
  }

  useEffect(() => {
    if (session && org) {
      loadRequests();
      loadAllowance();
    }
    // eslint-disable-next-line
  }, [session, org]);

  async function submitRequest(e) {
    e.preventDefault();
    setMsg("");

    if (!org) return setMsg("Your org isn’t set yet. Go to Settings.");
    if (!startDate || !endDate) return setMsg("Pick a start and end date.");
    if (!reason.trim()) return setMsg("Add a reason.");

    const s = new Date(startDate + "T00:00:00");
    const en = new Date(endDate + "T00:00:00");
    if (en < s) return setMsg("End date must be the same or after the start date.");

    const daysRequested = daysBetweenInclusive(startDate, endDate);
    if (daysRequested > daysInfo.remaining) {
      return setMsg(`Not enough remaining days. You have ${daysInfo.remaining}.`);
    }

    setBusy(true);

    const { error } = await supabase.from("day_off_requests").insert({
      user_id: session.user.id,
      email: session.user.email,
      org,
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim(),
      status: "pending",
    });

    setBusy(false);

    if (error) return setMsg(error.message);

    setStartDate("");
    setEndDate("");
    setReason("");
    setMsg("Request submitted ✅");

    await loadRequests();
    await loadAllowance();
  }

  async function cancelMyRequest(row) {
    if (!confirm("Cancel this request? (Only if still pending)")) return;

    const { error } = await supabase
      .from("day_off_requests")
      .update({ status: "cancelled" })
      .eq("id", row.id);

    if (error) return alert(error.message);

    await loadRequests();
    await loadAllowance();
  }

  async function adminSetStatus(row, newStatus) {
    if (!profile?.is_admin) return alert("Admins only");

    const { error } = await supabase
      .from("day_off_requests")
      .update({ status: newStatus })
      .eq("id", row.id);

    if (error) return alert(error.message);

    // optional: keep your existing email edge function
    if (["approved", "denied", "revoked"].includes(newStatus)) {
      await supabase.functions.invoke("send-approval-email", {
        body: { email: row.email, start_date: row.start_date, end_date: row.end_date, status: newStatus },
      });
    }

    await loadRequests();
    await loadAllowance();
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="row between wrap">
          <div>
            <h3 className="h3">Time off</h3>
            <p className="muted">Rules are based on your company side: {org || "—"}.</p>
          </div>
          <span className="chip soft">
            {daysInfo.remaining} left / {daysInfo.allowance} total
          </span>
        </div>

        <p className="muted" style={{ marginTop: 10 }}>
          Used this year: <b>{daysInfo.used}</b>
        </p>
      </div>

      <div className="card">
        <div className="row between wrap">
          <h3 className="h3">Request days off</h3>
          <button className="btn ghost" onClick={() => { loadRequests(); loadAllowance(); }}>
            Refresh
          </button>
        </div>

        {msg && <div className="notice">{msg}</div>}

        <form onSubmit={submitRequest} className="form">
          <div className="grid2">
            <div>
              <div className="label">Start</div>
              <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <div className="label">End</div>
              <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="label">Reason</div>
            <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          <button className="btn primary" disabled={busy}>
            {busy ? "Submitting…" : "Submit"}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="row between wrap">
          <h3 className="h3">My requests</h3>
          <span className="chip">{myRequests.length}</span>
        </div>

        <div className="list">
          {myRequests.length === 0 && <div className="muted">Nothing yet.</div>}

          {myRequests.map((r) => (
            <div key={r.id} className="listItem">
              <div className="row between">
                <div className="strong">{r.start_date} → {r.end_date}</div>
                <span className={`status ${normalizeStatus(r.status)}`}>{normalizeStatus(r.status)}</span>
              </div>
              <div className="muted">{r.reason}</div>

              {normalizeStatus(r.status) === "pending" && (
                <button className="btn danger" onClick={() => cancelMyRequest(r)}>
                  Cancel
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {profile?.is_admin && (
        <div className="card">
          <div className="row between wrap">
            <h3 className="h3">Admin approvals</h3>
            <span className="chip">{pendingForAdmin.length} pending</span>
          </div>

          <div className="list">
            {pendingForAdmin.length === 0 && <div className="muted">No pending requests.</div>}

            {pendingForAdmin.map((r) => (
              <div key={r.id} className="listItem">
                <div className="row between">
                  <div className="strong">{r.email}</div>
                  <span className={`status ${normalizeStatus(r.status)}`}>{normalizeStatus(r.status)}</span>
                </div>
                <div className="muted">{r.start_date} → {r.end_date}</div>
                <div className="muted">{r.reason}</div>

                <div className="row wrap" style={{ gap: 10, marginTop: 10 }}>
                  <button className="btn primary" onClick={() => adminSetStatus(r, "approved")}>Approve</button>
                  <button className="btn danger" onClick={() => adminSetStatus(r, "denied")}>Deny</button>
                  <button className="btn warn" onClick={() => adminSetStatus(r, "revoked")}>Revoke</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
