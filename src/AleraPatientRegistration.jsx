import { useState, useEffect, useRef } from "react";
import { useRole } from "./AleraShell.jsx";
import { useAuth } from "./AleraAuth.jsx";
import { searchPatients, getPatientAllergies } from "./supabase.js";

// ─── Voice Engine ──────────────────────────────────────────────────────────────
const SPEECH_SUPPORTED =
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

function useVoiceInput(onResult) {
  const [listening,  setListening]  = useState(false);
  const [error,      setError]      = useState(null);
  const stopRef = useRef(null);

  function toggle() {
    if (listening) { stopRef.current?.(); stopRef.current = null; setListening(false); return; }
    if (!SPEECH_SUPPORTED) { setError("Voice not supported — try Chrome or Edge."); return; }
    setError(null); setListening(true);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r  = new SR();
    r.lang = "en-NG"; r.continuous = false; r.interimResults = false;
    r.onresult = e => { const t = Array.from(e.results).map(x => x[0].transcript).join(" ").trim(); if (t) onResult(t); };
    r.onerror  = () => setError("Couldn't hear anything — try again.");
    r.onend    = () => { setListening(false); stopRef.current = null; };
    r.start();
    stopRef.current = () => { try { r.stop(); } catch (_) {} };
  }

  useEffect(() => () => stopRef.current?.(), []);
  return { listening, toggle, error, clearError: () => setError(null) };
}

/**
 * parseVoiceToFields(transcript) → calls Claude to extract patient demographics
 * Returns { name, sex, dob, phone, insurance, mode } — any fields mentioned.
 */
async function parseVoiceToFields(transcript) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: `You extract patient registration fields from spoken input at a Nigerian clinic.
Return ONLY a valid JSON object with any of these fields you can detect:
  name (string), sex ("Male"|"Female"|"Other"),
  dob (ISO date "YYYY-MM-DD" — derive from age if given, use 1st Jan of birth year),
  phone (Nigerian format), insurance ("NHIS"|"AXA Mansard"|"Leadway Health"|"Hygeia HMO"|"Reliance HMO"|"Avon HMO"|"None"),
  mode ("new"|"returning").
Omit fields you cannot detect. No explanation, no markdown, just the JSON object.`,
        messages: [{ role: "user", content: transcript }],
      }),
    });
    const data = await res.json();
    const text = data.content?.find(b => b.type === "text")?.text || "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return {};
  }
}


function generatePatientId() {
  return "ALE-" + String(Math.floor(Math.random() * 90000) + 10000).slice(0, 5);
}

const VOICE_COMMANDS = [
  '"New patient Chisom, female, DOB 1990"',
  '"Returning patient, phone 0803 441 7892"',
  '"Walk-in male, age 45, no insurance"',
  '"Register patient, NHIS insured"',
];

