import { useEffect, useState } from "react";

export default function SuggestionsPage({ app }) {
  const { supabase, session, isAdmin, styles } = app || {};

  const [message, setMessage] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [mySuggestions, setMySuggestions] = useState([]);
  const [allSuggestions, setAllSuggestions] = useState([]);

  async function load() {
    setMsg("");

    // Load my suggestions
    const { data: mine, error: mineErr } = await supabase
      .from("suggestions")
      .select("id,created_at,message,email")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (mineErr) console.log("MY SUGGESTIONS LOAD ERROR:", mineErr);
    setMySuggestions(mine || []);

    // Admin: load all suggestions
    if (isAdmin) {
      const { data: all, error: allErr } = await supabase
        .from("suggestions")
        .select("id,created_at,message,email,user_id")
        .order("created_at", { ascending: false })
        .limit(200);

      if (allErr) console.log("ALL SUGGESTIONS LOAD ERROR:", allErr);
      setAllSuggestions(all || []);
    } else {
      setAllSuggestions([]);
    }
  }

  useEffect(() => {
    if (session) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isAdmin]);

  async function submitSuggestion(e) {
    e.preventDefault();
    setMsg("");

    const text = message.trim();
    if (!text) return setMsg("Type a suggestion first.");

    setBusy(true);

    const { error } = await supabase.from("suggestions").insert({
      user_id: session.user.id,
      email: session.user.email,
      message: text,
    });

    setBusy(false);

    if (error) {
      console.log("SUGGESTION INSERT ERROR:", error);
      setMsg(error.message);
      return;
    }

    setMessage("");
    setMsg("✅ Sent!");
    await load();
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={styles?.card}>
        <div style={styles?.h3row}>
          <h3 style={styles?.h3}>Suggestions</h3>
          <span style={styles?.pill}>{isAdmin ? "Admin view" : "Employee view"}</span>
        </div>

        {msg && <div style={{ fontWeight: 900 }}>{msg}</div>}

        <form onSubmit={submitSuggestion} style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <div style={styles?.label}>Send a suggestion</div>
          <textarea
            style={styles?.textarea}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your suggestion here…"
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" style={styles?.btnPrimary} disabled={busy}>
              {busy ? "Sending…" : "Send"}
            </button>
            <button type="button" style={styles?.btn} onClick={load} disabled={busy}>
              Refresh
            </button>
          </div>
        </form>
      </div>

      {/* My suggestions */}
      <div style={styles?.card}>
        <div style={styles?.h3row}>
          <h3 style={styles?.h3}>My submitted suggestions</h3>
          <span style={styles?.pill}>{mySuggestions.length}</span>
        </div>

        <div style={styles?.list}>
          {mySuggestions.length === 0 && <div style={styles?.muted}>None yet.</div>}
          {mySuggestions.map((s) => (
            <div key={s.id} style={styles?.listItem}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 900 }}>{s.email}</div>
                <span style={styles?.pill}>{new Date(s.created_at).toLocaleString()}</span>
              </div>
              <div style={styles?.muted}>{s.message}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Admin only */}
      {isAdmin && (
        <div style={styles?.card}>
          <div style={styles?.h3row}>
            <h3 style={styles?.h3}>All suggestions (admin only)</h3>
            <span style={styles?.pill}>{allSuggestions.length}</span>
          </div>

          <div style={styles?.list}>
            {allSuggestions.length === 0 && <div style={styles?.muted}>No suggestions yet.</div>}
            {allSuggestions.map((s) => (
              <div key={s.id} style={styles?.listItem}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {s.email}
                  </div>
                  <span style={styles?.pill}>{new Date(s.created_at).toLocaleString()}</span>
                </div>
                <div style={styles?.muted}>{s.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
