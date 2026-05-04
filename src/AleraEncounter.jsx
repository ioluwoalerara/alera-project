import { useState, useEffect, useRef } from "react";
import { useRole } from "./AleraShell.jsx";
import { useAuth } from "./AleraAuth.jsx";
import { supabase, getWaitingQueue } from "./supabase.js";
import AleraPatientLookup from "./AleraPatientLookup.jsx";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  ink:         "#0D1117", inkSub: "#6E7891", inkMid: "#3D4558",
  paper:       "#F7F5F1", paperDim: "#EFECE7", white: "#FFFFFF",
  sage:        "#1A6650", sageMid: "#237A5F", sageLight: "#E6F3EE", sageBorder: "rgba(26,102,80,0.2)",
  blue:        "#1854A8", blueLight: "#E8F0FB",
  amber:       "#C97A10", amberLight: "#FEF5E7", amberBorder: "rgba(201,122,16,0.25)",
  rose:        "#B83232", roseLight: "#FDECEA",  roseBorder: "rgba(184,50,50,0.25)",
  border:      "#E8E4DE", borderMid: "#D4D0CA",
  shadow:      "0 1px 3px rgba(13,17,23,0.06), 0 4px 16px rgba(13,17,23,0.04)",
  shadowMd:    "0 2px 8px rgba(13,17,23,0.08), 0 8px 24px rgba(13,17,23,0.06)",
  radius:      12, radiusSm: 8, radiusLg: 16,
};

// ─── Mock Data ────────────────────────────────────────────────────────────────
const DEFAULT_PATIENT = {
  id:          "ALE-00847",
  name:        "Adaeze Okafor",
  age:         33,
  sex:         "Female",
  phone:       "+234 803 441 7892",
  insurance:   "NHIS",
  insuranceId: "NHIS-00234-21",
  visitReason: "Fever, chills, headache for 3 days",
  allergies:   ["Penicillin"],
  lastVisit:   "14 Jan 2025",
  lastDiag:    "Malaria",
  blood:       "O+",
  visits:      8,
  checkedInAt: null,
};

