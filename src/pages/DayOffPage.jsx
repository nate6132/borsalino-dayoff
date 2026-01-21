import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { supabase } from "./supabase";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";

import BreakLockPage from "./pages/BreakLockPage.jsx";
import SuggestionsPage from "./pages/SuggestionsPage.jsx";
import DayOffPage from "./pages/DayOffPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import { enablePush, sendTestPush } from "./push";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function useToasts() {
  const [toasts, setToasts] = useState([]);
  function pushToast(title, msg) {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [{ id, title, msg }, ...t].slice(0, 3));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }
  return { toasts, pushToast };
}

function NavItem({ to, label, right }) {
  const loc = useLocation();
  const active = loc.pathname === to;
  return (
    <Link className={`navItem ${active ? "navItemActive" : ""}`} to={to}>
      <span>{label}</span>
      {right ? <span className="pill">{right}</span> : null}
    </Link>
  );
}

export default function App() {
  const { toasts, pushToast } = useToasts();

  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // { display_name, is_admin, annual_allowance, org }

  const isAdmin = !!profile?.is_admin;
  const org = profile?.org || "borsalino"; // default

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) loadProfile(newSession.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line
  }, []);

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("display_name,is_admin,annual_allowance,org")
      .eq("id", userId)
      .single();

    if (error) {
      console.log("PROFILE LOAD ERROR:", error);
      // fail softly
      setProfile({ display_name: "", is_admin: false, annual_allowance: 14, org: "borsalino" });
      return;
    }

    setProfile({
      display_name: data?.display_name || "",
      is_admin: !!data?.is_admin,
      annual_allowance: data?.annual_allowance ?? 14,
      org: data?.org || "borsalino",
    });
  }

  async function updateProfile(patch) {
    if (!session) return;
    const { error } = await supabase.from("profiles").update(patch).eq("id", session.user.id);
    if (error) throw error;
    setProfile((p) => ({ ...(p || {}), ...patch }));
  }

  async function onEnablePush() {
    try {
      await enablePush();
      pushToast("Notifications", "Enabled ✅");
    } catch (e) {
      console.error(e);
      pushToast("Notifications failed", e?.message || "Could not enable notifications");
    }
  }

  async function onSendTestPush() {
    try {
      const res = await sendTestPush();
      pushToast("Push sent", `Sent: ${res?.sent ?? "?"}`);
    } catch (e) {
      console.error(e);
      pushToast("Push failed", e?.message || "Edge Function returned non-2xx");
    }
  }

  // ---------- AUTH SCREEN ----------
  if (!session) {
    return (
      <div className="main">
        <div className="container">
          <div className="grid" style={{ maxWidth: 520, margin: "80px auto 0" }}>
            <div className="card">
              <div className="kpiRow" style={{ alignItems: "center" }}>
                <div>
                  <h1 className="h1" style={{ marginBottom: 6 }}>Welcome back</h1>
                  <p className="sub">
                    Sign in with your work email to access DayOff + BreakLock.
                  </p>
                </div>
                <span className="pill" style={{ marginLeft: "auto" }}>Borsalino • Atica</span>
              </div>

              <div style={{ marginTop: 14 }}>
                <Auth
                  supabaseClient={supabase}
                  appearance={{ theme: ThemeSupa }}
                  providers={[]}
                  redirectTo={window.location.origin}
                  magicLink={false}
                />
              </div>

              <div style={{ marginTop: 14, color: "rgba(22,26,34,0.55)", fontSize: 12 }}>
                Tip: Use Chrome on desktop for best push notification support.
              </div>
            </div>
          </div>
        </div>

        <div className="toastWrap">
          {toasts.map((t) => (
            <div className="toast" key={t.id}>
              <div className="toastTitle">{t.title}</div>
              <div className="toastMsg">{t.msg}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const name = (profile?.display_name || "").trim() || "there";
  const orgLabel = org === "atica" ? "Atica" : "Borsalino";

  return (
    <BrowserRouter>
      <div className="appShell">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="brand">
            <img className="brandLogo" src="/logo.png" alt="Logo" />
            <div style={{ minWidth: 0 }}>
              <h3 className="brandTitle">Internal Portal</h3>
              <p className="brandSub">{orgLabel} • {isAdmin ? "Admin" : "Employee"}</p>
            </div>
          </div>

          <div className="hr" />

          <div className="nav">
            <NavItem to="/" label="Dashboard" />
            <NavItem to="/dayoff" label="Day Off" />
            <NavItem to="/breaklock" label="BreakLock" />
            {isAdmin && <NavItem to="/breaklock/board" label="TV Board" right="Admin" />}
            <NavItem to="/suggestions" label="Suggestions" />
            <NavItem to="/settings" label="Settings" />
          </div>

          <div className="hr" />

          <div className="grid" style={{ gap: 10 }}>
            <button className="btn" onClick={onEnablePush}>Enable notifications</button>
            <button className="btn" onClick={onSendTestPush}>Send test push</button>
            <button className="btn" onClick={() => supabase.auth.signOut()}>Log out</button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="main">
          <div className="container">
            <div className="header">
              <div>
                <h1 className="h1">{greeting()}, {name}</h1>
                <p className="sub">
                  Everything you need — clean, fast, and simple.
                </p>
              </div>

              <div className="actions">
                <span className="pill">{orgLabel}</span>
                <span className="pill">{isAdmin ? "Admin access" : "Employee access"}</span>
              </div>
            </div>

            <Routes>
              <Route
                path="/"
                element={
                  <div className="grid2">
                    <div className="card">
                      <h2 className="h2">Quick actions</h2>
                      <p className="sub">Start with what you came here to do.</p>
                      <div className="kpiRow" style={{ marginTop: 12 }}>
                        <Link className="btn btnPrimary" to="/dayoff" style={{ textDecoration: "none" }}>
                          Request time off
                        </Link>
                        <Link className="btn" to="/breaklock" style={{ textDecoration: "none" }}>
                          Open BreakLock
                        </Link>
                        <Link className="btn" to="/settings" style={{ textDecoration: "none" }}>
                          Update profile
                        </Link>
                      </div>
                    </div>

                    <div className="card">
                      <h2 className="h2">Your org</h2>
                      <p className="sub">
                        You’re currently on <b>{orgLabel}</b>. This controls which rules you see.
                      </p>
                      <p className="sub" style={{ marginTop: 10 }}>
                        Change it any time in <b>Settings</b>.
                      </p>
                    </div>
                  </div>
                }
              />

              <Route
                path="/dayoff"
                element={<DayOffPage app={{ supabase, session, profile, isAdmin, org, pushToast }} />}
              />

              <Route
                path="/breaklock"
                element={<BreakLockPage app={{ supabase, session, profile, isAdmin, org, pushToast }} boardMode={false} />}
              />

              <Route
                path="/breaklock/board"
                element={
                  isAdmin
                    ? <BreakLockPage app={{ supabase, session, profile, isAdmin, org, pushToast }} boardMode />
                    : <Navigate to="/breaklock" replace />
                }
              />

              <Route
                path="/suggestions"
                element={<SuggestionsPage app={{ supabase, session, isAdmin, org, pushToast }} />}
              />

              <Route
                path="/settings"
                element={<SettingsPage app={{ supabase, session, profile, updateProfile, org, pushToast }} />}
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>

          <div className="toastWrap">
            {toasts.map((t) => (
              <div className="toast" key={t.id}>
                <div className="toastTitle">{t.title}</div>
                <div className="toastMsg">{t.msg}</div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}
