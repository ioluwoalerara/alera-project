import { useState } from "react";
import { registerPatientAccount } from "./supabase.js";
import { supabase } from "./supabase.js";

const T = {
  ink: "#0D1117", inkSub: "#6E7891", inkMid: "#3D4558",
  paper: "#F7F5F1", paperDim: "#EFECE7", white: "#FFFFFF",
  sage: "#1A6650", sageLight: "#E6F3EE", sageBorder: "rgba(26,102,80,0.2)",
  border: "#E8E4DE", rose: "#B83232", roseLight: "#FDECEA",
  radius: 16, radiusSm: 10,
};

export default function AleraPatientAuth({ onSuccess }) {
  const [mode, setMode] = useState("choose"); // choose | login | register
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [regForm, setRegForm] = useState({
    firstName: "", lastName: "", email: "", password: "", confirmPassword: "",
    dob: "", phone: "", sex: "", address: "",
  });

  async function handleLogin() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signInWithPassword({
      email: loginForm.email,
      password: loginForm.password,
    });
    if (err) { setError(err.message); setLoading(false); return; }
    onSuccess(data.session);
    setLoading(false);
  }

  async function handleRegister() {
    if (regForm.password !== regForm.confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (regForm.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await registerPatientAccount(regForm);
    if (err) { setError(err.message); setLoading(false); return; }
    // Auto sign in after registration
    const { data: session } = await supabase.auth.signInWithPassword({
      email: regForm.email,
      password: regForm.password,
    });
    if (session?.session) onSuccess(session.session);
    setLoading(false);
  }

  const inputStyle = {
    width: "100%", padding: "14px 16px", border: `1px solid ${T.border}`,
    borderRadius: T.radiusSm, fontSize: 15, outline: "none",
    fontFamily: "'DM Sans',sans-serif", boxSizing: "border-box",
    transition: "border-color 0.15s", background: T.white,
  };

  const labelStyle = {
    fontSize: 12, fontWeight: 700, color: T.inkSub,
    textTransform: "uppercase", letterSpacing: 0.5,
    display: "block", marginBottom: 6,
  };

  return (
    <div style={{
      minHeight: "100vh", background: T.paper,
      display: "flex", flexDirection: "column",
      fontFamily: "'DM Sans',sans-serif", color: T.ink,
      maxWidth: 480, margin: "0 auto",
    }}>

      {/* Header */}
      <div style={{ padding: "32px 24px 24px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 32, color: T.ink, marginBottom: 4 }}>
          al<span style={{ color: T.sage }}>era</span>
        </div>
        <div style={{ fontSize: 14, color: T.inkSub }}>Your health, connected</div>
      </div>

      {/* Choose mode */}
      {mode === "choose" && (
        <div style={{ padding: "0 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <button onClick={() => setMode("register")} style={{
            padding: "18px", background: T.sage, color: "#fff", border: "none",
            borderRadius: T.radius, fontSize: 16, fontWeight: 700, cursor: "pointer",
            fontFamily: "'Syne',sans-serif", boxShadow: "0 4px 16px rgba(26,102,80,0.3)",
          }}>
            Create Account
          </button>
          <button onClick={() => setMode("login")} style={{
            padding: "18px", background: T.white, color: T.ink,
            border: `1.5px solid ${T.border}`, borderRadius: T.radius,
            fontSize: 16, fontWeight: 700, cursor: "pointer",
            fontFamily: "'Syne',sans-serif",
          }}>
            Sign In
          </button>
          <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: T.inkSub, lineHeight: 1.6 }}>
            Are you a clinic staff member?{" "}
            <button onClick={() => onSuccess(null, "staff")} style={{
              background: "none", border: "none", color: T.sage,
              fontWeight: 700, cursor: "pointer", fontSize: 13,
            }}>Sign in here →</button>
          </div>
        </div>
      )}

      {/* Login */}
      {mode === "login" && (
        <div style={{ padding: "0 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <button onClick={() => setMode("choose")} style={{ background: "none", border: "none", color: T.inkSub, cursor: "pointer", fontSize: 13, textAlign: "left", padding: 0, marginBottom: 8 }}>← Back</button>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: T.ink }}>Welcome back</div>

          {error && (
            <div style={{ padding: "12px 14px", background: T.roseLight, border: `1px solid rgba(184,50,50,0.2)`, borderRadius: T.radiusSm, fontSize: 13, color: T.rose }}>
              {error}
            </div>
          )}

          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={loginForm.email} onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
              placeholder="your@email.com" style={inputStyle}
              onFocus={e => e.target.style.borderColor = T.sage} onBlur={e => e.target.style.borderColor = T.border} />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input type="password" value={loginForm.password} onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Your password" style={inputStyle}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              onFocus={e => e.target.style.borderColor = T.sage} onBlur={e => e.target.style.borderColor = T.border} />
          </div>
          <button onClick={handleLogin} disabled={loading} style={{
            padding: "16px", background: T.sage, color: "#fff", border: "none",
            borderRadius: T.radius, fontSize: 15, fontWeight: 700, cursor: loading ? "default" : "pointer",
            fontFamily: "'Syne',sans-serif", opacity: loading ? 0.7 : 1,
          }}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
          <div style={{ textAlign: "center", fontSize: 13, color: T.inkSub }}>
            Don't have an account?{" "}
            <button onClick={() => { setMode("register"); setError(null); }} style={{ background: "none", border: "none", color: T.sage, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
              Create one →
            </button>
          </div>
        </div>
      )}

      {/* Register — Step 1 */}
      {mode === "register" && step === 1 && (
        <div style={{ padding: "0 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <button onClick={() => setMode("choose")} style={{ background: "none", border: "none", color: T.inkSub, cursor: "pointer", fontSize: 13, textAlign: "left", padding: 0 }}>← Back</button>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: T.ink, marginBottom: 4 }}>Create your account</div>
            <div style={{ fontSize: 13, color: T.inkSub }}>Step 1 of 2 — Basic information</div>
          </div>

          {error && (
            <div style={{ padding: "12px 14px", background: T.roseLight, border: `1px solid rgba(184,50,50,0.2)`, borderRadius: T.radiusSm, fontSize: 13, color: T.rose }}>{error}</div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>First Name *</label>
              <input value={regForm.firstName} onChange={e => setRegForm(f => ({ ...f, firstName: e.target.value }))}
                placeholder="Adaeze" style={inputStyle}
                onFocus={e => e.target.style.borderColor = T.sage} onBlur={e => e.target.style.borderColor = T.border} />
            </div>
            <div>
              <label style={labelStyle}>Last Name *</label>
              <input value={regForm.lastName} onChange={e => setRegForm(f => ({ ...f, lastName: e.target.value }))}
                placeholder="Okafor" style={inputStyle}
                onFocus={e => e.target.style.borderColor = T.sage} onBlur={e => e.target.style.borderColor = T.border} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Email Address *</label>
            <input type="email" value={regForm.email} onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))}
              placeholder="adaeze@email.com" style={inputStyle}
              onFocus={e => e.target.style.borderColor = T.sage} onBlur={e => e.target.style.borderColor = T.border} />
          </div>

          <div>
            <label style={labelStyle}>Phone Number *</label>
            <input value={regForm.phone} onChange={e => setRegForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+234 803 000 0000" style={inputStyle}
              onFocus={e => e.target.style.borderColor = T.sage} onBlur={e => e.target.style.borderColor = T.border} />
          </div>

          <div>
            <label style={labelStyle}>Date of Birth</label>
            <input type="date" value={regForm.dob} onChange={e => setRegForm(f => ({ ...f, dob: e.target.value }))} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Sex</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["Male", "Female", "Other"].map(s => (
                <button key={s} onClick={() => setRegForm(f => ({ ...f, sex: s.toLowerCase() }))} style={{
                  flex: 1, padding: "12px", borderRadius: T.radiusSm,
                  border: `1.5px solid ${regForm.sex === s.toLowerCase() ? T.sage : T.border}`,
                  background: regForm.sex === s.toLowerCase() ? T.sageLight : T.white,
                  color: regForm.sex === s.toLowerCase() ? T.sage : T.inkSub,
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>{s}</button>
              ))}
            </div>
          </div>

          <button
            onClick={() => {
              if (!regForm.firstName || !regForm.lastName || !regForm.email || !regForm.phone) {
                setError("Please fill in all required fields");
                return;
              }
              setError(null);
              setStep(2);
            }}
            style={{
              padding: "16px", background: T.sage, color: "#fff", border: "none",
              borderRadius: T.radius, fontSize: 15, fontWeight: 700, cursor: "pointer",
              fontFamily: "'Syne',sans-serif", marginTop: 4,
            }}>
            Continue →
          </button>
        </div>
      )}

      {/* Register — Step 2 */}
      {mode === "register" && step === 2 && (
        <div style={{ padding: "0 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: T.inkSub, cursor: "pointer", fontSize: 13, textAlign: "left", padding: 0 }}>← Back</button>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: T.ink, marginBottom: 4 }}>Almost done</div>
            <div style={{ fontSize: 13, color: T.inkSub }}>Step 2 of 2 — Address & password</div>
          </div>

          {error && (
            <div style={{ padding: "12px 14px", background: T.roseLight, border: `1px solid rgba(184,50,50,0.2)`, borderRadius: T.radiusSm, fontSize: 13, color: T.rose }}>{error}</div>
          )}

          <div>
            <label style={labelStyle}>Home Address</label>
            <input value={regForm.address} onChange={e => setRegForm(f => ({ ...f, address: e.target.value }))}
              placeholder="123 Lagos Street, Ikeja, Lagos" style={inputStyle}
              onFocus={e => e.target.style.borderColor = T.sage} onBlur={e => e.target.style.borderColor = T.border} />
          </div>

          <div>
            <label style={labelStyle}>Password *</label>
            <input type="password" value={regForm.password} onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))}
              placeholder="At least 8 characters" style={inputStyle}
              onFocus={e => e.target.style.borderColor = T.sage} onBlur={e => e.target.style.borderColor = T.border} />
          </div>

          <div>
            <label style={labelStyle}>Confirm Password *</label>
            <input type="password" value={regForm.confirmPassword} onChange={e => setRegForm(f => ({ ...f, confirmPassword: e.target.value }))}
              placeholder="Repeat your password" style={inputStyle}
              onFocus={e => e.target.style.borderColor = T.sage} onBlur={e => e.target.style.borderColor = T.border} />
          </div>

          <div style={{ fontSize: 11, color: T.inkSub, lineHeight: 1.6 }}>
            By creating an account you agree to Alera's privacy policy. Your health data is encrypted and never shared without your consent.
          </div>

          <button onClick={handleRegister} disabled={loading} style={{
            padding: "16px", background: T.sage, color: "#fff", border: "none",
            borderRadius: T.radius, fontSize: 15, fontWeight: 700, cursor: loading ? "default" : "pointer",
            fontFamily: "'Syne',sans-serif", opacity: loading ? 0.7 : 1,
          }}>
            {loading ? "Creating account…" : "Create Account ✓"}
          </button>
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}
