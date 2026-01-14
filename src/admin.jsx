import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export default function Admin() {
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    const { data } = await supabase
      .from("day_off_requests")
      .select("*")
      .order("created_at", { ascending: false });
    setRequests(data || []);
  }

  async function updateStatus(id, status) {
    await supabase
      .from("day_off_requests")
      .update({ status })
      .eq("id", id);
    loadRequests();
  }

  return (
    <div>
      <h1>Admin Approval</h1>
      {requests.map(r => (
        <div key={r.id} style={{ border: "1px solid #ccc", margin: 10, padding: 10 }}>
          <div>User: {r.user_id}</div>
          <div>{r.start_date} → {r.end_date}</div>
          <div>Reason: {r.reason}</div>
          <div>Status: {r.status}</div>
          {r.status === "pending" && (
            <>
              <button onClick={() => updateStatus(r.id, "approved")}>Approve</button>
              <button onClick={() => updateStatus(r.id, "rejected")}>Reject</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