const VITALS_CONFIG = [
  {
    key:     "bp",
    label:   "Blood Pressure",
    unit:    "mmHg",
    icon:    "❤️",
    placeholder: "120/80",
    normal:  "90/60 – 120/80",
    validate: v => {
      if (!v) return null;
      const parts = v.split("/").map(Number);
      if (parts.length !== 2 || parts.some(isNaN)) return "amber";
      const [sys, dia] = parts;
      if (sys >= 140 || dia >= 90) return "rose";
      if (sys < 90 || dia < 60)   return "rose";
      if (sys > 120 || dia > 80)  return "amber";
      return "ok";
    },
  },
  {
    key:     "temp",
    label:   "Temperature",
    unit:    "°C",
    icon:    "🌡️",
    placeholder: "36.5",
    normal:  "36.1 – 37.2°C",
    validate: v => {
      const n = parseFloat(v);
      if (!v || isNaN(n)) return null;
      if (n >= 38.5 || n < 35)   return "rose";
      if (n >= 37.5)              return "amber";
      return "ok";
    },
  },
  {
    key:     "pulse",
    label:   "Pulse Rate",
    unit:    "bpm",
    icon:    "💓",
    placeholder: "72",
    normal:  "60 – 100 bpm",
    validate: v => {
      const n = parseInt(v);
      if (!v || isNaN(n)) return null;
      if (n > 120 || n < 50) return "rose";
      if (n > 100 || n < 60) return "amber";
      return "ok";
    },
  },
  {
    key:     "spo2",
    label:   "SpO₂",
    unit:    "%",
    icon:    "🫁",
    placeholder: "98",
    normal:  "95 – 100%",
    validate: v => {
      const n = parseInt(v);
      if (!v || isNaN(n)) return null;
      if (n < 92) return "rose";
      if (n < 95) return "amber";
      return "ok";
    },
  },
  {
    key:     "weight",
    label:   "Weight",
    unit:    "kg",
    icon:    "⚖️",
    placeholder: "65",
    normal:  "BMI 18.5 – 25",
    validate: v => {
      const n = parseFloat(v);
      if (!v || isNaN(n)) return null;
      return "ok";
    },
  },
  {
    key:     "height",
    label:   "Height",
    unit:    "cm",
    icon:    "📏",
    placeholder: "165",
    normal:  "",
    validate: v => {
      const n = parseFloat(v);
      if (!v || isNaN(n)) return null;
      return "ok";
    },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, "0"); }

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${pad(m)}:${pad(s)}`;
}

function calcBMI(weight, height) {
  const w = parseFloat(weight), h = parseFloat(height) / 100;
  if (!w || !h || isNaN(w) || isNaN(h)) return null;
  const bmi = w / (h * h);
  return bmi.toFixed(1);
}

function bmiCategory(bmi) {
  const n = parseFloat(bmi);
  if (!n) return null;
  if (n < 18.5) return { label: "Underweight", color: T.amber };
  if (n < 25)   return { label: "Normal",      color: T.sage  };
  if (n < 30)   return { label: "Overweight",  color: T.amber };
  return              { label: "Obese",        color: T.rose  };
}

// ─── Atoms ────────────────────────────────────────────────────────────────────
function Tag({ color, bg, children, style: s }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 5, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.3px", fontFamily: "'JetBrains Mono',monospace", color, background: bg, flexShrink: 0, ...s }}>
      {children}
    </span>
  );
}

function SectionCard({ title, subtitle, icon, children, style: s, right }) {
  return (
    <div style={{ background: T.white, borderRadius: T.radiusLg, border: `1px solid ${T.border}`, boxShadow: T.shadow, marginBottom: 20, overflow: "hidden", ...s }}>
      <div style={{ padding: "16px 22px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14.5, color: T.ink }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11.5, color: T.inkSub, marginTop: 2 }}>{subtitle}</div>}
          </div>
        </div>
        {right}
      </div>
      <div style={{ padding: "18px 22px" }}>{children}</div>
    </div>
  );
}

function Btn({ children, variant = "primary", onClick, disabled, full, size = "md", style: s }) {
  const pad  = size === "sm" ? "6px 13px" : size === "lg" ? "13px 28px" : "9px 18px";
  const fz   = size === "sm" ? 12 : size === "lg" ? 14 : 13;
  const map  = {
    primary: { background: T.ink,       color: "#fff",    border: "none" },
    sage:    { background: T.sage,      color: "#fff",    border: "none" },
    ghost:   { background: "transparent", color: T.inkSub, border: `1px solid ${T.border}` },
    soft:    { background: T.paperDim,  color: T.inkMid,  border: `1px solid ${T.border}` },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ padding: pad, borderRadius: T.radiusSm, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, transition: "all 0.14s", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, width: full ? "100%" : undefined, opacity: disabled ? 0.4 : 1, fontSize: fz, ...map[variant], ...s }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.filter = "brightness(1.08)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
      onMouseLeave={e => { e.currentTarget.style.filter = ""; e.currentTarget.style.transform = ""; }}
    >{children}</button>
  );
}

// ─── Encounter Timer ──────────────────────────────────────────────────────────
function EncounterTimer({ startTime }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  const status = elapsed < 480 ? "ok" : elapsed < 720 ? "amber" : "rose";
  const statusColor  = status === "ok" ? T.sage  : status === "amber" ? T.amber : T.rose;
  const statusBg     = status === "ok" ? T.sageLight : status === "amber" ? T.amberLight : T.roseLight;
  const statusLabel  = status === "ok" ? "On track" : status === "amber" ? "Running long" : "Over target";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      {/* Clock face */}
      <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
        <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="36" cy="36" r="30" fill="none" stroke={T.border} strokeWidth="4" />
          <circle cx="36" cy="36" r="30" fill="none"
            stroke={statusColor}
            strokeWidth="4"
            strokeDasharray={`${2 * Math.PI * 30}`}
            strokeDashoffset={`${2 * Math.PI * 30 * (1 - Math.min(elapsed / 720, 1))}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 600, color: statusColor, letterSpacing: -0.5 }}>
            {formatElapsed(elapsed)}
          </span>
        </div>
      </div>
      <div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: T.ink }}>
          Encounter Timer
        </div>
        <div style={{ marginTop: 5 }}>
          <Tag color={statusColor} bg={statusBg}>{statusLabel}</Tag>
        </div>
        <div style={{ fontSize: 11.5, color: T.inkSub, marginTop: 5 }}>
          Target: under 10 minutes
        </div>
      </div>
    </div>
  );
}

