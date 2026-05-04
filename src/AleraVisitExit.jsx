import { useState, useRef, useEffect } from "react";
import { useRole } from "./AleraShell.jsx";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  ink:       "#0D1117", inkSub: "#6E7891", inkMid: "#3D4558",
  paper:     "#F7F5F1", paperDim: "#EFECE7", white: "#FFFFFF",
  sage:      "#1A6650", sageMid: "#237A5F", sageLight: "#E6F3EE", sageBorder: "rgba(26,102,80,0.2)",
  blue:      "#1854A8", blueLight: "#E8F0FB",
  amber:     "#C97A10", amberLight: "#FEF5E7",
  rose:      "#B83232", roseLight: "#FDECEA",
  purple:    "#5E3FAE", purpleLight: "#F0EBFF",
  border:    "#E8E4DE", borderMid: "#D4D0CA",
  shadow:    "0 1px 3px rgba(13,17,23,0.06), 0 4px 16px rgba(13,17,23,0.04)",
  radius: 12, radiusSm: 8, radiusLg: 16,
};

// ─── Mock Encounter Data ──────────────────────────────────────────────────────
const DEFAULT_ENCOUNTER = {
  patient: {
    id: "ALE-00847", name: "Adaeze Okafor", age: 33, sex: "Female",
    phone: "+234 803 441 7892", email: "adaeze.okafor@gmail.com",
    insurance: "NHIS", insuranceId: "NHIS-00234-21",
  },
  visitId:         "VIS-20250225-0847",
  provider:        "Dr. Chidi Okonkwo",
  diagnosis:       "Malaria (P. falciparum)",
  icdCode:         "B50.9",
  chiefComplaint:  "Fever, chills and headache for 3 days",
  soap: {
    subjective: "33-year-old female presenting with 3-day history of fever, chills, and headache. Reports sweating episodes at night. No recent travel.",
    objective:  "T: 38.2°C, PR: 96bpm, BP: 118/76, SpO₂: 97%. RDT: Positive for P. falciparum. Appears unwell but alert.",
    assessment: "Uncomplicated Malaria — P. falciparum [B50.9]",
    plan:       "Artemether/Lumefantrine 80/480mg BD × 3 days. Paracetamol 500mg TDS PRN. ORS. Review in 3 days if not improving.",
  },
  vitals: { bp: "118/76", temp: "38.2", pulse: "96", spo2: "97", weight: "63", height: "162" },
  prescriptions: [
    { name: "Artemether/Lumefantrine 80/480mg", dose: "2 tabs BD", duration: "3 days", instructions: "Take with food or full-fat milk. Complete course." },
    { name: "Paracetamol 500mg",                dose: "1 tab TDS", duration: "PRN",    instructions: "Take for fever or pain." },
    { name: "Oral Rehydration Salts",           dose: "1 sachet BD", duration: "3 days", instructions: "Mix in 200ml of water." },
  ],
  amountPaid:    6500,
  paymentMethod: "Cash",
  startTime:     Date.now() - 8.4 * 60 * 1000,
  endTime:       Date.now(),
};

const FOLLOW_UP_PRESETS = [
  { label: "3 days",  days: 3  },
  { label: "1 week",  days: 7  },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
];

