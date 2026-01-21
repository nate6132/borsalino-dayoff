import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "./supabase";

import DayOffPage from "./pages/DayOffPage.jsx";
import BreakLockPage from "./pages/BreakLockPage.jsx";
import SuggestionsPage from "./pages/SuggestionsPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function cx(...c) {
  return c.filter(Boolean).join(" ");
}

function Shell({ profile, onLogout, children }) {
  const loc = useLocation();

  const nav = [
    { to: "/", label: "Day Off", icon: "🗓️" },
    { to: "/breaks", label: "Breaks", icon: "⏱️" },
    { to: "/suggestions", label: "Suggestions", icon: "💡" },
    { to: "/settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div className="brand">
            <div className="brandMark">B</div>
            <div className="brandText">
              <div className="titleRow">
                <h1 className="title">
                  {getGreeting()}, {profile?.display_name?.trim() || "there"}
                </h1>
                <span className="chip soft">
                  {profile?.org === "atica" ? "Atica" : "Borsalino"}
                </span>
                {profile?.is_admin && <span className="chip admin">Admin</span>}
              </div>
              <p className="muted">
                {profile?.org === "atica"
                  ? "Atica portal — breaks & time off"
                  : "Borsalino portal — breaks & time off"}
              </p>
            </div>
          </div>

          <button className="btn ghost" onClick={onLogout}>
            Log out
          </button>
        </div>

        <div className="nav">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={cx("navLink", loc.pathname === n.to && "active")}
            >
              <span className="navIcon">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </div>

        {children}
      </div>
    </div>
  );
}

function SetupModal({ initialName = "", initialOrg = "", onSave }) {
  const [name, setName] = useState(initialName);
  const [org, setOrg] = useState(initialOrg);
  const [busy, setBusy] = useState(false);
  const canSave = name.trim().length >= 2 && (org === "borsalino" || org === "atica");

  return (
    <div className="modalBackdrop">
      <div className="modalCard">
        <div className="modalHeader">
          <div className="modalEmoji">✨</div>
          <div>
            <h2 className="h2">Quick setup</h2>
            <p className="muted">This takes 10 seconds. You can change it later in Settings.</p>
          </div>
        </div>

        <div className="grid" style={{ marginTop: 14 }}>
          <div>
            <div className="label">Name</div>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nate"
              autoFocus
            />
          </div>

          <div>
            <div className="label">Company side</div>
            <div className="seg">
              <button
                type="button"
                className={cx("segBtn", org === "borsalino" && "on")}
                onClick={() => setOrg("borsalino")}
              >
                Borsalino
              </button>
              <button
                type="button"
                className={cx("segBtn", org === "atica" && "on")}
                onClick={() => setOrg("atica")}
              >
                Atica
              </button>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              This controls your break rules + time off rules.
            </p>
          </div>
        </div>

        <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
          <button
            className="btn primary"
            disabled={!canSave || busy}
            onClick={async () => {
              try {
                setBusy(true);
                await onSave({ display_name: name.trim(), org });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // { display_name, org, is_admin }

  const needsSetup = !!session && (!profile?.display_name || !profile?.org);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, newSession) => {
      setSession(newSession);
      if (newSession) loadProfile(newSession.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("display_name, org, is_admin")
      .eq("id", userId)
      .single();

    if (error) {
      // If profile row doesn't exist or RLS blocks it, we still keep UI alive.
      console.log("loadProfile error:", error);
      setProfile({ display_name: "", org: "", is_admin: false });
      return;
    }

    setProfile({
      display_name: data?.display_name ?? "",
      org: data?.org ?? "",
      is_admin: !!data?.is_admin,
    });
  }

  async function saveSetup({ display_name, org }) {
    const uid = session?.user?.id;
    if (!uid) return;

    const { error } = await supabase
      .from("profiles")
      .update({ display_name, org })
      .eq("id", uid);

    if (error) {
      alert(error.message);
      return;
    }

    setProfile((p) => ({ ...(p || {}), display_name, org }));
  }

  const theme = useMemo(() => ({ theme: ThemeSupa }), []);

  if (!session) {
    return (
      <div className="page">
        <div className="authWrap">
          <div className="authCard">
            <div className="authHeader">
              <div className="authMark">B</div>
              <div>
                <h2 className="h2">Welcome back</h2>
                <p className="muted">Sign in with your work email.</p>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <Auth
                supabaseClient={supabase}
                appearance={theme}
                providers={[]}
                redirectTo={window.location.origin}
                magicLink={false}
              />
            </div>

            <p className="finePrint">
              Tip: If you want password reset, go to Settings after you log in.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Shell
        profile={profile}
        onLogout={() => supabase.auth.signOut()}
      >
        {needsSetup && (
          <SetupModal
            initialName={profile?.display_name || ""}
            initialOrg={profile?.org || ""}
            onSave={saveSetup}
          />
        )}

        <Routes>
          <Route path="/" element={<DayOffPage app={{ supabase, session, profile }} />} />
          <Route path="/breaks" element={<BreakLockPage app={{ supabase, session, profile }} boardMode={false} />} />
          <Route
            path="/breaks/board"
            element={
              profile?.is_admin
                ? <BreakLockPage app={{ supabase, session, profile }} boardMode />
                : <Navigate to="/breaks" replace />
            }
          />
          <Route path="/suggestions" element={<SuggestionsPage app={{ supabase, session, profile }} />} />
          <Route path="/settings" element={<SettingsPage app={{ supabase, session, profile, setProfile }} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