// ─── Vital Input ──────────────────────────────────────────────────────────────
function VitalInput({ config, value, onChange, readOnly, voicing, onVoice }) {
  const [focused, setFocused] = useState(false);
  const status = config.validate(value);

  const borderColor = focused
    ? T.sage
    : status === "rose"  ? T.rose
    : status === "amber" ? T.amber
    : status === "ok"    ? T.sage
    : T.border;

  const bgColor = status === "rose"  ? T.roseLight
    : status === "amber" ? T.amberLight
    : status === "ok"    ? T.sageLight
    : T.white;

  const statusIcon = status === "rose" ? "🔴" : status === "amber" ? "🟡" : status === "ok" ? "🟢" : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Label row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 15 }}>{config.icon}</span>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: T.inkSub, fontWeight: 600, letterSpacing: "0.3px" }}>
            {config.label.toUpperCase()}
          </span>
        </div>
        {statusIcon && <span style={{ fontSize: 12 }}>{statusIcon}</span>}
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 6 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            value={value}
            onChange={e => onChange(config.key, e.target.value)}
            placeholder={config.placeholder}
            readOnly={readOnly}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
              width: "100%", padding: "10px 36px 10px 12px",
              border: `1.5px solid ${borderColor}`,
              borderRadius: T.radiusSm,
              fontSize: 15, fontFamily: "'JetBrains Mono',monospace",
              fontWeight: 600, color: T.ink,
              background: readOnly ? T.paperDim : bgColor,
              outline: "none", transition: "all 0.15s",
              boxSizing: "border-box",
              boxShadow: focused ? `0 0 0 3px ${T.sageLight}` : "none",
            }}
          />
          <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10.5, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", pointerEvents: "none" }}>
            {config.unit}
          </span>
        </div>

        {/* Voice button */}
        {!readOnly && (
          <button onClick={() => onVoice(config.key)} style={{
            width: 38, height: 38, borderRadius: T.radiusSm, flexShrink: 0,
            border: `1.5px solid ${voicing ? T.amber : T.border}`,
            background: voicing ? T.amberLight : T.white,
            color: voicing ? T.amber : T.inkSub,
            cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s", animation: voicing ? "voicePulse 1s ease infinite" : "none",
          }}>🎙</button>
        )}
      </div>

      {/* Normal range */}
      {config.normal && (
        <div style={{ fontSize: 10.5, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace" }}>
          Normal: {config.normal}
        </div>
      )}

      {/* Status message */}
      {status === "rose" && (
        <div style={{ fontSize: 11, color: T.rose, fontWeight: 600 }}>⚠ Critical value — flag for doctor</div>
      )}
      {status === "amber" && (
        <div style={{ fontSize: 11, color: T.amber, fontWeight: 600 }}>Slightly outside normal range</div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AleraEncounter({ patient: patientProp, onComplete }) {
  const hasPatient = !!(patientProp?._db_id);
  if (!hasPatient) return <AleraPatientLookup screenName="Encounter" screenIcon="🩺" onSelect={p => onComplete?.({ _lookup: true, patient: p })} />;
  const { role, can } = useRole?.() || { role: "nurse", can: () => true };

  const canAssignDoctor = can("canStartEncounter") && (role === "nurse" || role === "receptionist" || role === "admin");
  const canTakeVitals   = can("canTakeVitals");
  const canCheckIn      = can("canStartEncounter");
  const isDoctor        = role === "doctor";

  const { orgId, staffId } = useAuth();
  const patient = { ...DEFAULT_PATIENT, ...patientProp, checkedInAt: Date.now() };
  const checkInTime = useRef(new Date().toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })).current;
  const startTime   = useRef(Date.now()).current;
  const visitId     = useRef(`VIS-${Date.now().toString().slice(-8)}`).current;

  const [doctors,          setDoctors]          = useState([]);
  const [doctorsLoading,   setDoctorsLoading]   = useState(true);
  const [queueData,        setQueueData]        = useState({});   // { doctor_id: count }
  const [assignedDoctor,   setAssignedDoctor]   = useState(null);
  const [vitals,           setVitals]           = useState({ bp: "", temp: "", pulse: "", spo2: "", weight: "", height: "" });
  const [voicingField,     setVoicingField]     = useState(null);
  const [voiceTimers,      setVoiceTimers]      = useState({});
  const [notes,            setNotes]            = useState("");
  const [started,          setStarted]          = useState(false);
  const [starting,         setStarting]         = useState(false);
  const [chiefComplaint,   setChiefComplaint]   = useState(patient.visitReason || "");
  const [urgency,          setUrgency]          = useState("routine");

  const bmi    = calcBMI(vitals.weight, vitals.height);
  const bmiCat = bmiCategory(bmi);

  const criticalVitals = VITALS_CONFIG.filter(v => v.validate(vitals[v.key]) === "rose");
  const warningVitals  = VITALS_CONFIG.filter(v => v.validate(vitals[v.key]) === "amber");

  const vitalsComplete = ["bp", "temp", "pulse", "spo2"].every(k => vitals[k].length > 0);
  const canProceed = (isDoctor || (assignedDoctor && (vitalsComplete || !canTakeVitals)));

  // ── Load doctors from Supabase ────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("staff")
      .select("id, first_name, last_name, speciality, role")
      .eq("org_id", orgId)
      .eq("role", "doctor")
      .eq("is_active", true)
      .order("first_name")
      .then(({ data }) => {
        const docs = (data ?? []).map(d => ({
          id:        d.id,
          name:      `Dr. ${d.first_name} ${d.last_name}`,
          specialty: d.speciality ?? "General Practice",
          avatar:    `${d.first_name[0]}${d.last_name[0]}`.toUpperCase(),
          available: true,
          queue:     0,
        }));
        setDoctors(docs);
        // If logged-in user is a doctor, auto-assign self
        if (isDoctor && staffId) {
          const self = docs.find(d => d.id === staffId);
          if (self) setAssignedDoctor(self);
          else if (docs.length) setAssignedDoctor(docs[0]);
        }
        // If nurse and only one doctor in the clinic, auto-assign them
        if (!isDoctor && docs.length === 1) {
          setAssignedDoctor(docs[0]);
        }
        setDoctorsLoading(false);
      });
  }, [orgId, staffId, isDoctor]);

  // ── Live queue counts via Supabase Realtime ────────────────────────────────
  useEffect(() => {
    if (!orgId) return;

    // Initial load
    const loadQueue = async () => {
      const { data } = await getWaitingQueue(orgId);
      const counts = {};
      (data ?? []).forEach(enc => {
        if (enc.assigned_doctor_id) {
          counts[enc.assigned_doctor_id] = (counts[enc.assigned_doctor_id] ?? 0) + 1;
        }
      });
      setQueueData(counts);
      // Update doctor availability from live queue
      setDoctors(prev => prev.map(d => ({ ...d, queue: counts[d.id] ?? 0 })));
    };
    loadQueue();

    // Realtime subscription — updates queue when encounter statuses change
    const channel = supabase
      .channel("encounter-queue")
      .on("postgres_changes", {
        event:  "*",
        schema: "public",
        table:  "encounters",
        filter: `org_id=eq.${orgId}`,
      }, () => loadQueue())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [orgId]);

  function handleVitalChange(key, val) {
    setVitals(v => ({ ...v, [key]: val }));
  }

  function handleVoice(key) {
    if (voicingField === key) {
      setVoicingField(null);
      clearTimeout(voiceTimers[key]);
      return;
    }
    setVoicingField(key);
    const MOCK_VALUES = { bp: "118/76", temp: "38.2", pulse: "96", spo2: "97", weight: "63", height: "162" };
    let i = 0;
    const target = MOCK_VALUES[key] || "";
    const timer = setInterval(() => {
      i++;
      setVitals(v => ({ ...v, [key]: target.slice(0, i) }));
      if (i >= target.length) {
        clearInterval(timer);
        setVoicingField(null);
      }
    }, 80);
    setVoiceTimers(t => ({ ...t, [key]: timer }));
  }

  function handleStart() {
    setStarting(true);
    setTimeout(() => {
      setStarting(false);
      setStarted(true);
      setTimeout(() => {
        onComplete?.({
          patient,
          assignedDoctor,
          vitals,
          bmi,
          chiefComplaint,
          urgency,
          notes,
          visitId,
          startTime,
        });
      }, 900);
    }, 1200);
  }

  if (started) return (
    <div style={{ minHeight: "calc(100vh - 56px)", display: "flex", alignItems: "center", justifyContent: "center", background: T.paper }}>
      <div style={{ textAlign: "center", animation: "fadeUp 0.4s ease" }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 24, color: T.ink, marginBottom: 8 }}>
          Encounter Started
        </div>
        <div style={{ fontSize: 14, color: T.inkSub, marginBottom: 20 }}>
          Handing off to {assignedDoctor?.name || "the doctor"}…
        </div>
        <Tag color={T.sage} bg={T.sageLight} style={{ fontSize: 12 }}>Opening Clinical Notes →</Tag>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "calc(100vh - 56px)", background: T.paper, fontFamily: "'DM Sans',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp     { from{opacity:0;transform:translateY(8px)}  to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn     { from{opacity:0} to{opacity:1} }
        @keyframes spin       { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes voicePulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.12)} }
        @keyframes critBlink  { 0%,100%{opacity:1} 50%{opacity:0.6} }
      `}</style>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 28px 60px" }}>

        {/* ── Top bar: patient strip + timer ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 20, marginBottom: 24, animation: "fadeUp 0.3s ease" }}>

          {/* Patient strip */}
          <div style={{ background: T.ink, borderRadius: T.radiusLg, padding: "18px 22px", display: "flex", alignItems: "center", gap: 16 }}>
            {/* Avatar */}
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: T.sage, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
              {(patient.name || "?").split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, color: "#fff", marginBottom: 5 }}>
                {patient.name || "—"}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  patient.id,
                  `${patient.age || "—"}y · ${patient.sex || "—"}`,
                  (patient.blood || "—"),
                  `${patient.insurance} · ${patient.insuranceId}`,
                ].map((x, i) => (
                  <span key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: 5, fontFamily: "'JetBrains Mono',monospace" }}>{x}</span>
                ))}
              </div>
            </div>

            {/* Allergies */}
            {patient.allergies?.length > 0 && (
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono',monospace", marginBottom: 4 }}>ALLERGIES</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {(patient.allergies || []).map(a => (
                    <span key={a} style={{ padding: "3px 8px", background: "rgba(184,50,50,0.25)", border: "1px solid rgba(184,50,50,0.4)", borderRadius: 5, fontSize: 11.5, color: "#F07070", fontWeight: 600 }}>⚠ {a}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Check-in badge */}
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono',monospace", marginBottom: 4 }}>CHECKED IN</div>
              <div style={{ fontSize: 13.5, color: "#5BCCA0", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{checkInTime}</div>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)", marginTop: 2, fontFamily: "'JetBrains Mono',monospace" }}>{visitId}</div>
            </div>
          </div>

          {/* Timer card */}
          <div style={{ background: T.white, borderRadius: T.radiusLg, border: `1px solid ${T.border}`, boxShadow: T.shadow, padding: "18px 22px", display: "flex", alignItems: "center", minWidth: 220 }}>
            <EncounterTimer startTime={startTime} />
          </div>
        </div>

        {/* ── Critical vitals alert ── */}
        {criticalVitals.length > 0 && (
          <div style={{ padding: "12px 18px", background: T.roseLight, border: `1.5px solid ${T.roseBorder}`, borderRadius: T.radius, marginBottom: 20, display: "flex", alignItems: "center", gap: 12, animation: "critBlink 2s ease infinite" }}>
            <span style={{ fontSize: 20 }}>🚨</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: T.rose }}>Critical vitals detected</div>
              <div style={{ fontSize: 12.5, color: T.inkMid, marginTop: 2 }}>
                {criticalVitals.map(v => v.label).join(", ")} — doctor has been notified. Do not leave patient unattended.
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>

          {/* ── Left column ── */}
          <div>

            {/* Chief complaint & urgency */}
            <SectionCard title="Chief Complaint" icon="📋" subtitle="Why is the patient here today?"
              style={{ animation: "fadeUp 0.3s ease 0.05s both" }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.4px", marginBottom: 8 }}>PRESENTING COMPLAINT</div>
                <textarea
                  value={chiefComplaint}
                  onChange={e => setChiefComplaint(e.target.value)}
                  readOnly={isDoctor}
                  placeholder="Describe the patient's main complaint…"
                  rows={3}
                  style={{ width: "100%", padding: "11px 14px", border: `1.5px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13.5, fontFamily: "'DM Sans',sans-serif", color: T.ink, outline: "none", resize: "vertical", transition: "border-color 0.14s", background: isDoctor ? T.paperDim : T.white, boxSizing: "border-box", lineHeight: 1.55 }}
                  onFocus={e => { if (!isDoctor) e.target.style.borderColor = T.sage; }}
                  onBlur={e => { e.target.style.borderColor = T.border; }}
                />
              </div>

              {/* Urgency selector */}
              <div>
                <div style={{ fontSize: 11, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.4px", marginBottom: 10 }}>URGENCY LEVEL</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { key: "routine",   label: "Routine",   color: T.sage,  bg: T.sageLight  },
                    { key: "urgent",    label: "Urgent",    color: T.amber, bg: T.amberLight },
                    { key: "emergency", label: "Emergency", color: T.rose,  bg: T.roseLight  },
                  ].map(u => (
                    <button key={u.key} onClick={() => setUrgency(u.key)} style={{
                      flex: 1, padding: "10px 12px", borderRadius: T.radiusSm, cursor: "pointer",
                      border: `1.5px solid ${urgency === u.key ? u.color : T.border}`,
                      background: urgency === u.key ? u.bg : T.white,
                      color: urgency === u.key ? u.color : T.inkSub,
                      fontSize: 13, fontWeight: urgency === u.key ? 700 : 400,
                      fontFamily: "'DM Sans',sans-serif", transition: "all 0.14s",
                    }}
                      onMouseEnter={e => { if (urgency !== u.key) e.currentTarget.style.borderColor = u.color; }}
                      onMouseLeave={e => { if (urgency !== u.key) e.currentTarget.style.borderColor = T.border; }}
                    >{u.label}</button>
                  ))}
                </div>
              </div>
            </SectionCard>

            {/* Assign Doctor */}
            <SectionCard title="Assign Doctor" icon="🩺"
              subtitle={canAssignDoctor ? "Select the doctor for this encounter" : isDoctor ? "You are the assigned clinician" : "Assigned by receptionist"}
              style={{ animation: "fadeUp 0.3s ease 0.1s both" }}
              right={assignedDoctor && <Tag color={T.sage} bg={T.sageLight}>✓ Assigned</Tag>}
            >
              {isDoctor ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: T.sageLight, borderRadius: T.radiusSm, border: `1px solid ${T.sageBorder}` }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: T.sage, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 800, color: "#fff" }}>
                    {assignedDoctor?.avatar ?? "DR"}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: T.ink }}>{assignedDoctor?.name ?? "Loading…"}</div>
                    <div style={{ fontSize: 12, color: T.inkSub, marginTop: 1 }}>{assignedDoctor?.specialty ?? "General Practice"} · You are logged in as this doctor</div>
                  </div>
                </div>
              ) : !canAssignDoctor ? (
                <div style={{ fontSize: 13, color: T.inkSub, padding: "10px 0" }}>
                  {assignedDoctor
                    ? <span>Assigned to <strong style={{ color: T.ink }}>{assignedDoctor.name}</strong></span>
                    : "Waiting for receptionist to assign a doctor."}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {doctorsLoading ? (
                    <div style={{ padding: "16px 0", textAlign: "center", color: T.inkSub, fontSize: 13 }}>
                      Loading doctors…
                    </div>
                  ) : doctors.length === 0 ? (
                    <div style={{ padding: "16px 0", textAlign: "center", color: T.inkSub, fontSize: 13 }}>
                      No doctors found. Check staff records in admin.
                    </div>
                  ) : doctors.map(doc => {
                    const sel = assignedDoctor?.id === doc.id;
                    const liveQueue = queueData[doc.id] ?? 0;
                    return (
                      <div key={doc.id} onClick={() => setAssignedDoctor(doc)} style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                        borderRadius: T.radiusSm, cursor: "pointer",
                        border: `1.5px solid ${sel ? T.sage : T.border}`,
                        background: sel ? T.sageLight : T.white,
                        transition: "all 0.14s",
                      }}
                        onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor = T.sageMid; }}
                        onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor = T.border; }}
                      >
                        <div style={{ width: 38, height: 38, borderRadius: "50%", background: sel ? T.sage : T.paperDim, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 800, color: sel ? "#fff" : T.inkSub, flexShrink: 0, transition: "all 0.14s" }}>
                          {doc.avatar}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13.5, color: sel ? T.sage : T.ink }}>{doc.name}</div>
                          <div style={{ fontSize: 12, color: T.inkSub, marginTop: 2 }}>{doc.specialty}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <Tag
                            color={liveQueue === 0 ? T.sage : liveQueue <= 3 ? T.blue : T.amber}
                            bg={liveQueue === 0 ? T.sageLight : liveQueue <= 3 ? T.blueLight : T.amberLight}
                          >
                            {liveQueue === 0 ? "Free" : `${liveQueue} waiting`}
                          </Tag>
                        </div>
                        {sel && <span style={{ color: T.sage, fontSize: 16, flexShrink: 0 }}>✓</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            {/* Encounter Notes */}
            <SectionCard title="Nurse Notes" icon="📝"
              subtitle="Optional observations before doctor review"
              style={{ animation: "fadeUp 0.3s ease 0.15s both" }}>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                readOnly={isDoctor}
                placeholder="e.g. Patient appears distressed. RDT kit ready. Companion present."
                rows={3}
                style={{ width: "100%", padding: "11px 14px", border: `1.5px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13.5, fontFamily: "'DM Sans',sans-serif", color: T.ink, outline: "none", resize: "vertical", transition: "border-color 0.14s", background: isDoctor ? T.paperDim : T.white, boxSizing: "border-box", lineHeight: 1.55 }}
                onFocus={e => { if (!isDoctor) e.target.style.borderColor = T.sage; }}
                onBlur={e => { e.target.style.borderColor = T.border; }}
              />
            </SectionCard>
          </div>

          {/* ── Right column: vitals ── */}
          <div style={{ animation: "fadeUp 0.3s ease 0.12s both" }}>
            <div style={{ background: T.white, borderRadius: T.radiusLg, border: `1px solid ${T.border}`, boxShadow: T.shadow, overflow: "hidden", position: "sticky", top: 80 }}>
              {/* Vitals header */}
              <div style={{ padding: "16px 20px 13px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>🩺</span>
                  <div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14.5, color: T.ink }}>Vitals</div>
                    <div style={{ fontSize: 11.5, color: T.inkSub, marginTop: 2 }}>
                      {canTakeVitals ? "Enter patient measurements" : "View only"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {criticalVitals.length > 0 && <Tag color={T.rose} bg={T.roseLight}>🚨 Critical</Tag>}
                  {criticalVitals.length === 0 && warningVitals.length > 0 && <Tag color={T.amber} bg={T.amberLight}>⚠ Abnormal</Tag>}
                  {vitalsComplete && criticalVitals.length === 0 && warningVitals.length === 0 && <Tag color={T.sage} bg={T.sageLight}>✓ Normal</Tag>}
                </div>
              </div>

              <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                {VITALS_CONFIG.map(v => (
                  <VitalInput
                    key={v.key}
                    config={v}
                    value={vitals[v.key]}
                    onChange={handleVitalChange}
                    readOnly={!canTakeVitals}
                    voicing={voicingField === v.key}
                    onVoice={handleVoice}
                  />
                ))}

                {/* BMI auto-calc */}
                {bmi && (
                  <div style={{ padding: "12px 14px", background: bmiCat?.color === T.sage ? T.sageLight : bmiCat?.color === T.amber ? T.amberLight : T.roseLight, borderRadius: T.radiusSm, border: `1px solid ${bmiCat?.color}33`, animation: "fadeIn 0.25s ease" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 10.5, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", marginBottom: 4 }}>BMI (AUTO-CALCULATED)</div>
                        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: bmiCat?.color }}>{bmi}</div>
                      </div>
                      <Tag color={bmiCat?.color} bg={bmiCat?.color === T.sage ? T.sageLight : bmiCat?.color === T.amber ? T.amberLight : T.roseLight}>{bmiCat?.label}</Tag>
                    </div>
                  </div>
                )}

                {/* Progress indicator */}
                {canTakeVitals && (
                  <div style={{ paddingTop: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.inkSub, marginBottom: 6 }}>
                      <span>{["bp","temp","pulse","spo2"].filter(k => vitals[k]).length} / 4 required vitals</span>
                      {vitalsComplete && <span style={{ color: T.sage, fontWeight: 600 }}>Complete ✓</span>}
                    </div>
                    <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${["bp","temp","pulse","spo2"].filter(k => vitals[k]).length / 4 * 100}%`, background: T.sage, borderRadius: 2, transition: "width 0.3s ease" }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom action bar ── */}
        <div style={{
          position: "sticky", bottom: 0, left: 0, right: 0,
          background: T.white, borderTop: `1px solid ${T.border}`,
          padding: "14px 28px", marginTop: 24,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 -4px 20px rgba(13,17,23,0.06)",
          borderRadius: `${T.radiusSm}px ${T.radiusSm}px 0 0`,
          animation: "fadeUp 0.3s ease 0.2s both",
        }}>
          {/* Left: status summary */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: assignedDoctor ? T.sage : T.border, transition: "background 0.2s" }} />
              <span style={{ fontSize: 12.5, color: assignedDoctor ? T.inkMid : T.inkSub }}>
                {assignedDoctor ? `${assignedDoctor.name}` : "No doctor assigned"}
              </span>
            </div>
            <div style={{ width: 1, height: 14, background: T.border }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: vitalsComplete ? T.sage : T.border, transition: "background 0.2s" }} />
              <span style={{ fontSize: 12.5, color: vitalsComplete ? T.inkMid : T.inkSub }}>
                {vitalsComplete ? "Vitals complete" : "Vitals pending"}
              </span>
            </div>
            {criticalVitals.length > 0 && (
              <>
                <div style={{ width: 1, height: 14, background: T.border }} />
                <Tag color={T.rose} bg={T.roseLight} style={{ animation: "critBlink 1.5s ease infinite" }}>🚨 Critical vitals</Tag>
              </>
            )}
          </div>

          {/* Right: action buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost" onClick={() => {}}>← Back to Registration</Btn>

            {!canProceed && !isDoctor && (
              <div style={{ padding: "9px 16px", background: T.amberLight, border: `1px solid ${T.amberBorder}`, borderRadius: T.radiusSm, fontSize: 13, color: T.amber }}>
                {!assignedDoctor ? "Assign a doctor first" : "Enter required vitals first"}
              </div>
            )}

            <Btn
              variant="sage" size="lg"
              onClick={handleStart}
              disabled={!canProceed || starting}
            >
              {starting
                ? <><span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Starting…</>
                : isDoctor
                  ? "Proceed to Clinical Notes →"
                  : "Start Encounter →"
              }
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