const CARE_INSTRUCTIONS = {
  malaria: [
    "Complete the full course of antimalarials even if you feel better.",
    "Rest and drink plenty of fluids.",
    "Return immediately if fever worsens, you have difficulty breathing, or cannot keep medication down.",
    "Use insecticide-treated bed nets to prevent reinfection.",
  ],
  general: [
    "Take all medications as prescribed.",
    "Rest adequately and maintain good hydration.",
    "Return to the clinic if symptoms worsen or new symptoms develop.",
    "Keep this summary for your records.",
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v) { return "₦" + Math.round(v).toLocaleString("en-NG"); }

function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s}s`;
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function nowStr() {
  return new Date().toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

// ─── Atoms ────────────────────────────────────────────────────────────────────
function Tag({ color, bg, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 5, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.3px", fontFamily: "'JetBrains Mono',monospace", color, background: bg, flexShrink: 0 }}>
      {children}
    </span>
  );
}

function Btn({ children, variant = "primary", onClick, disabled, full, size = "md" }) {
  const pad = size === "sm" ? "6px 13px" : size === "lg" ? "13px 28px" : "9px 18px";
  const fz  = size === "sm" ? 12 : size === "lg" ? 14 : 13;
  const map = {
    primary: { background: T.ink,   color: "#fff",   border: "none" },
    sage:    { background: T.sage,  color: "#fff",   border: "none" },
    ghost:   { background: "transparent", color: T.inkSub, border: `1px solid ${T.border}` },
    soft:    { background: T.paperDim, color: T.inkMid, border: `1px solid ${T.border}` },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ padding: pad, borderRadius: T.radiusSm, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, transition: "all 0.14s", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, width: full ? "100%" : undefined, opacity: disabled ? 0.4 : 1, fontSize: fz, ...map[variant] }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.filter = "brightness(1.08)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
      onMouseLeave={e => { e.currentTarget.style.filter = ""; e.currentTarget.style.transform = ""; }}
    >{children}</button>
  );
}

function Divider({ my = 16 }) {
  return <div style={{ height: 1, background: T.border, margin: `${my}px 0` }} />;
}

// ─── Delivery Action Button ───────────────────────────────────────────────────
function DeliveryBtn({ icon, label, sub, onClick, sent, color = T.sage, bg = T.sageLight }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "12px 16px", borderRadius: T.radiusSm, marginBottom: 8,
      border: `1.5px solid ${sent ? color + "55" : T.border}`,
      background: sent ? bg : T.white,
      cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
      display: "flex", alignItems: "center", gap: 12,
      transition: "all 0.14s", textAlign: "left",
    }}
      onMouseEnter={e => { if (!sent) { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = bg; } }}
      onMouseLeave={e => { if (!sent) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.white; } }}
    >
      <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: sent ? color : T.inkMid }}>{sent ? "✓ Sent!" : label}</div>
        <div style={{ fontSize: 11.5, color: T.inkSub, marginTop: 1 }}>{sub}</div>
      </div>
      {sent && <Tag color={color} bg={bg}>Delivered</Tag>}
    </button>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────
function SummaryCard({ encounter }) {
  const enc  = encounter;
  const dur  = enc.endTime - enc.startTime;
  const ts   = nowStr();
  const fast = dur < 10 * 60 * 1000;

  return (
    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: T.inkMid, lineHeight: 1.9, background: T.paper, padding: "20px 22px", borderRadius: T.radiusSm, border: `1px solid ${T.border}`, whiteSpace: "pre-wrap" }}>
{`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ALERA HEALTH CLINIC
    Visit Summary & Discharge Note
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date       : ${ts}
Visit ID   : ${enc.visitId}
Provider   : ${enc.provider}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATIENT:
  Name     : ${enc.patient.name}
  ID       : ${enc.patient.id}
  Age/Sex  : ${enc.patient.age}y ${enc.patient.sex}
  Insurance: ${enc.patient.insurance} · ${enc.patient.insuranceId}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIAGNOSIS:
  ${enc.diagnosis} [${enc.icdCode}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLINICAL NOTE:
  S: ${enc.soap.subjective.slice(0, 80)}…
  O: ${enc.soap.objective.slice(0, 80)}…
  A: ${enc.soap.assessment}
  P: ${enc.soap.plan.slice(0, 80)}…
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRESCRIPTIONS:
${enc.prescriptions.map((p, i) => `  ${i + 1}. ${p.name}\n     ${p.dose} · ${p.duration}`).join("\n")}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BILLING:
  Total Paid : ${fmt(enc.amountPaid)}
  Method     : ${enc.paymentMethod}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Visit Duration : ${formatDuration(dur)} ${fast ? "✓" : "⚠"}
Powered by Alera Health EMR`}
    </div>
  );
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
function Confetti() {
  const colors = ["#1A6650", "#27856A", "#1854A8", "#5BCCA0", "#F0B84A", "#7BBFF5"];
  const pieces = Array.from({ length: 28 }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 0.8}s`,
    size: Math.random() * 8 + 5,
    rotation: Math.random() * 360,
  }));
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 0, pointerEvents: "none", zIndex: 300, overflow: "visible" }}>
      {pieces.map(p => (
        <div key={p.id} style={{
          position: "absolute", left: p.left, top: 0,
          width: p.size, height: p.size,
          background: p.color, borderRadius: p.size < 8 ? "50%" : 2,
          transform: `rotate(${p.rotation}deg)`,
          animation: `confettiFall 2.4s ease ${p.delay} both`,
        }} />
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AleraVisitExit({ encounter: encounterProp, onNewPatient, onDone }) {
  const { role, can } = useRole?.() || { role: "doctor", can: () => true };

  const encounter = { ...DEFAULT_ENCOUNTER, ...encounterProp };
  const { patient, vitals, prescriptions, soap, provider, visitId, diagnosis, icdCode, chiefComplaint } = encounter;
  const dur = encounter.endTime - encounter.startTime;

  const [followUpDays,    setFollowUpDays]    = useState(7);
  const [customDate,      setCustomDate]      = useState("");
  const [careInstructions, setCareInstructions] = useState(CARE_INSTRUCTIONS.malaria);
  const [customInstruction, setCustomInstruction] = useState("");
  const [dismissed,       setDismissed]       = useState(false);

  // Delivery states
  const [smsSent,         setSmsSent]         = useState(false);
  const [emailSent,       setEmailSent]       = useState(false);
  const [appPushed,       setAppPushed]       = useState(false);
  const [printed,        setPrinted]          = useState(false);
  const [showSummary,     setShowSummary]     = useState(false);
  const [closed,          setClosed]          = useState(false);
  const [closing,         setClosing]         = useState(false);
  const [showConfetti,    setShowConfetti]    = useState(false);

  const ts = useRef(nowStr()).current;
  const followUpDate = customDate || addDays(followUpDays);
  const fast = dur < 10 * 60 * 1000;

  // Trigger confetti on load
  useEffect(() => {
    const t = setTimeout(() => setShowConfetti(true), 400);
    const t2 = setTimeout(() => setShowConfetti(false), 3000);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, []);

  function handleSend(type) {
    if (type === "sms")   { setSmsSent(true);   }
    if (type === "email") { setEmailSent(true);  }
    if (type === "app")   { setAppPushed(true);  }
    if (type === "print") { setPrinted(true);    }
  }

  function addInstruction() {
    if (!customInstruction.trim()) return;
    setCareInstructions(ci => [...ci, customInstruction.trim()]);
    setCustomInstruction("");
  }

  function removeInstruction(i) {
    setCareInstructions(ci => ci.filter((_, idx) => idx !== i));
  }

  function handleClose() {
    setClosing(true);
    setTimeout(() => { setClosing(false); setClosed(true); }, 1400);
  }

  // ── Closed / Done ──
  if (closed) return (
    <div style={{ minHeight: "calc(100vh - 56px)", display: "flex", alignItems: "center", justifyContent: "center", background: T.paper, fontFamily: "'DM Sans',sans-serif" }}>
      <div style={{ textAlign: "center", maxWidth: 440, padding: 32, animation: "scaleIn 0.4s ease" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: T.sageLight, border: `2px solid ${T.sageBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, margin: "0 auto 20px" }}>✓</div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 26, color: T.ink, marginBottom: 8 }}>Encounter Closed</div>
        <div style={{ fontSize: 14, color: T.inkSub, lineHeight: 1.6, marginBottom: 28 }}>
          {patient.name}'s visit has been recorded and closed. {fast ? "Great work — completed under target time." : "All documents have been saved."} The next patient is ready.
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>
          {[
            { label: "Duration",    value: formatDuration(dur), ok: fast },
            { label: "Paid",        value: fmt(encounter.amountPaid), ok: true },
            { label: "Rx Items",    value: prescriptions.length, ok: true },
          ].map(s => (
            <div key={s.label} style={{ background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, padding: "14px 12px", boxShadow: T.shadow }}>
              <div style={{ fontSize: 9.5, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: s.ok ? T.sage : T.amber }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <Btn variant="sage" size="lg" onClick={onNewPatient}>Next Patient →</Btn>
          <Btn variant="ghost" onClick={onDone}>Back to Dashboard</Btn>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "calc(100vh - 56px)", background: T.paper, fontFamily: "'DM Sans',sans-serif" }}>
      {showConfetti && <Confetti />}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp    { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
        @keyframes scaleIn   { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
        @keyframes spin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes confettiFall {
          0%   { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ── Hero success banner ── */}
      <div style={{
        background: T.ink, padding: "28px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 24, animation: "fadeIn 0.4s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* Animated check */}
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(26,102,80,0.25)", border: "2px solid rgba(26,102,80,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, animation: "scaleIn 0.5s ease 0.2s both" }}>✓</div>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: "#fff", marginBottom: 4 }}>
              Visit Complete — {patient.name}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Tag color="rgba(255,255,255,0.5)" bg="rgba(255,255,255,0.07)">{visitId}</Tag>
              <Tag color="rgba(255,255,255,0.5)" bg="rgba(255,255,255,0.07)">{provider}</Tag>
              <Tag color="rgba(255,255,255,0.5)" bg="rgba(255,255,255,0.07)">{ts}</Tag>
              <Tag
                color={fast ? "#5BCCA0" : "#F0B84A"}
                bg={fast ? "rgba(26,102,80,0.2)" : "rgba(240,184,74,0.15)"}
              >⏱ {formatDuration(dur)} {fast ? "· On target" : "· Over target"}</Tag>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display: "flex", gap: 20, flexShrink: 0 }}>
          {[
            { label: "DIAGNOSIS",    value: `${diagnosis} [${icdCode}]`, color: "#7BBFF5" },
            { label: "PAID",         value: fmt(encounter.amountPaid),   color: "#5BCCA0" },
            { label: "PRESCRIPTIONS",value: `${prescriptions.length} items`, color: "rgba(255,255,255,0.7)" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono',monospace", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: s.color, fontFamily: s.label === "PAID" ? "'Syne',sans-serif" : undefined }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 28px 80px", display: "grid", gridTemplateColumns: "1fr 340px", gap: 22 }}>

        {/* ── Left column ── */}
        <div>

          {/* Diagnosis & SOAP summary */}
          <div style={{ background: T.white, borderRadius: T.radiusLg, border: `1px solid ${T.border}`, boxShadow: T.shadow, marginBottom: 20, overflow: "hidden", animation: "fadeUp 0.3s ease 0.05s both" }}>
            <div style={{ padding: "15px 22px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontSize: 18 }}>📋</span>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14.5, color: T.ink }}>Clinical Summary</div>
              </div>
              <Tag color={T.blue} bg={T.blueLight}>{icdCode}</Tag>
            </div>
            <div style={{ padding: "18px 22px" }}>
              {/* Diagnosis */}
              <div style={{ padding: "12px 16px", background: T.blueLight, borderRadius: T.radiusSm, marginBottom: 16, border: `1px solid rgba(24,84,168,0.15)` }}>
                <div style={{ fontSize: 10.5, color: T.blue, fontFamily: "'JetBrains Mono',monospace", marginBottom: 4 }}>FINAL DIAGNOSIS</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{diagnosis}</div>
              </div>

              {/* SOAP compact */}
              {[
                { key: "S", label: "Subjective", color: T.blue,   bg: T.blueLight,   text: soap.subjective   },
                { key: "O", label: "Objective",  color: T.sage,   bg: T.sageLight,   text: soap.objective    },
                { key: "A", label: "Assessment", color: T.amber,  bg: T.amberLight,  text: soap.assessment   },
                { key: "P", label: "Plan",       color: T.purple, bg: T.purpleLight, text: soap.plan         },
              ].map(s => (
                <div key={s.key} style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: s.color }}>{s.key}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10.5, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", marginBottom: 2 }}>{s.label.toUpperCase()}</div>
                    <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.55 }}>{s.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Vitals summary */}
          <div style={{ background: T.white, borderRadius: T.radiusLg, border: `1px solid ${T.border}`, boxShadow: T.shadow, marginBottom: 20, overflow: "hidden", animation: "fadeUp 0.3s ease 0.1s both" }}>
            <div style={{ padding: "15px 22px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontSize: 18 }}>🩺</span>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14.5, color: T.ink }}>Vitals at Visit</div>
            </div>
            <div style={{ padding: "16px 22px", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
              {[
                { label: "Blood Pressure", value: vitals.bp,     unit: "mmHg", ok: true  },
                { label: "Temperature",    value: vitals.temp,   unit: "°C",   ok: parseFloat(vitals.temp) < 38.5 },
                { label: "Pulse",          value: vitals.pulse,  unit: "bpm",  ok: parseInt(vitals.pulse) <= 100  },
                { label: "SpO₂",           value: vitals.spo2,   unit: "%",    ok: parseInt(vitals.spo2) >= 95    },
                { label: "Weight",         value: vitals.weight, unit: "kg",   ok: true  },
                { label: "Height",         value: vitals.height, unit: "cm",   ok: true  },
              ].map(v => (
                <div key={v.label} style={{ padding: "12px 14px", background: v.ok ? T.paper : T.amberLight, borderRadius: T.radiusSm, border: `1px solid ${v.ok ? T.border : T.amber + "44"}` }}>
                  <div style={{ fontSize: 10, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", marginBottom: 5 }}>{v.label.toUpperCase()}</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: v.ok ? T.ink : T.amber }}>
                    {v.value || "—"}
                  </div>
                  <div style={{ fontSize: 10.5, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace" }}>{v.unit}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Prescriptions */}
          <div style={{ background: T.white, borderRadius: T.radiusLg, border: `1px solid ${T.border}`, boxShadow: T.shadow, marginBottom: 20, overflow: "hidden", animation: "fadeUp 0.3s ease 0.13s both" }}>
            <div style={{ padding: "15px 22px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontSize: 18 }}>💊</span>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14.5, color: T.ink }}>Prescriptions Dispensed</div>
              </div>
              <Tag color={T.sage} bg={T.sageLight}>{prescriptions.length} items</Tag>
            </div>
            <div style={{ padding: "8px 0" }}>
              {prescriptions.map((rx, i) => (
                <div key={i} style={{ display: "flex", gap: 14, padding: "13px 22px", borderBottom: i < prescriptions.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: T.sageLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>💊</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: T.ink, marginBottom: 3 }}>{rx.name}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Tag color={T.sage} bg={T.sageLight}>{rx.dose}</Tag>
                      <Tag color={T.inkSub} bg={T.paperDim}>{rx.duration}</Tag>
                    </div>
                    <div style={{ fontSize: 12, color: T.inkSub, marginTop: 5 }}>{rx.instructions}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Follow-up */}
          <div style={{ background: T.white, borderRadius: T.radiusLg, border: `1px solid ${T.border}`, boxShadow: T.shadow, marginBottom: 20, overflow: "hidden", animation: "fadeUp 0.3s ease 0.16s both" }}>
            <div style={{ padding: "15px 22px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontSize: 18 }}>📅</span>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14.5, color: T.ink }}>Follow-up Appointment</div>
            </div>
            <div style={{ padding: "18px 22px" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {FOLLOW_UP_PRESETS.map(p => (
                  <button key={p.label} onClick={() => { setFollowUpDays(p.days); setCustomDate(""); }} style={{
                    padding: "8px 16px", borderRadius: T.radiusSm, cursor: "pointer",
                    border: `1.5px solid ${followUpDays === p.days && !customDate ? T.sage : T.border}`,
                    background: followUpDays === p.days && !customDate ? T.sageLight : T.white,
                    color: followUpDays === p.days && !customDate ? T.sage : T.inkSub,
                    fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
                    transition: "all 0.14s",
                  }}
                    onMouseEnter={e => { if (followUpDays !== p.days || customDate) e.currentTarget.style.borderColor = T.sage; }}
                    onMouseLeave={e => { if (followUpDays !== p.days || customDate) e.currentTarget.style.borderColor = T.border; }}
                  >{p.label}</button>
                ))}
                <input
                  type="date" value={customDate}
                  onChange={e => { setCustomDate(e.target.value); setFollowUpDays(0); }}
                  style={{ flex: 1, padding: "8px 12px", border: `1.5px solid ${customDate ? T.sage : T.border}`, borderRadius: T.radiusSm, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: T.ink, outline: "none", background: customDate ? T.sageLight : T.white, transition: "all 0.14s" }}
                  onFocus={e => { e.target.style.borderColor = T.sage; }}
                  onBlur={e => { if (!customDate) e.target.style.borderColor = T.border; }}
                />
              </div>

              {/* Follow-up date display */}
              <div style={{ padding: "13px 16px", background: T.sageLight, borderRadius: T.radiusSm, border: `1px solid ${T.sageBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: T.inkMid }}>Next appointment</span>
                <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: T.sage }}>{followUpDate}</span>
              </div>
            </div>
          </div>

          {/* Care instructions */}
          <div style={{ background: T.white, borderRadius: T.radiusLg, border: `1px solid ${T.border}`, boxShadow: T.shadow, overflow: "hidden", animation: "fadeUp 0.3s ease 0.19s both" }}>
            <div style={{ padding: "15px 22px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontSize: 18 }}>📌</span>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14.5, color: T.ink }}>Care Instructions</div>
                <div style={{ fontSize: 11.5, color: T.inkSub, marginTop: 2 }}>Sent to patient with discharge</div>
              </div>
            </div>
            <div style={{ padding: "18px 22px" }}>
              {careInstructions.map((inst, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10, padding: "10px 12px", background: T.paper, borderRadius: T.radiusSm, border: `1px solid ${T.border}` }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: T.sageLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    <span style={{ fontSize: 10, color: T.sage, fontWeight: 700 }}>{i + 1}</span>
                  </div>
                  <div style={{ flex: 1, fontSize: 13, color: T.inkMid, lineHeight: 1.5 }}>{inst}</div>
                  <button onClick={() => removeInstruction(i)} style={{ width: 22, height: 22, borderRadius: 5, border: "none", background: "none", cursor: "pointer", color: T.inkSub, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "color 0.12s" }}
                    onMouseEnter={e => { e.currentTarget.style.color = T.rose; }}
                    onMouseLeave={e => { e.currentTarget.style.color = T.inkSub; }}>✕</button>
                </div>
              ))}

              {/* Add custom */}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <input
                  value={customInstruction}
                  onChange={e => setCustomInstruction(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addInstruction(); }}
                  placeholder="Add a care instruction…"
                  style={{ flex: 1, padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: T.ink, outline: "none", transition: "border-color 0.14s" }}
                  onFocus={e => { e.target.style.borderColor = T.sage; e.target.style.boxShadow = `0 0 0 3px ${T.sageLight}`; }}
                  onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = "none"; }}
                />
                <Btn variant="soft" onClick={addInstruction} disabled={!customInstruction.trim()}>+ Add</Btn>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div style={{ animation: "fadeUp 0.3s ease 0.08s both" }}>
          <div style={{ position: "sticky", top: 80, display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Delivery */}
            <div style={{ background: T.white, borderRadius: T.radiusLg, border: `1px solid ${T.border}`, boxShadow: T.shadow, overflow: "hidden" }}>
              <div style={{ padding: "15px 20px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: T.ink }}>Send to Patient</div>
                <div style={{ fontSize: 11.5, color: T.inkSub, marginTop: 2 }}>Discharge summary + prescriptions</div>
              </div>
              <div style={{ padding: "14px 16px" }}>
                <DeliveryBtn icon="📱" label="Push to Alera App"  sub="Patient receives instant notification" onClick={() => handleSend("app")}   sent={appPushed} color={T.purple} bg={T.purpleLight} />
                <DeliveryBtn icon="📨" label="SMS Summary"        sub={patient.phone}                        onClick={() => handleSend("sms")}   sent={smsSent}   />
                <DeliveryBtn icon="📧" label="Email Summary"      sub={patient.email}                        onClick={() => handleSend("email")} sent={emailSent} />
                <DeliveryBtn icon="🖨" label="Print Discharge"    sub="A5 · English + Yoruba"               onClick={() => handleSend("print")} sent={printed}   color={T.blue} bg={T.blueLight} />
              </div>
            </div>

            {/* Visit receipt */}
            <div style={{ background: T.white, borderRadius: T.radiusLg, border: `1px solid ${T.border}`, boxShadow: T.shadow, overflow: "hidden" }}>
              <div style={{ padding: "15px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: T.ink }}>Visit Receipt</div>
                <button onClick={() => setShowSummary(s => !s)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.inkSub, fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.12s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = T.sage; e.currentTarget.style.color = T.sage; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.inkSub; }}
                >{showSummary ? "Hide" : "Preview"}</button>
              </div>
              <div style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 13 }}>
                  <span style={{ color: T.inkSub }}>Total paid</span>
                  <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: T.sage }}>{fmt(encounter.amountPaid)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 13 }}>
                  <span style={{ color: T.inkSub }}>Method</span>
                  <span style={{ fontWeight: 600, color: T.inkMid }}>{encounter.paymentMethod}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: T.inkSub }}>Follow-up</span>
                  <span style={{ fontWeight: 600, color: T.inkMid }}>{followUpDate}</span>
                </div>
                {showSummary && (
                  <div style={{ marginTop: 14, animation: "slideDown 0.2s ease" }}>
                    <Divider my={0} />
                    <div style={{ marginTop: 14 }}>
                      <SummaryCard encounter={encounter} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Encounter stats */}
            <div style={{ background: T.white, borderRadius: T.radiusLg, border: `1px solid ${T.border}`, boxShadow: T.shadow, padding: "16px 18px" }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13.5, color: T.ink, marginBottom: 14 }}>Encounter Stats</div>
              {[
                { label: "Duration",       value: formatDuration(dur),         color: fast ? T.sage : T.amber  },
                { label: "Target",         value: "< 10 minutes",              color: T.inkSub                 },
                { label: "Vitals taken",   value: Object.values(vitals).filter(Boolean).length + " / 6", color: T.inkMid },
                { label: "Prescriptions",  value: prescriptions.length + " drugs",  color: T.inkMid            },
                { label: "Delivered via",  value: [appPushed && "App", smsSent && "SMS", emailSent && "Email", printed && "Print"].filter(Boolean).join(" · ") || "None yet", color: T.inkMid },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
                  <span style={{ color: T.inkSub }}>{s.label}</span>
                  <span style={{ fontWeight: 600, color: s.color, fontFamily: s.label === "Duration" ? "'JetBrains Mono',monospace" : undefined }}>{s.value}</span>
                </div>
              ))}
            </div>

            {/* Close encounter CTA */}
            <div style={{ background: T.ink, borderRadius: T.radiusLg, padding: "20px 18px" }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", marginBottom: 6 }}>
                Ready to close?
              </div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.4)", marginBottom: 18, lineHeight: 1.6 }}>
                Closing this encounter saves all records, updates the patient's history, and marks the visit as complete.
              </div>

              {/* Checklist */}
              <div style={{ marginBottom: 18 }}>
                {[
                  { label: "Diagnosis confirmed",      done: true          },
                  { label: "Clinical note saved",      done: true          },
                  { label: "Prescription issued",      done: prescriptions.length > 0 },
                  { label: "Payment received",         done: encounter.amountPaid > 0  },
                  { label: "Summary sent to patient",  done: appPushed || smsSent || emailSent || printed },
                  { label: "Follow-up scheduled",      done: !!followUpDate },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, background: item.done ? T.sage : "rgba(255,255,255,0.08)", border: `1.5px solid ${item.done ? T.sage : "rgba(255,255,255,0.12)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
                      {item.done && <span style={{ fontSize: 9, color: "#fff", fontWeight: 700 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 12.5, color: item.done ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)", transition: "color 0.2s" }}>{item.label}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={handleClose}
                disabled={closing}
                style={{
                  width: "100%", padding: "13px 20px", borderRadius: T.radiusSm, border: "none",
                  background: closing ? "rgba(26,102,80,0.3)" : T.sage,
                  color: "#fff", fontSize: 14, fontWeight: 700, cursor: closing ? "default" : "pointer",
                  fontFamily: "'Syne',sans-serif", transition: "all 0.15s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                }}
                onMouseEnter={e => { if (!closing) e.currentTarget.style.background = T.sageMid; }}
                onMouseLeave={e => { if (!closing) e.currentTarget.style.background = T.sage; }}
              >
                {closing
                  ? <><span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Closing encounter…</>
                  : "✓ Close Encounter"
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