const INSURANCE_OPTIONS = [
  "— None —",
  "NHIS",
  "AXA Mansard",
  "Leadway Health",
  "Hygeia HMO",
  "Reliance HMO",
  "Avon HMO",
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepIndicator({ currentStep }) {
  const steps = ["New / Returning", "Demographics", "Insurance & Contact", "Review & Save"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 32 }}>
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < currentStep;
        const active = n === currentStep;
        return (
          <div key={n} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: done ? "#1E6B55" : active ? "#0A0F1E" : "#E8E4DC",
                color: done || active ? "#fff" : "#9A9890",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: done ? 14 : 13,
                fontFamily: "'Syne', sans-serif",
                fontWeight: 700,
                transition: "all 0.3s",
                boxShadow: active ? "0 0 0 4px rgba(10,15,30,0.12)" : "none",
                flexShrink: 0,
              }}>
                {done ? "✓" : n}
              </div>
              <div style={{
                fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                color: active ? "#0A0F1E" : done ? "#1E6B55" : "#9A9890",
                whiteSpace: "nowrap",
                fontWeight: active ? 600 : 400,
                letterSpacing: "0.3px",
              }}>
                {label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                flex: 1, height: 2,
                background: done ? "#1E6B55" : "#E8E4DC",
                margin: "0 8px",
                marginBottom: 22,
                transition: "background 0.3s",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AiChip({ icon = "✦", children, onAccept, onDismiss, acceptLabel = "Accept", color = "sage" }) {
  const [visible, setVisible] = useState(true);
  const [entering, setEntering] = useState(true);
  useEffect(() => { setTimeout(() => setEntering(false), 50); }, []);
  if (!visible) return null;
  const colors = {
    sage: { bg: "linear-gradient(135deg,#E8F4F0,#EEF4FF)", border: "rgba(30,107,85,0.2)", iconBg: "#1E6B55" },
    amber: { bg: "linear-gradient(135deg,#FEF3E2,#FFF8EE)", border: "rgba(232,134,10,0.25)", iconBg: "#E8860A" },
    rose: { bg: "linear-gradient(135deg,#FDECEA,#FFF3F2)", border: "rgba(192,57,43,0.2)", iconBg: "#C0392B" },
  };
  const c = colors[color] || colors.sage;
  return (
    <div style={{
      display: "flex", gap: 12, padding: "14px 16px",
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 12, marginBottom: 20,
      transform: entering ? "translateY(-6px)" : "translateY(0)",
      opacity: entering ? 0 : 1,
      transition: "all 0.25s ease",
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: c.iconBg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, color: "#fff",
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: "#0A0F1E", lineHeight: 1.55, marginBottom: 8 }}>{children}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {onAccept && (
            <button onClick={onAccept} style={{
              padding: "5px 14px", background: c.iconBg, color: "#fff",
              border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
              transition: "opacity 0.15s",
            }}>
              ✓ {acceptLabel}
            </button>
          )}
          {onDismiss && (
            <button onClick={() => { onDismiss?.(); setVisible(false); }} style={{
              padding: "5px 14px", background: "transparent", color: "#6B7080",
              border: "1px solid #D8D4CC", borderRadius: 6, fontSize: 12,
              cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            }}>
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children, hint, error }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{
        fontSize: 10, color: error ? "#C0392B" : "#6B7080",
        fontFamily: "'JetBrains Mono',monospace",
        letterSpacing: "0.8px", textTransform: "uppercase", fontWeight: 500,
        display: "flex", alignItems: "center", gap: 4,
      }}>
        {label}
        {required && <span style={{ color: "#C0392B" }}>*</span>}
      </label>
      {children}
      {hint && !error && <div style={{ fontSize: 11, color: "#9A9890" }}>{hint}</div>}
      {error && <div style={{ fontSize: 11, color: "#C0392B" }}>⚠ {error}</div>}
    </div>
  );
}

function Input({ value, onChange, onBlur, placeholder, type = "text", readOnly, icon, onIconClick, style: extraStyle, error }) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type={type}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        style={{
          width: "100%", padding: icon ? "10px 38px 10px 12px" : "10px 12px",
          border: `1.5px solid ${error ? "#C0392B" : "#D8D4CC"}`,
          borderRadius: 9, fontSize: 13.5,
          fontFamily: "'DM Sans',sans-serif",
          background: readOnly ? "#F5F2EC" : "#FDFCFA",
          color: readOnly ? "#9A9890" : "#0A0F1E",
          outline: "none", boxSizing: "border-box",
          transition: "border-color 0.15s, box-shadow 0.15s",
          ...extraStyle,
        }}
        onFocus={e => {
          if (!readOnly) {
            e.target.style.borderColor = error ? "#C0392B" : "#1E6B55";
            e.target.style.boxShadow = "0 0 0 3px rgba(30,107,85,0.1)";
            e.target.style.background = "#fff";
          }
        }}
        onBlur={e => {
          e.target.style.borderColor = error ? "#C0392B" : "#D8D4CC";
          e.target.style.boxShadow = "none";
          e.target.style.background = readOnly ? "#F5F2EC" : "#FDFCFA";
          onBlur?.(e.target.value);
        }}
      />
      {icon && (
        <span
          onClick={onIconClick}
          style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            fontSize: 15, cursor: onIconClick ? "pointer" : "default",
            color: "#9A9890", transition: "color 0.15s",
            userSelect: "none",
          }}
          onMouseEnter={e => { if (onIconClick) e.target.style.color = "#E8860A"; }}
          onMouseLeave={e => { e.target.style.color = "#9A9890"; }}
        >
          {icon}
        </span>
      )}
    </div>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange?.(e.target.value)}
      style={{
        width: "100%", padding: "10px 12px",
        border: "1.5px solid #D8D4CC", borderRadius: 9,
        fontSize: 13.5, fontFamily: "'DM Sans',sans-serif",
        background: "#FDFCFA", color: "#0A0F1E",
        outline: "none", cursor: "pointer",
        appearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236B7080' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 12px center",
        paddingRight: 32,
        transition: "border-color 0.15s",
      }}
      onFocus={e => { e.target.style.borderColor = "#1E6B55"; e.target.style.background = "#fff"; }}
      onBlur={e => { e.target.style.borderColor = "#D8D4CC"; e.target.style.background = "#FDFCFA"; }}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function VoiceCommandPill({ label, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 12px",
      background: "#FEF3E2", color: "#E8860A",
      border: "1px solid rgba(232,134,10,0.25)",
      borderRadius: 20, fontSize: 11, fontWeight: 500,
      cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
      transition: "all 0.15s", margin: "3px 4px 3px 0",
    }}
      onMouseEnter={e => { e.currentTarget.style.background = "#E8860A"; e.currentTarget.style.color = "#fff"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "#FEF3E2"; e.currentTarget.style.color = "#E8860A"; }}
    >
      🎙 {label}
    </button>
  );
}

