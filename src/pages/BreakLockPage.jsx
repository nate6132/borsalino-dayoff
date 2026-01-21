import { useEffect, useMemo, useState } from "react";

function norm(s) {
  return String(s || "").trim().toLowerCase();
}
function daysBetweenInclusive(startDate, endDate) {
  const s = new Date(startDate + "T00:00:00");
  const e = new Date(endDate + "T00:00:00");
  return Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

export default function DayOffPage({ app }) {
  const { supabase, session, profile, isAdmin, org, pushToast } = app || {};

  const allowance = profile?.annual_allowance ?? 14;

  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const myEmail = (session?.user?.email || "").trim().toLowerCase();

  const myRequests = useMemo(
    () => (requests || []).filter((r) => String(r.email || "").trim().toLowerCase() === myEmail),
    [requests, myEmail]
  );

  const pendingForAdmin = useMemo(
    () => (requests || []).filter((r) => norm(r.status) === "pending"),
    [requests]
  );

  const usedThisYear = useMemo(() => {
    const y = new Date().getFullYear();
    return myRequests
      .filter((r) => new Date(r.start_date).getFullYear() === y)
      .filter((r) => norm(r.status) === "approved")
      .reduce((sum, r) => sum + daysBetweenInclusive(r.start_date, r.end_date), 0);
  }, [myRequests]);

  const remaining = allowance - usedThisYear;

  async function load() {
    if (!session) return;

    // If your day_off_requests table has an org column, this will work.
    // If it doesn't, it will fail — then remove the .eq("org", org) line.
    const q = supabase
      .from("day_off_requests")
      .select("*")
      .order("created_at", { ascending: false });

    // OPTIONAL org filter (comment out if your table doesn't have org)
    // q.eq("org", org);

    const { data, error } = await q;
    if (error) {
      console.log("LOAD REQUESTS ERROR:", error);
      pushToast?.("DayOff load failed", error.message);
      return;
    }
    setRequests(data || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [session, org]);

  async function submit(e) {
    e.preventDefault();
    if (!startDate || !endDate) return pushToast?.("Missing dates", "Pick a start and end date.");
    if (!reason.trim()) return pushToast?.("Missing reason", "Please add a reason.");

    const s = new Date(startDate + "T00:00:00");
    const en = new Date(endDate + "T00:00:00");
    if (en < s) return pushToast?.("Date error", "End date must be after start date.");

    const daysRequested = daysBetweenInclusive(startDate, endDate);
    if (daysRequested > remaining) {
      return pushToast?.("Not enough days", `You have ${remaining} days remaining.`);
    }

    setBusy(true);

    // Include org if your table has it. If it doesn't, delete org: org
    const payload = {
      user_id: session.user.id,
      email: session.user.email,
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim(),
      status: "pending",
      // org,
    };

    const { error } = await supabase.from("day_off_requests").insert(payload);

    setBusy(false);

    if (error) {
      console.log("SUBMIT ERROR:", error);
      pushToast?.("Submit failed", error.message);
      return;
    }

    setStartDate("");
    setEndDate("");
    setReason("");
    pushToast?.("Request submitted", "Sent ✅");

    await load();
  }

  async function cancel(row) {
    if (!confirm("Cancel this request? (Only works if pending)")) return;

    const { error } = await supabase.from("day_off_requests").update({ status: "cancelled" }).eq("id", row.id);
    if (error) return pushToast?.("Cancel failed", error.message);

    pushToast?.("Cancelled", "Done.");
    await load();
  }

  async function adminSetStatus(row, newStatus) {
    const { error } = await supabase.from("day_off_requests").update({ status: newStatus }).eq("id", row.id);
    if (error) return pushToast?.("Update failed", error.message);

    pushToast?.("Updated", `Set to ${newStatus}.`);

    // keep your email edge function if you want
    if (["approved", "denied", "revoked"].includes(newStatus)) {
      const { error: fnErr } = await supabase.functions.invoke("send-approval-email", {
        body: { email: row.email, start_date: row.start_date, end_date: row.end_date, status: newStatus },
      });
      if (fnErr) console.log("EMAIL FAILED:", fnErr);
    }

    await load();
  }

  return (
    <div className="grid">
      <div className="card">
        <div className="kpiRow">
          <div className="kpi">
            <div className="kpiTop">
              <div className="kpiLabel">Allowance</div>
              <span className="pill">Yearly</span>
            </div>
            <div className="kpiVal">{allowance} days</div>
          </div>

          <div className="kpi">
            <div className="kpiTop">
              <div className="kpiLabel">Used</div>
              <span className="pill">This year</span>
            </div>
            <div className="kpiVal">{usedThisYear}</div>
          </div>

          <div className="kpi">
            <div className="kpiTop">
              <div className="kpiLabel">Remaining</div>
              <span className="pill">Available</span>
            </div>
            <div className="kpiVal">{remaining}</div>
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2 className="h2">Request time off</h2>
          <p className="sub">Quick request. Clear approvals.</p>

          <form onSubmit={submit} className="grid" style={{ marginTop: 12 }}>
            <div className="grid2">
              <div>
                <div className="label">Start date</div>
                <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <div className="label">End date</div>
                <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            <div>
              <div className="label">Reason</div>
              <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>

            <div className="actions">
              <button className="btn btnPrimary" disabled={busy}>
                {busy ? "Submitting…" : "Submit request"}
              </button>
              <button type="button" className="btn" onClick={load} disabled={busy}>
                Refresh
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h2 className="h2">My requests</h2>
          <p className="sub">{myRequests.length} total</p>

          <div className="table">
            {myRequests.length === 0 && <div className="sub">No requests yet.</div>}

            {myRequests.map((r) => (
              <div key={r.id} className="rowCard">
                <div className="rowTop">
                  <div style={{ fontWeight: 900 }}>{r.start_date} → {r.end_date}</div>
                  <span className={`status ${norm(r.status) || "pending"}`}>{norm(r.status) || "pending"}</span>
                </div>
                <div className="sub">{r.reason}</div>

                {norm(r.status) === "pending" && (
                  <div className="actions">
                    <button className="btn btnDanger" onClick={() => cancel(r)}>Cancel</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="card">
          <h2 className="h2">Admin approvals</h2>
          <p className="sub">{pendingForAdmin.length} pending</p>

          <div className="table">
            {pendingForAdmin.length === 0 && <div className="sub">No pending requests.</div>}

            {pendingForAdmin.map((r) => (
              <div key={r.id} className="rowCard">
                <div className="rowTop">
                  <div style={{ fontWeight: 900 }}>{r.email}</div>
                  <span className={`status ${norm(r.status)}`}>{norm(r.status)}</span>
                </div>
                <div className="sub">{r.start_date} → {r.end_date}</div>
                <div className="sub">{r.reason}</div>

                <div className="actions">
                  <button className="btn btnPrimary" onClick={() => adminSetStatus(r, "approved")}>Approve</button>
                  <button className="btn btnDanger" onClick={() => adminSetStatus(r, "denied")}>Deny</button>
                  <button className="btn btnWarn" onClick={() => adminSetStatus(r, "revoked")}>Revoke</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
