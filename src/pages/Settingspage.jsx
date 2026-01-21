import { useEffect, useState } from "react";

export default function SettingsPage({ app }) {
  const { supabase, session, profile, updateProfile, pushToast } = app || {};
  const [name, setName] = useState(profile?.display_name || "");
  const [org, setOrg] = useState(profile?.org || "borsalino");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(profile?.display_name || "");
    setOrg(profile?.org || "borsalino");
  }, [profile]);

  if (!supabase || !session) {
    return (
      <div className="card">
        <h2 className="h2">Settings</h2>
        <p className="sub">You must be logged in.</p>
      </div>
    );
  }

  async function save() {
    try {
      setBusy(true);
      await updateProfile({ display_name: name.trim(), org });
      pushToast?.("Saved", "Profile updated ✅");
    } catch (e) {
      console.error(e);
      pushToast?.("Save failed", e?.message || "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // NOTE: deleting a user securely should be done server-side with service role,
  // but this at least gives you the UI for now.
  async function deleteAccountUIOnly() {
    alert(
      "Account deletion requires a server-side admin/edge function (service role). Tell me if you want me to generate that next."
    );
  }

  const canSave = name.trim().length >= 2;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card">
        <h2 className="h2">Settings</h2>
        <p className="sub">Update your profile and org.</p>

        <div style={{ marginTop: 14, display: "grid", gap: 12, maxWidth: 520 }}>
          <div>
            <div className="label">Display name</div>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nate"
            />
          </div>

          <div>
            <div className="label">Org</div>
            <select className="input" value={org} onChange={(e) => setOrg(e.target.value)}>
              <option value="borsalino">Borsalino</option>
              <option value="atica">Atica</option>
            </select>
            <p className="sub" style={{ marginTop: 8 }}>
              This controls which rules you see for breaks + days off.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btnPrimary" onClick={save} disabled={!canSave || busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button className="btn" onClick={signOut} disabled={busy}>
              Log out
            </button>
            <button className="btn" onClick={deleteAccountUIOnly} disabled={busy}>
              Delete account
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="h2">Account</h2>
        <p className="sub">
          Signed in as <b>{session?.user?.email}</b>
        </p>
      </div>
    </div>
  );
}
