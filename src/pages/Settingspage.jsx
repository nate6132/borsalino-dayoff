import { useMemo, useState } from "react";

export default function SettingsPage({ app }) {
  const { supabase, session, profile, updateProfile, org, pushToast } = app || {};

  const [name, setName] = useState(profile?.display_name || "");
  const [orgLocal, setOrgLocal] = useState(org || "borsalino");

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  const email = session?.user?.email || "";
  const canSaveName = name.trim().length >= 2;
  const canSavePw = pw1.length >= 8 && pw1 === pw2;

  const orgLabel = useMemo(() => (orgLocal === "atica" ? "Atica" : "Borsalino"), [orgLocal]);

  async function saveProfile() {
    try {
      setBusy(true);
      await updateProfile({ display_name: name.trim(), org: orgLocal });
      pushToast?.("Saved", `Updated profile • ${orgLabel}`);
    } catch (e) {
      console.error(e);
      pushToast?.("Save failed", e?.message || "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    if (!canSavePw) return;
    try {
      setBusy(true);
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      setPw1(""); setPw2("");
      pushToast?.("Password updated", "Done ✅");
    } catch (e) {
      console.error(e);
      pushToast?.("Password failed", e?.message || "Could not change password");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    const ok = confirm("This will permanently delete your account. Are you sure?");
    if (!ok) return;

    try {
      setBusy(true);

      // This requires the Edge Function below (delete-account).
      const { data, error } = await supabase.functions.invoke("delete-account", {
        body: { confirm: true },
      });

      if (error) throw error;

      pushToast?.("Account deleted", "Signing out...");
      await supabase.auth.signOut();
    } catch (e) {
      console.error(e);
      pushToast?.("Delete failed", e?.message || "Edge Function returned non-2xx");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid2">
      <div className="card">
        <h2 className="h2">Profile</h2>
        <p className="sub">This is what people see inside the app.</p>

        <div className="grid" style={{ marginTop: 14 }}>
          <div>
            <div className="label">Email</div>
            <input className="input" value={email} disabled />
          </div>

          <div>
            <div className="label">Display name</div>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nate" />
          </div>

          <div>
            <div className="label">Company side</div>
            <select className="select" value={orgLocal} onChange={(e) => setOrgLocal(e.target.value)}>
              <option value="borsalino">Borsalino</option>
              <option value="atica">Atica</option>
            </select>
            <p className="sub" style={{ marginTop: 8 }}>
              This will control which DayOff/BreakLock rules apply.
            </p>
          </div>

          <div className="actions">
            <button className="btn btnPrimary" disabled={!canSaveName || busy} onClick={saveProfile}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gap: 14 }}>
        <div className="card">
          <h2 className="h2">Security</h2>
          <p className="sub">Change your password.</p>

          <div className="grid" style={{ marginTop: 14 }}>
            <div>
              <div className="label">New password</div>
              <input className="input" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} />
              <p className="sub" style={{ marginTop: 6 }}>Minimum 8 characters.</p>
            </div>

            <div>
              <div className="label">Confirm new password</div>
              <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </div>

            <div className="actions">
              <button className="btn btnPrimary" disabled={!canSavePw || busy} onClick={changePassword}>
                {busy ? "Updating…" : "Update password"}
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="h2">Danger zone</h2>
          <p className="sub">Permanently delete your account.</p>

          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn btnDanger" disabled={busy} onClick={deleteAccount}>
              {busy ? "Working…" : "Delete my account"}
            </button>
          </div>

          <p className="sub" style={{ marginTop: 10 }}>
            This requires a server-side Edge Function for safety.
          </p>
        </div>
      </div>
    </div>
  );
}
