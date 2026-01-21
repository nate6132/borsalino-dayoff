import { useState } from "react";

export default function SettingsPage({ app }) {
  const { supabase, session, profile, setProfile } = app || {};
  const [name, setName] = useState(profile?.display_name || "");
  const [org, setOrg] = useState(profile?.org || "");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveProfile() {
    setMsg("");
    const display_name = name.trim();
    if (display_name.length < 2) return setMsg("Name must be at least 2 characters.");
    if (org !== "borsalino" && org !== "atica") return setMsg("Pick Borsalino or Atica.");

    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name, org })
      .eq("id", session.user.id);
    setBusy(false);

    if (error) return setMsg(error.message);

    setProfile?.((p) => ({ ...(p || {}), display_name, org }));
    setMsg("Saved ✅");
  }

  async function changePassword() {
    setMsg("");
    if (password.length < 8) return setMsg("Password must be at least 8 characters.");

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) return setMsg(error.message);

    setPassword("");
    setMsg("Password updated ✅");
  }

  async function deleteAccount() {
    const ok = confirm(
      "This will permanently delete your account + your data. This cannot be undone. Continue?"
    );
    if (!ok) return;

    setBusy(true);
    setMsg("");

    // Requires an Edge Function: delete-account (code below)
    const { data, error } = await supabase.functions.invoke("delete-account", { body: {} });

    setBusy(false);

    if (error) return setMsg(error.message || "Delete failed");

    alert("Account deleted. Goodbye 👋");
    await supabase.auth.signOut();
  }

  return (
    <div className="stack">
      <div className="card">
        <h3 className="h3">Account</h3>
        <p className="muted">Update your profile and company side.</p>

        {msg && <div className="notice">{msg}</div>}

        <div className="grid" style={{ marginTop: 12 }}>
          <div>
            <div className="label">Name</div>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <div className="label">Company side</div>
            <div className="seg">
              <button type="button" className={org === "borsalino" ? "segBtn on" : "segBtn"} onClick={() => setOrg("borsalino")}>
                Borsalino
              </button>
              <button type="button" className={org === "atica" ? "segBtn on" : "segBtn"} onClick={() => setOrg("atica")}>
                Atica
              </button>
            </div>
          </div>
        </div>

        <button className="btn primary" onClick={saveProfile} disabled={busy} style={{ marginTop: 14 }}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>

      <div className="card">
        <h3 className="h3">Password</h3>
        <p className="muted">If you use email/password, you can change it here.</p>

        <div style={{ marginTop: 12 }}>
          <div className="label">New password</div>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>

        <button className="btn" onClick={changePassword} disabled={busy} style={{ marginTop: 12 }}>
          Update password
        </button>
      </div>

      <div className="card dangerCard">
        <h3 className="h3">Danger zone</h3>
        <p className="muted">Delete your account permanently.</p>

        <button className="btn danger" onClick={deleteAccount} disabled={busy}>
          Delete my account
        </button>
      </div>
    </div>
  );
}
