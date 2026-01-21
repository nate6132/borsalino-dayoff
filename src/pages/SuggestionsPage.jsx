import { useEffect, useState } from "react";

export default function SuggestionsPage({ app }) {
  const { supabase, session, isAdmin, pushToast } = app || {};

  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [mySuggestions, setMySuggestions] = useState([]);
  const [allSuggestions, setAllSuggestions] = useState([]);

  async function load() {
    const { data: mine } = await supabase
      .from("suggestions")
      .select("id,created_at,message,email")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    setMySuggestions(mine || []);

    if (isAdmin) {
      const { data: all } = await supabase
        .from("suggestions")
        .select("id,created_at,message,email,user_id")
        .order("created_at", { ascending: false })
        .limit(200);

      setAllSuggestions(all || []);
    } else {
      setAllSuggestions([]);
    }
  }

  useEffect(() => {
    if (session) load();
    // eslint-disable-next-line
  }, [session, isAdmin]);

  async function submit(e) {
    e.preventDefault();
    const text = message.trim();
    if (!text) return pushToast?.("Missing message", "Type a suggestion first.");

    setBusy(true);

    const { error } = await supabase.from("suggestions").insert({
      user_id: session.user.id,
      email: session.user.email,
      message: text,
      // org: org, // optional if you add org column
    });

    setBusy(false);

    if (error) {
      console.log("SUGGESTION INSERT ERROR:", error);
      pushToast?.("Send failed", error.message);
      return;
    }

    setMessage("");
    pushToast?.("Sent", "Thanks ✅");
    await load();
  }

  return (
    <div className="grid">
      <div className="card">
        <div className="header" style={{ marginBottom: 0 }}>
          <div>
            <h2 className="h2">Suggestions</h2>
            <p className="sub">Send ideas. We’ll actually read them.</p>
          </div>
          <span className="pill">{isAdmin ? "Admin view" : "Employee view"}</span>
        </div>

        <form onSubmit={submit} className="grid" style={{ marginTop: 14 }}>
          <div>
            <div className="label">Your suggestion</div>
            <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>

          <div className="actions">
            <button className="btn btnPrimary" disabled={busy}>
              {busy ? "Sending…" : "Send"}
            </button>
            <button type="button" className="btn" onClick={load} disabled={busy}>
              Refresh
            </button>
          </div>
        </form>
      </div>

      <div className="grid2">
        <div className="card">
          <h2 className="h2">My submissions</h2>
          <p className="sub">{mySuggestions.length} total</p>

          <div className="table">
            {mySuggestions.length === 0 && <div className="sub">None yet.</div>}
            {mySuggestions.map((s) => (
              <div key={s.id} className="rowCard">
                <div className="rowTop">
                  <div style={{ fontWeight: 900 }}>{new Date(s.created_at).toLocaleString()}</div>
                  <span className="pill">You</span>
                </div>
                <div className="sub">{s.message}</div>
              </div>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div className="card">
            <h2 className="h2">All suggestions</h2>
            <p className="sub">{allSuggestions.length} total</p>

            <div className="table">
              {allSuggestions.length === 0 && <div className="sub">No suggestions yet.</div>}
              {allSuggestions.map((s) => (
                <div key={s.id} className="rowCard">
                  <div className="rowTop">
                    <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.email}
                    </div>
                    <span className="pill">{new Date(s.created_at).toLocaleString()}</span>
                  </div>
                  <div className="sub">{s.message}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
