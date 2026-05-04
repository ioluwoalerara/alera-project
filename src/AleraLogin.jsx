// =============================================================================
// AleraLogin.jsx — Real Supabase authentication
// =============================================================================
// Two-step login:
//   Step 1: Email + password (Supabase auth)
//   Step 2: Role confirmation (from JWT claims) with option to pick a
//           different role if the account has multiple (doctor + admin)
//
// onLogin(role, session) → AleraApp sets up the encounter flow
// =============================================================================

import { useState } from "react";
import { useAuth } from "./AleraAuth.jsx";
import { ROLE_META } from "./AleraRoles.js";

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @keyframes fadeUp   { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
  @keyframes pulse    { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
  @keyframes entering { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(1.03)} }
  @keyframes gridMove { from{transform:translateY(0)} to{transform:translateY(40px)} }
  @keyframes spin     { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  input:-webkit-autofill {
    -webkit-box-shadow: 0 0 0px 1000px #161b22 inset !important;
    -webkit-text-fill-color: #fff !important;
  }
`;

export default function AleraLogin({ onLogin }) {
  const { signIn, error: authContextError } = useAuth();

  const [step,         setStep]       = useState("credentials");
  const [email,        setEmail]      = useState("");
  const [password,     setPassword]   = useState("");
  const [submitting,   setSubmitting] = useState(false);
  const [localError,   setLocalError] = useState(null);
  const [session,      setSession]    = useState(null);
  const [detectedRole, setDetectedRole] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [entering,     setEntering]   = useState(false);
  const [hovered,      setHovered]    = useState(null);
  const [showPass,     setShowPass]   = useState(false);

  const error = localError || authContextError;

  // ── Step 1: credentials ────────────────────────────────────────────────────

  async function handleCredentials(e) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLocalError(null);
    setSubmitting(true);

    const { session: s, error: err } = await signIn(email.trim(), password);

    if (err || !s) {
      setSubmitting(false);
      setLocalError(err?.message ?? "Login failed — please try again.");
      return;
    }

    // Get role from JWT claims or fall back to DB lookup
    let detectedRoleKey = null;
    try {
      const payload = JSON.parse(atob(s.access_token.split(".")[1]));
      detectedRoleKey = payload.alera_role ?? null;
    } catch {}

    if (!detectedRoleKey) {
      try {
        const { getAleraClaimsFromDB } = await import("./supabase.js");
        const claims = await getAleraClaimsFromDB(s);
        detectedRoleKey = claims?.alera_role ?? null;
      } catch {}
    }

    setSubmitting(false);

    // If we have a detected role, skip the picker and go straight in
    if (detectedRoleKey) {
      setSession(s);
      onLogin(detectedRoleKey, s);
      return;
    }

    setDetectedRole(null);
    setSession(s);
    setStep("role");
  }

  // ── Step 2: role pick ──────────────────────────────────────────────────────

  function handleRoleSelect(roleKey) {
    if (entering) return;
    setSelectedRole(roleKey);
    setEntering(true);
    setTimeout(() => onLogin(roleKey, session), 650);
  }

  // ── Render: credentials ────────────────────────────────────────────────────

  if (step === "credentials") {
    return (
      <div style={BG}>
        <style>{STYLES}</style>
        <BgDecor />
        <Logo />

        <div style={{ ...CARD, animation: "fadeUp 0.5s ease 0.1s both", width: "100%", maxWidth: 400 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 20, color: "#fff", marginBottom: 6 }}>
            Sign in to Alera
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 28 }}>
            Use the staff credentials your clinic administrator created for you.
          </div>

          <form onSubmit={handleCredentials} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={LABEL}>Email address</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@clinic.ng" required autoFocus style={INPUT}
              />
            </div>

            <div>
              <label style={LABEL}>Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPass ? "text" : "password"}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••" required
                  style={{ ...INPUT, paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 14 }}>
                  {showPass ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(220,53,69,0.15)", border: "1px solid rgba(220,53,69,0.3)", color: "#ff6b7a", fontSize: 13, animation: "fadeIn 0.2s ease" }}>
                ⚠️ {error}
              </div>
            )}

            <button type="submit" disabled={submitting || !email || !password}
              style={{ padding: "13px 24px", borderRadius: 10, background: submitting ? "#27856A88" : "#27856A", color: "#fff", border: "none", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, cursor: submitting ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.18s", marginTop: 4, opacity: (!email || !password) ? 0.5 : 1 }}>
              {submitting ? <><Spinner /> Signing in…</> : "Sign in →"}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
            Forgot your password? Contact your clinic administrator.
          </div>
        </div>

        <Footer />
      </div>
    );
  }

  // ── Render: role selector ──────────────────────────────────────────────────

  const roles = Object.entries(ROLE_META);

  return (
    <div style={BG}>
      <style>{STYLES}</style>
      <BgDecor />
      <Logo />

      <div style={{ textAlign: "center", marginBottom: 36, animation: "fadeUp 0.4s ease both" }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 22, color: "#fff", marginBottom: 8 }}>
          {detectedRole ? `Welcome back, ${ROLE_META[detectedRole]?.label ?? detectedRole}` : "Choose your role"}
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
          {detectedRole ? "Confirm your role below, or select a different one if needed." : "Select the role you're working in today."}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 220px)", gap: 14, maxWidth: 700, animation: "fadeUp 0.5s ease 0.1s both" }}>
        {roles.map(([key, meta], i) => {
          const isHov = hovered === key;
          const isSel = selectedRole === key;
          const isDetected = key === detectedRole;

          return (
            <div key={key}
              onClick={() => handleRoleSelect(key)}
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: "22px 20px", borderRadius: 14, cursor: entering ? "default" : "pointer",
                border: `1.5px solid ${isSel ? meta.color : isDetected ? `${meta.color}80` : isHov ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.07)"}`,
                background: isSel ? `${meta.color}22` : isDetected ? `${meta.color}11` : isHov ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                transform: isSel ? "scale(0.98)" : isHov ? "translateY(-2px)" : "none",
                transition: "all 0.18s",
                animation: isSel ? "entering 0.65s ease forwards" : `fadeUp 0.5s ease ${0.1 + i * 0.06}s both`,
                position: "relative", overflow: "hidden",
              }}>

              {isDetected && !isSel && (
                <div style={{ position: "absolute", top: 10, right: 10, fontSize: 10, background: `${meta.color}33`, color: meta.color, border: `1px solid ${meta.color}55`, borderRadius: 20, padding: "2px 8px", fontWeight: 600 }}>
                  YOUR ROLE
                </div>
              )}

              <div style={{ width: 44, height: 44, borderRadius: 12, background: isSel || isHov ? `${meta.color}25` : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 14, border: `1px solid ${isSel || isHov ? `${meta.color}40` : "rgba(255,255,255,0.08)"}`, transition: "all 0.18s" }}>
                {meta.icon}
              </div>

              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: isSel ? meta.color : isHov ? "#fff" : "rgba(255,255,255,0.85)", marginBottom: 6, transition: "color 0.15s" }}>
                {meta.label}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.55 }}>
                {meta.desc}
              </div>

              {isSel && (
                <div style={{ position: "absolute", top: 14, right: 14, width: 8, height: 8, borderRadius: "50%", background: meta.color, animation: "pulse 0.6s ease infinite" }} />
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 28, animation: "fadeUp 0.5s ease 0.5s both" }}>
        <button onClick={() => { setStep("credentials"); setLocalError(null); }}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
          ← Sign in with a different account
        </button>
      </div>

      <Footer />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BgDecor() {
  return (
    <>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "40px 40px", animation: "gridMove 8s linear infinite" }} />
      <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: 600, height: 300, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(26,102,80,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
    </>
  );
}

function Logo() {
  return (
    <div style={{ marginBottom: 48, textAlign: "center", animation: "fadeUp 0.5s ease" }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 36, color: "#fff", letterSpacing: -1, marginBottom: 8 }}>
        al<span style={{ color: "#27856A" }}>era</span>
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "1px" }}>
        HEALTH EMR · NIGERIA
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div style={{ marginTop: 48, fontSize: 11.5, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono',monospace", animation: "fadeUp 0.5s ease 0.6s both" }}>
      Powered by Alera Health · Built for Nigerian clinics
    </div>
  );
}

function Spinner() {
  return <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite" }} />;
}

const BG = { minHeight: "100vh", background: "#0D1117", fontFamily: "'DM Sans',sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", position: "relative", overflow: "hidden" };
const CARD = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: "32px 28px" };
const LABEL = { display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 6, letterSpacing: "0.4px", textTransform: "uppercase" };
const INPUT = { width: "100%", padding: "12px 14px", background: "#161b22", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 9, color: "#fff", fontSize: 14, fontFamily: "'DM Sans',sans-serif", outline: "none", transition: "border-color 0.18s" };