function PatientCard({ patient, onSelect }) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 16px",
        border: "1.5px solid #D8D4CC", borderRadius: 12,
        background: "#FDFCFA", cursor: "pointer",
        transition: "all 0.2s",
        marginBottom: 10,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = "#1E6B55";
        e.currentTarget.style.background = "#E8F4F0";
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(30,107,85,0.12)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "#D8D4CC";
        e.currentTarget.style.background = "#FDFCFA";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: "50%",
        background: "#1E6B55",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: "#fff",
        flexShrink: 0,
      }}>
        {(patient.name ?? `${patient.first_name ?? ""} ${patient.last_name ?? ""}`).trim().split(" ").map(n => n[0] ?? "").join("").slice(0, 2).toUpperCase()}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: "#0A0F1E" }}>
            {patient.name ?? `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim()}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#6B7080", fontFamily: "'JetBrains Mono',monospace" }}>{patient.patient_number ?? patient.id}</span>
          <span style={{ fontSize: 11, color: "#6B7080" }}>·</span>
          <span style={{ fontSize: 11, color: "#6B7080" }}>
            {patient.biological_sex ? patient.biological_sex.charAt(0).toUpperCase() + patient.biological_sex.slice(1) : (patient.sex ?? "—")}
            {" · "}
            {patient.date_of_birth
              ? `${new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear()} yrs`
              : patient.dob
              ? `${new Date().getFullYear() - parseInt(patient.dob.split("-")[0])} yrs`
              : "—"}
          </span>
          <span style={{ fontSize: 11, color: "#6B7080" }}>·</span>
          <span style={{ fontSize: 11, color: "#6B7080" }}>
            Last: {patient.last_visit_at ? new Date(patient.last_visit_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : patient.lastVisit ?? "No visits"}
          </span>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{
          fontSize: 11, padding: "3px 10px", borderRadius: 5,
          background: "#E8F4F0", color: "#1E6B55",
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 600,
          marginBottom: 4,
        }}>{patient.total_visits ?? patient.visits ?? 0} visits</div>
        <div style={{ fontSize: 11, color: "#9A9890" }}>{patient.lastDiag ?? "—"}</div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AleraPatientRegistration({ onComplete }) {
  const { role, can, canRead } = useRole?.() || { role: "receptionist", can: () => true, canRead: () => true };
  const { orgId, staffId } = useAuth();
  const readOnly = !can("canRegisterPatient") && canRead("canRegisterPatient");
  const noAccess = !canRead("canRegisterPatient");
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState(null); // "new" | "returning"
  const [voiceActive,  setVoiceActive]  = useState(false);
  const [voiceText,    setVoiceText]    = useState("");
  const [voiceError,   setVoiceError]   = useState(null);
  const [voiceTimer, setVoiceTimer] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults]   = useState([]);
  const [searchLoading, setSearchLoading]   = useState(false);
  const [matchedPatient, setMatchedPatient] = useState(null);
  const [autofillApplied, setAutofillApplied] = useState(false);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState({});

  const [form, setForm] = useState({
    firstName: "", middleName: "", lastName: "",
    phone: "", dob: "", sex: "Female",
    blood: "— Unknown —", insurance: "— None —", insuranceId: "",
    address: "", allergies: "None", patientId: generatePatientId(),
    visitReason: "", nin: "",
  });

  const voiceRef = useRef(null);

  // Phone-based returning patient lookup — live Supabase query
  useEffect(() => {
    const digits = form.phone.replace(/\D/g, "");
    if (digits.length < 8 || autofillApplied || !orgId) {
      setMatchedPatient(null);
      return;
    }
    let cancelled = false;
    searchPatients(digits, orgId).then(({ data }) => {
      if (cancelled) return;
      const match = data?.find(p => (p.phone || "").replace(/\D/g, "") === digits);
      setMatchedPatient(match ?? null);
    });
    return () => { cancelled = true; };
  }, [form.phone, orgId, autofillApplied]);

  // Name-based duplicate detection — live Supabase query
  useEffect(() => {
    const fullName = [form.firstName, form.lastName].filter(Boolean).join(" ");
    if (fullName.length < 4 || mode !== "new" || !orgId) {
      setShowDuplicateWarning(false);
      return;
    }
    let cancelled = false;
    searchPatients(form.firstName, orgId).then(({ data }) => {
      if (cancelled) return;
      setShowDuplicateWarning(!autofillApplied && (data?.length ?? 0) > 0);
    });
    return () => { cancelled = true; };
  }, [form.firstName, form.lastName, mode, orgId, autofillApplied]);

  // Live search for returning patient mode — debounced
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2 || !orgId) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      const { data } = await searchPatients(searchQuery, orgId);
      setSearchResults(data ?? []);
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, orgId]);

  async function applyAutofill(p) {
    // Normalise DB shape (first_name/last_name) vs legacy shape (name)
    const fullName = p.name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
    const patientId = p.patient_number ?? p.id;
    const sex = p.biological_sex
      ? p.biological_sex.charAt(0).toUpperCase() + p.biological_sex.slice(1)
      : p.sex ?? "Female";
    const blood = p.blood_group ?? p.blood ?? "— Unknown —";
    const insurance = p.insurance_provider ?? p.insurance ?? "— None —";
    const dob = p.date_of_birth ?? p.dob ?? "";

    // Pull live allergies from DB
    let allergiesStr = "None";
    if (p.id && orgId) {
      const { data: allergyRows } = await getPatientAllergies(p.id);
      if (allergyRows?.length) {
        allergiesStr = allergyRows.map(a => a.allergen).join(", ");
      }
    }

    setForm(f => ({
      ...f,
      firstName:   p.first_name ?? p.name?.split(" ")[0] ?? "",
      middleName:  p.middle_name ?? "",
      lastName:    p.last_name ?? p.name?.split(" ").slice(1).join(" ") ?? "",
      nin:         p.nin ?? "",
      phone:       p.phone ?? "",
      dob,
      sex,
      blood,
      insurance,
      insuranceId: p.insurance_id ?? p.insuranceId ?? "",
      address:     p.address_line1 ?? p.address ?? "",
      allergies:   allergiesStr,
      patientId,
      _db_id:      p.id,   // preserve real UUID for downstream screens
    }));
    setAutofillApplied(true);
    setMatchedPatient(null);
    setShowDuplicateWarning(false);
    setMode("returning");
    setStep(2);
  }

  function setField(key, val) {
    setForm(f => ({ ...f, [key]: val }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: null }));
  }

  function validateStep2() {
    const e = {};
    if (!form.firstName.trim()) e.firstName = "First name is required";
    if (!form.lastName.trim()) e.lastName = "Last name is required";
    if (!form.dob) e.dob = "Date of birth is required";
    if (!form.phone.trim()) {
      e.phone = "Phone number is required";
    } else {
      // Accept +234XXXXXXXXXX (10 digits after +234) or 0XXXXXXXXXX (11 digits)
      const digits = form.phone.replace(/\D/g, "");
      const withPlus = form.phone.trim().startsWith("+234");
      if (withPlus && digits.length !== 12) {
        e.phone = "Enter +234 followed by 10 digits (e.g. +2348031234567)";
      } else if (!withPlus && digits.length !== 11) {
        e.phone = "Enter 11 digits starting with 0 (e.g. 08031234567)";
      }
    }
    if (form.nin && !/^\d{11}$/.test(form.nin.trim())) {
      e.nin = "NIN must be exactly 11 digits";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep3() {
    const e = {};
    if (form.insurance !== "— None —" && !form.insuranceId.trim()) {
      e.insuranceId = "Insurance ID required when insured";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() {
    if (step === 2 && !validateStep2()) return;
    if (step === 3 && !validateStep3()) return;
    setStep(s => Math.min(s + 1, 4));
  }

  function handleSave() {
    setSaved(true);
    // Build unified payload — AleraApp.handleRegistrationComplete handles the DB save
    const patientPayload = {
      ...form,
      first_name:  form.firstName.trim(),
      middle_name: form.middleName.trim() || null,
      last_name:   form.lastName.trim(),
      // Keep a "name" field so AleraApp display logic still works
      name: [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ").trim(),
      nin:  form.nin.trim() || null,
    };
    setTimeout(() => { onComplete?.(patientPayload); }, 1200);
  }

  // ── Real voice registration ─────────────────────────────────────────────────
  const { listening: micListening, toggle: toggleMic, error: micSpeechError } = useVoiceInput(async transcript => {
    setVoiceActive(true);
    setVoiceText(`Heard: "${transcript}" — parsing…`);
    setVoiceError(null);
    try {
      const fields = await parseVoiceToFields(transcript);
      if (Object.keys(fields).length === 0) {
        setVoiceError("Couldn't extract patient details — try being more specific.");
      } else {
        // Apply detected fields
        if (fields.name) {
          const parts = fields.name.trim().split(" ");
          setField("firstName", parts[0] ?? "");
          setField("lastName", parts.slice(1).join(" ") ?? "");
        }
        if (fields.sex)       setField("sex",        fields.sex);
        if (fields.dob)       setField("dob",        fields.dob);
        if (fields.phone)     setField("phone",      fields.phone);
        if (fields.insurance) setField("insurance",  fields.insurance);
        if (fields.mode && (fields.mode === "new" || fields.mode === "returning")) {
          setMode(fields.mode);
          if (step < 2) setStep(fields.mode === "returning" ? 1.5 : 2);
        }
        const applied = Object.keys(fields).filter(k => k !== "mode").join(", ");
        setVoiceText(applied ? `✓ Applied: ${applied}` : "✓ Mode set");
        setTimeout(() => { setVoiceActive(false); setVoiceText(""); }, 2500);
        return;
      }
    } catch {
      setVoiceError("Parse failed — please try again.");
    }
    setVoiceActive(false);
    setVoiceText("");
  });

  // Legacy simulateVoice removed — pills now pre-fill the spoken examples visually
  function handlePillClick(exampleText) {
    // Strip quotes from example label and show as a hint
    setVoiceText(`Example: ${exampleText}`);
    setTimeout(() => setVoiceText(""), 3000);
  }

  const age = form.dob
    ? new Date().getFullYear() - parseInt(form.dob.split("-")[0])
    : null;

  // ─── Shared styles ──
  const card = {
    background: "#fff", borderRadius: 16,
    border: "1.5px solid #E0DCD4",
    boxShadow: "0 2px 16px rgba(10,15,30,0.07), 0 1px 4px rgba(10,15,30,0.04)",
    overflow: "hidden",
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: "100vh", background: "#F5F2EC",
      fontFamily: "'DM Sans', sans-serif", color: "#0A0F1E",
      padding: "0",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: rgba(30,107,85,0.2); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #D8D4CC; border-radius: 4px; }
        @keyframes slideIn { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes voicePulse { 0%,100% { box-shadow: 0 0 0 0 rgba(232,134,10,0.5); } 50% { box-shadow: 0 0 0 12px rgba(232,134,10,0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes checkIn { from { transform: scale(0); } to { transform: scale(1); } }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        background: "#0A0F1E", height: 58,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: "#fff", letterSpacing: -0.5 }}>
            al<span style={{ color: "#27856A" }}>era</span>
          </div>
          <div style={{ width: 1, height: 20, background: "#1A2040" }} />
          <div style={{ fontSize: 13, color: "#5A6580" }}>Patient Registration</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["● CLOUD SYNC", "🎙 VOICE READY", "✦ AI ON"].map((b, i) => (
            <span key={i} style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
              padding: "3px 9px", borderRadius: 4,
              background: ["rgba(30,107,85,0.15)", "rgba(232,134,10,0.15)", "rgba(26,95,168,0.15)"][i],
              color: ["#27856A", "#E8860A", "#5B9EE8"][i],
              border: `1px solid ${["rgba(30,107,85,0.3)", "rgba(232,134,10,0.3)", "rgba(26,95,168,0.3)"][i]}`,
            }}>{b}</span>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{
        maxWidth: 920, margin: "0 auto", padding: "40px 24px",
        animation: "fadeIn 0.4s ease",
      }}>

        {/* ── Page heading ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 800, letterSpacing: -0.8, marginBottom: 4 }}>
            Register Patient
          </div>
          <div style={{ fontSize: 13.5, color: "#6B7080" }}>
            New or returning — complete in under 10 seconds · Voice-enabled · Auto-syncs to cloud
          </div>
        </div>

        <StepIndicator currentStep={step} />

        {/* ════════════════════════════════
            STEP 1 — New or Returning
        ════════════════════════════════ */}
        {step === 1 && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            {/* Mode selector */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28,
            }}>
              {[
                { key: "new", icon: "➕", label: "New Patient", desc: "First time visiting this clinic" },
                { key: "returning", icon: "🔄", label: "Returning Patient", desc: "Previously registered patient" },
              ].map(opt => (
                <div
                  key={opt.key}
                  onClick={() => { setMode(opt.key); setStep(opt.key === "returning" ? 1.5 : 2); }}
                  style={{
                    ...card,
                    padding: "24px", cursor: "pointer", textAlign: "center",
                    border: `2px solid ${mode === opt.key ? "#1E6B55" : "#E0DCD4"}`,
                    background: mode === opt.key ? "#E8F4F0" : "#fff",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={e => {
                    if (mode !== opt.key) {
                      e.currentTarget.style.borderColor = "#1E6B55";
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "0 8px 24px rgba(30,107,85,0.15)";
                    }
                  }}
                  onMouseLeave={e => {
                    if (mode !== opt.key) {
                      e.currentTarget.style.borderColor = "#E0DCD4";
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "";
                    }
                  }}
                >
                  <div style={{ fontSize: 36, marginBottom: 10 }}>{opt.icon}</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{opt.label}</div>
                  <div style={{ fontSize: 13, color: "#6B7080" }}>{opt.desc}</div>
                </div>
              ))}
            </div>

            {/* Voice commands */}
            <div style={{ ...card, padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: micListening ? "#C0392B" : "#E8860A", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, color: "#fff",
                  animation: micListening ? "voicePulse 1s infinite" : "none",
                }}>🎙</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14 }}>Voice Registration</div>
                <div style={{ fontSize: 12, color: "#6B7080", marginLeft: "auto" }}>
                  {micListening ? "Listening…" : "Fastest way to register · ~3 seconds"}
                </div>
                {/* Real Mic Button */}
                <button
                  type="button"
                  onClick={toggleMic}
                  title={micListening ? "Stop recording" : "Start voice registration"}
                  style={{
                    width: 36, height: 36, borderRadius: "50%", border: `1.5px solid ${micListening ? "#C0392B" : "rgba(232,134,10,0.4)"}`,
                    background: micListening ? "#FDECEA" : "#FEF3E2",
                    color: micListening ? "#C0392B" : "#E8860A",
                    cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
                    animation: micListening ? "voicePulse 1s infinite" : "none", transition: "all 0.18s", flexShrink: 0,
                  }}
                >{micListening ? "⏹" : "🎙"}</button>
              </div>
              {/* Example phrases — click to show; they are hints, not simulations */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 0 }}>
                {VOICE_COMMANDS.map((cmd, i) => (
                  <VoiceCommandPill key={i} label={cmd} onClick={() => handlePillClick(cmd)} />
                ))}
              </div>
              {(voiceActive || micListening || voiceText || micSpeechError || voiceError) && (
                <div style={{
                  marginTop: 14, padding: "10px 14px",
                  background: (voiceError || micSpeechError) ? "#FDECEA" : "#FFF3E0",
                  border: `1px solid ${(voiceError || micSpeechError) ? "rgba(192,57,43,0.3)" : "rgba(232,134,10,0.3)"}`,
                  borderRadius: 8, display: "flex", alignItems: "center", gap: 10,
                  animation: micListening ? "voicePulse 1s infinite" : "none",
                }}>
                  <span style={{ fontSize: 18 }}>{(voiceError || micSpeechError) ? "⚠️" : micListening ? "🔴" : "✅"}</span>
                  <span style={{ fontSize: 13, color: (voiceError || micSpeechError) ? "#C0392B" : "#E8860A", fontWeight: 500 }}>
                    {voiceError || micSpeechError || (micListening ? "Listening… speak now" : voiceText)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════
            STEP 1.5 — Returning search
        ════════════════════════════════ */}
        {step === 1.5 && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ ...card, padding: "24px" }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
                Search Existing Patients
              </div>
              <Input
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by name, phone number, or Patient ID..."
                icon="🔍"
              />
              <div style={{ marginTop: 20 }}>
                {searchLoading ? (
                  <div style={{ textAlign: "center", padding: "24px 0", color: "#9A9890", fontSize: 13 }}>
                    🔍 Searching patients…
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map(p => (
                    <PatientCard key={p.id} patient={p} onSelect={() => applyAutofill(p)} />
                  ))
                ) : (
                  <div style={{
                    textAlign: "center", padding: "32px 20px",
                    color: "#9A9890", fontSize: 13,
                  }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                    No matching patients found.
                    <button
                      onClick={() => {
                        // Pre-fill name from search query
                        const parts = searchQuery.trim().split(" ");
                        setField("firstName", parts[0] ?? "");
                        if (parts.length > 1) setField("lastName", parts.slice(1).join(" "));
                        setMode("new"); setStep(2);
                      }}
                      style={{
                        display: "block", margin: "12px auto 0",
                        padding: "8px 18px", background: "#0A0F1E", color: "#fff",
                        border: "none", borderRadius: 8, fontSize: 13,
                        cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                        fontWeight: 500,
                      }}
                    >
                      Register as new patient instead
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════
            STEP 2 — Demographics
        ════════════════════════════════ */}
        {step === 2 && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            {/* Autofill banner */}
            {autofillApplied && (
              <AiChip icon="✓" color="sage" onDismiss={() => setAutofillApplied(false)}>
                <strong>Auto-filled from existing record ({form.patientId}).</strong> All demographics loaded from previous visit. Verify and continue.
              </AiChip>
            )}

            {/* Returning patient phone match */}
            {matchedPatient && !autofillApplied && (
              <AiChip
                icon="✦" color="sage"
                acceptLabel={`Auto-fill ${matchedPatient.name}`}
                onAccept={() => applyAutofill(matchedPatient)}
                onDismiss={() => setMatchedPatient(null)}
              >
                <strong>Returning patient detected.</strong> Phone matches <strong>{matchedPatient.name}</strong> (last visit {matchedPatient.lastVisit} · {matchedPatient.lastDiag}). Auto-fill all fields?
              </AiChip>
            )}

            {/* Duplicate warning */}
            {showDuplicateWarning && !autofillApplied && (
              <AiChip
                icon="⚠" color="amber"
                acceptLabel="View existing record"
                onAccept={() => { setMode("returning"); setStep(1.5); }}
                onDismiss={() => setShowDuplicateWarning(false)}
              >
                <strong>Possible duplicate detected.</strong> A patient with a similar name already exists. Check existing records before creating a new entry?
              </AiChip>
            )}

            <div style={{ ...card }}>
              <div style={{
                padding: "18px 24px", borderBottom: "1.5px solid #E8E4DC",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15 }}>Patient Demographics</div>
                <span style={{
                  marginLeft: "auto", fontSize: 10, padding: "3px 9px",
                  background: mode === "returning" ? "#E8F4F0" : "#F5F2EC",
                  color: mode === "returning" ? "#1E6B55" : "#6B7080",
                  borderRadius: 5, fontFamily: "'JetBrains Mono',monospace", fontWeight: 600,
                }}>
                  {mode === "returning" ? "RETURNING" : "NEW PATIENT"}
                </span>
              </div>
              <div style={{ padding: "24px" }}>
                {/* Row 1 — Name fields */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <Field label="First Name" required error={errors.firstName}>
                    <Input
                      value={form.firstName} onChange={v => setField("firstName", v)}
                      placeholder="e.g. Amina" icon="🎙"
                      onIconClick={() => toggleMic} error={errors.firstName}
                    />
                  </Field>
                  <Field label="Middle Name" hint="Optional">
                    <Input
                      value={form.middleName} onChange={v => setField("middleName", v)}
                      placeholder="e.g. Chisom"
                    />
                  </Field>
                  <Field label="Last Name" required error={errors.lastName}>
                    <Input
                      value={form.lastName} onChange={v => setField("lastName", v)}
                      placeholder="e.g. Okonkwo" error={errors.lastName}
                    />
                  </Field>
                </div>
                {/* Row 1b — Phone + NIN */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <Field label="Phone Number" required error={errors.phone}
                    hint="+234 followed by 10 digits">
                    <Input
                      value={form.phone} onChange={v => setField("phone", v)}
                      placeholder="+2348031234567" type="tel" icon="🔍"
                      error={errors.phone}
                      onBlur={v => {
                        if (!v.trim()) return;
                        const digits = v.replace(/\D/g, "");
                        const withPlus = v.trim().startsWith("+234");
                        if (withPlus && digits.length !== 12) {
                          setErrors(e => ({ ...e, phone: "Enter +234 followed by 10 digits (e.g. +2348031234567)" }));
                        } else if (!withPlus && digits.length !== 11) {
                          setErrors(e => ({ ...e, phone: "Enter 11 digits starting with 0 (e.g. 08031234567)" }));
                        } else {
                          setErrors(e => ({ ...e, phone: null }));
                        }
                      }}
                    />
                  </Field>
                  <Field label="NIN (National ID)" hint="Optional — 11 digits" error={errors.nin}>
                    <Input
                      value={form.nin} onChange={v => setField("nin", v.replace(/\D/g, "").slice(0, 11))}
                      placeholder="12345678901" error={errors.nin}
                      onBlur={v => {
                        if (!v.trim()) return;
                        if (!/^\d{11}$/.test(v.trim())) {
                          setErrors(e => ({ ...e, nin: "NIN must be exactly 11 digits" }));
                        } else {
                          setErrors(e => ({ ...e, nin: null }));
                        }
                      }}
                    />
                  </Field>
                </div>
                {/* Row 2 */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <Field label="Date of Birth" required error={errors.dob}>
                    <Input value={form.dob} onChange={v => setField("dob", v)} type="date" error={errors.dob} />
                  </Field>
                  <Field label={`Age${age ? ` — ${age} years` : ""}`}>
                    <Input
                      value={age ? `${age} years` : ""}
                      placeholder="Auto-calculated"
                      readOnly
                    />
                  </Field>
                  <Field label="Sex" required>
                    <Select value={form.sex} onChange={v => setField("sex", v)}
                      options={["Female", "Male", "Other", "Prefer not to say"]} />
                  </Field>
                </div>
                {/* Row 3 */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <Field label="Blood Group">
                    <Select value={form.blood} onChange={v => setField("blood", v)}
                      options={["— Unknown —", "O+", "O−", "A+", "A−", "B+", "B−", "AB+", "AB−"]} />
                  </Field>
                  <Field label="Known Allergies">
                    <Input value={form.allergies} onChange={v => setField("allergies", v)} placeholder="e.g. Penicillin" />
                  </Field>
                  <Field label="Patient ID">
                    <Input value={form.patientId} readOnly icon="🔒" />
                  </Field>
                </div>
                {/* Address */}
                <div style={{ marginBottom: 0 }}>
                  <Field label="Address (Optional)">
                    <Input value={form.address} onChange={v => setField("address", v)}
                      placeholder="Street, City, State" icon="🎙" onIconClick={() => {}} />
                  </Field>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════
            STEP 3 — Insurance & Contact
        ════════════════════════════════ */}
        {step === 3 && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ ...card }}>
              <div style={{ padding: "18px 24px", borderBottom: "1.5px solid #E8E4DC" }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15 }}>Insurance & Visit Details</div>
              </div>
              <div style={{ padding: "24px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <Field label="Insurance Provider">
                    <Select value={form.insurance} onChange={v => setField("insurance", v)}
                      options={INSURANCE_OPTIONS} />
                  </Field>
                  <Field label="Insurance / Policy ID" error={errors.insuranceId}>
                    <Input
                      value={form.insuranceId} onChange={v => setField("insuranceId", v)}
                      placeholder={form.insurance === "— None —" ? "N/A" : "Enter policy number"}
                      readOnly={form.insurance === "— None —"}
                      error={errors.insuranceId}
                    />
                  </Field>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <Field label="Reason for Visit Today">
                    <Input
                      value={form.visitReason}
                      onChange={v => setField("visitReason", v)}
                      placeholder="e.g. Fever, follow-up, antenatal..."
                      icon="🎙"
                    />
                  </Field>
                  <Field label="Consultation Type">
                    <Select value={form.consultType || "General Outpatient"}
                      onChange={v => setField("consultType", v)}
                      options={["General Outpatient", "Follow-up", "Emergency", "Antenatal", "Pediatric"]} />
                  </Field>
                </div>

                {/* Insurance info badge */}
                {form.insurance !== "— None —" && (
                  <div style={{
                    padding: "12px 16px", background: "#E8F4F0",
                    border: "1px solid rgba(30,107,85,0.2)", borderRadius: 10,
                    display: "flex", alignItems: "center", gap: 10,
                    fontSize: 13, color: "#0A0F1E",
                  }}>
                    <span style={{ fontSize: 18 }}>🏥</span>
                    <div>
                      <strong>{form.insurance}</strong> coverage active.
                      Eligible services will be auto-coded at billing.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════
            STEP 4 — Review & Save
        ════════════════════════════════ */}
        {step === 4 && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            {saved ? (
              <div style={{
                ...card, padding: "60px 40px", textAlign: "center",
                animation: "slideIn 0.4s ease",
              }}>
                <div style={{
                  width: 72, height: 72, borderRadius: "50%",
                  background: "#1E6B55", margin: "0 auto 20px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 32, color: "#fff",
                  animation: "checkIn 0.4s cubic-bezier(0.34,1.56,0.64,1)",
                }}>✓</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 6 }}>
                  Patient Registered!
                </div>
                <div style={{ color: "#6B7080", fontSize: 14, marginBottom: 4 }}>
                  {form.name} · {form.patientId}
                </div>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  marginTop: 12,
                  padding: "6px 14px", background: "#E8F4F0",
                  color: "#1E6B55", borderRadius: 20,
                  fontSize: 12, fontFamily: "'JetBrains Mono',monospace",
                }}>
                  ⚡ Record synced to cloud · Encounter auto-opened
                </div>
              </div>
            ) : (
              <>
                <div style={{ ...card, marginBottom: 16 }}>
                  <div style={{ padding: "18px 24px", borderBottom: "1.5px solid #E8E4DC" }}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15 }}>Review Summary</div>
                  </div>
                  <div style={{ padding: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {[
                      ["Patient", form.name || "—"],
                      ["ID", form.patientId],
                      ["Phone", form.phone || "—"],
                      ["Date of Birth", form.dob ? `${form.dob} (${age} yrs)` : "—"],
                      ["Sex", form.sex],
                      ["Blood Group", form.blood],
                      ["Allergies", form.allergies || "None"],
                      ["Insurance", form.insurance === "— None —" ? "Uninsured (self-pay)" : form.insurance],
                      ["Insurance ID", form.insuranceId || "—"],
                      ["Visit Reason", form.visitReason || "—"],
                      ["Address", form.address || "—"],
                      ["Mode", mode === "returning" ? "Returning Patient" : "New Registration"],
                    ].map(([lbl, val]) => (
                      <div key={lbl} style={{ padding: "10px 14px", background: "#F9F7F3", borderRadius: 9, border: "1px solid #E8E4DC" }}>
                        <div style={{ fontSize: 10, color: "#9A9890", fontFamily: "'JetBrains Mono',monospace", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px" }}>{lbl}</div>
                        <div style={{ fontSize: 13.5, color: val === "—" ? "#C0BAB0" : "#0A0F1E", fontWeight: 500 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ padding: "14px 18px", background: "#E8F4F0", borderRadius: 12, border: "1px solid rgba(30,107,85,0.2)", marginBottom: 20, fontSize: 12.5, color: "#1E6B55", display: "flex", gap: 8, alignItems: "center" }}>
                  <span>✦</span>
                  On save: record pushed to cloud, encounter auto-created, patient notified via SMS, and queue updated.
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Navigation buttons ── */}
        {!saved && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
            <button
              onClick={() => {
                if (step === 2) setStep(mode === "returning" ? 1.5 : 1);
                else if (step === 1.5) setStep(1);
                else setStep(s => Math.max(s - 1, 1));
              }}
              style={{
                padding: "11px 22px", background: "transparent",
                color: "#6B7080", border: "1.5px solid #D8D4CC",
                borderRadius: 9, fontSize: 13.5, fontWeight: 500,
                cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                display: step === 1 ? "none" : "flex", alignItems: "center", gap: 6,
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#1E6B55"; e.currentTarget.style.color = "#1E6B55"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#D8D4CC"; e.currentTarget.style.color = "#6B7080"; }}
            >
              ← Back
            </button>
            <div style={{ display: "flex", gap: 10 }}>
              {step === 4 ? (
                readOnly
                  ? <div style={{ padding: "10px 18px", background: "#FEF5E7", border: "1px solid rgba(201,122,16,0.3)", borderRadius: 9, fontSize: 13, color: "#C97A10" }}>👁 View only — your role cannot register patients</div>
                  : <button
                  onClick={handleSave}
                  style={{
                    padding: "11px 28px", background: "#1E6B55", color: "#fff",
                    border: "none", borderRadius: 9, fontSize: 14, fontWeight: 700,
                    cursor: "pointer", fontFamily: "'Syne',sans-serif",
                    boxShadow: "0 4px 16px rgba(30,107,85,0.3)",
                    transition: "all 0.2s", display: "flex", alignItems: "center", gap: 8,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(30,107,85,0.4)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 4px 16px rgba(30,107,85,0.3)"; }}
                >
                  ✓ Save & Open Encounter →
                </button>
              ) : step !== 1 && step !== 1.5 ? (
                <button
                  onClick={handleNext}
                  style={{
                    padding: "11px 24px", background: "#0A0F1E", color: "#fff",
                    border: "none", borderRadius: 9, fontSize: 13.5, fontWeight: 600,
                    cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                    display: "flex", alignItems: "center", gap: 6,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#1A2540"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#0A0F1E"; }}
                >
                  Continue → 
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
