import { useState, useEffect, useRef } from "react";
import AleraPatientLookup from "./AleraPatientLookup.jsx";
import { useRole } from "./AleraShell.jsx";
import { useAuth } from "./AleraAuth.jsx";
import { saveNote, saveDiagnoses } from "./supabase.js";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const PATIENT = {
  id: "ALE-00847", name: "Adaeze Okafor", age: 33, sex: "Female",
  blood: "O+", allergies: "None", insurance: "NHIS",
  vitals: { temp: "38.6°C", bp: "118/76 mmHg", pulse: "88 bpm", spo2: "97%", weight: "58 kg" },
  lastVisit: "14 Jan 2025", lastDiag: "Malaria",
  history: ["Malaria (Jan 2025)", "Hypertension check (Nov 2024)", "Antenatal G2P1 (Sep 2024)"],
};

const ICD10_MAP = {
  malaria: [{ code: "B54", label: "Unspecified malaria" }, { code: "B50.9", label: "P. falciparum malaria, unspecified" }, { code: "B51.9", label: "P. vivax malaria" }],
  fever: [{ code: "R50.9", label: "Fever, unspecified" }, { code: "R50.81", label: "Fever presenting with conditions classified elsewhere" }],
  typhoid: [{ code: "A01.00", label: "Typhoid fever, unspecified" }, { code: "A01.09", label: "Typhoid fever with other complications" }],
  hypertension: [{ code: "I10", label: "Essential hypertension" }, { code: "I11.9", label: "Hypertensive heart disease" }],
  diabetes: [{ code: "E11.9", label: "Type 2 diabetes mellitus" }, { code: "E10.9", label: "Type 1 diabetes mellitus" }],
  headache: [{ code: "R51", label: "Headache, unspecified" }, { code: "G43.909", label: "Migraine, unspecified" }],
};

const AI_SUGGESTIONS = {
  "fever": {
    diagnoses: ["Malaria (P. falciparum)", "Typhoid fever", "Viral fever"],
    icd: "B50.9",
    plan: "Order malaria RDT. Start empiric artemether-lumefantrine pending result. Monitor temperature. Return in 48h if no improvement.",
    risk: ["Severe malaria risk if untreated >72h", "Dehydration risk — encourage oral fluids"],
    tests: ["Malaria RDT", "Full Blood Count", "Widal test if typhoid suspected"],
    preventive: ["Malaria prophylaxis overdue — last 8+ months", "Recommend insecticide-treated net"],
  },
  "headache": {
    diagnoses: ["Tension headache", "Migraine", "Malaria-related cephalgia"],
    icd: "R51",
    plan: "Assess severity and duration. Prescribe analgesics. Rule out hypertension. Follow-up in 1 week.",
    risk: ["Secondary hypertension risk", "Recurrent migraine pattern"],
    tests: ["BP measurement", "Blood glucose"],
    preventive: ["Stress management counselling", "Sleep hygiene review"],
  },
  "default": {
    diagnoses: ["Malaria (P. falciparum)", "Viral infection", "Bacterial infection"],
    icd: "B54",
    plan: "Evaluate vitals and chief complaint. Order relevant investigations. Prescribe symptomatic treatment.",
    risk: ["Monitor for deterioration"],
    tests: ["Full Blood Count", "Urinalysis"],
    preventive: ["Routine health screening recommended"],
  },
};

const SOAP_TEMPLATES = [
  { name: "Malaria", subjective: "Patient presents with 3-day history of fever (38.6°C), severe headache, and generalized body weakness. No vomiting or convulsions.", objective: "Alert and oriented. Febrile (38.6°C). No jaundice or pallor noted. Abdomen soft, no hepatosplenomegaly.", assessment: "Malaria (P. falciparum) — pending RDT confirmation", plan: "1. Artemether-Lumefantrine 80/480mg BD × 3 days\n2. Paracetamol 500mg TDS × 3 days\n3. Malaria RDT today\n4. Return in 48h if no improvement\n5. Oral rehydration encouraged" },
  { name: "Hypertension", subjective: "Patient presents for routine BP check. Reports occasional headaches and dizziness. No chest pain or shortness of breath.", objective: "BP: 155/95 mmHg on two readings. Pulse 78 bpm regular. Heart sounds normal. No pedal oedema.", assessment: "Hypertension — Stage 2, uncontrolled", plan: "1. Amlodipine 5mg OD — continue\n2. Lifestyle modification counselling\n3. Low-salt diet advised\n4. Review in 2 weeks with repeat BP\n5. ECG if BP remains elevated" },
  { name: "Follow-Up", subjective: "Patient returns for follow-up. Reports improvement in symptoms since last visit. Medication compliance confirmed.", objective: "Afebrile. Vitals stable. Examination findings within normal limits.", assessment: "Improving — [update diagnosis]", plan: "1. Continue current medications\n2. [Add specific instructions]\n3. Next review in [timeframe]" },
];

// ─── Voice Engine ─────────────────────────────────────────────────────────────

const SPEECH_SUPPORTED =
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

/**
 * Start a single-shot speech recognition session.
 * Calls onResult(transcript) on success, onError() on failure/no-speech.
 * Returns a stop() function.
 */
function startRecognition({ onResult, onError, onEnd, continuous = false }) {
  if (!SPEECH_SUPPORTED) { onError?.("unsupported"); return () => {}; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r  = new SR();
  r.lang            = "en-GB";       // en-GB works better for Nigerian accents
  r.continuous      = true;          // Always continuous so it does not cut off early
  r.interimResults  = true;
  r.maxAlternatives = 3;

  let finalTranscript = "";
  let silenceTimer = null;

  const resetSilenceTimer = () => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (finalTranscript.trim()) onResult(finalTranscript.trim());
      try { r.stop(); } catch (_) {}
    }, 3000);
  };

  r.onstart = () => {
    finalTranscript = "";
    resetSilenceTimer();
  };

  r.onresult = e => {
    resetSilenceTimer();
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        finalTranscript += e.results[i][0].transcript + " ";
      }
    }
  };

  r.onerror = (e) => {
    clearTimeout(silenceTimer);
    if (e.error !== "no-speech") onError?.();
  };

  r.onend = () => {
    clearTimeout(silenceTimer);
    if (finalTranscript.trim()) onResult(finalTranscript.trim());
    onEnd?.();
  };

  r.start();
  return () => { clearTimeout(silenceTimer); try { r.stop(); } catch (_) {} };
}

/**
 * Ask Claude to parse a free-form dictation into SOAP fields.
 * Returns { subjective, objective, assessment, plan } or null on failure.
 */
async function parseDictationToSOAP(transcript, patient) {
  try {
    const res = await fetch("https://zrstwfjnkpfobsboprzs.supabase.co/functions/v1/claude-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpyc3R3Zmpua3Bmb2JzYm9wcnpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjAwNjgsImV4cCI6MjA4ODQzNjA2OH0.K7C2_ScRsysaemOsDyaF67Y--ONEJREAMJNFXtvBmVc", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpyc3R3Zmpua3Bmb2JzYm9wcnpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjAwNjgsImV4cCI6MjA4ODQzNjA2OH0.K7C2_ScRsysaemOsDyaF67Y--ONEJREAMJNFXtvBmVc" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1200,
        system: `You are a clinical note assistant for a Nigerian clinic EMR. Given a doctor's free-form dictation, extract and return a JSON object. Return ONLY valid JSON, no markdown, no explanation. Use Nigerian clinical guidelines and drug names.`,
        messages: [{
          role: "user",
          content: `Patient: ${patient?.name || "Unknown"}, ${patient?.age || "?"}yr ${patient?.sex || "?"}.
Chief complaint: ${patient?.visitReason || "Not specified"}.
Allergies: ${Array.isArray(patient?.allergies) ? patient.allergies.join(", ") : patient?.allergies || "None"}.

Doctor dictation: "${transcript}"

Return JSON with exactly these keys:
{
  "subjective": "Patient history and symptoms in clinical language",
  "objective": "Examination findings and vital signs",
  "assessment": "Diagnosis name",
  "icd_code": "ICD-10 code if identifiable, else empty string",
  "plan": "Numbered treatment plan",
  "prescriptions": [
    {
      "drug_name": "Generic drug name",
      "strength": "e.g. 500mg",
      "form": "Tablet/Capsule/Syrup/etc",
      "frequency": "e.g. BD, TDS, OD",
      "duration": "e.g. 5 days",
      "route": "Oral/IM/IV/Topical",
      "quantity": 10,
      "instructions": "e.g. Take with food"
    }
  ]
}

Only include prescriptions if drugs were mentioned. Use common Nigerian drugs (Artemether/Lumefantrine, Amoxicillin, Paracetamol, Metronidazole, etc).`,
        }],
      }),
    });
    const data = await res.json();
    const text = data.content?.find(b => b.type === "text")?.text || "";
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (_) {
    return null;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Pill({ children, color = "sage", onClick, removable, onRemove, size = "md" }) {
  const colors = {
    sage: { bg: "#E8F4F0", text: "#1E6B55", border: "rgba(30,107,85,0.25)" },
    amber: { bg: "#FEF3E2", text: "#E8860A", border: "rgba(232,134,10,0.25)" },
    rose: { bg: "#FDECEA", text: "#C0392B", border: "rgba(192,57,43,0.2)" },
    sky: { bg: "#E8F0FC", text: "#1A5FA8", border: "rgba(26,95,168,0.2)" },
    ink: { bg: "#0A0F1E", text: "#fff", border: "transparent" },
    muted: { bg: "#F0EDE8", text: "#6B7080", border: "#E0DCD4" },
  };
  const c = colors[color] || colors.sage;
  return (
    <span onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: size === "sm" ? "2px 8px" : "4px 11px",
      background: c.bg, color: c.text,
      border: `1px solid ${c.border}`,
      borderRadius: 20, fontSize: size === "sm" ? 10 : 11.5,
      fontWeight: 500, cursor: onClick ? "pointer" : "default",
      fontFamily: "'DM Sans', sans-serif",
      transition: "all 0.15s", margin: "2px 3px 2px 0",
      whiteSpace: "nowrap",
    }}>
      {children}
      {removable && (
        <span onClick={e => { e.stopPropagation(); onRemove?.(); }}
          style={{ fontSize: 10, opacity: 0.6, cursor: "pointer", marginLeft: 2 }}>✕</span>
      )}
    </span>
  );
}

function AiPanel({ suggestion, onAccept, onDismiss, loading }) {
  const [open, setOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("differentials");
  const [appliedDx, setAppliedDx] = useState(null);

  if (!open) return null;

  const riskColors = {
    Low: { color: "#4ADE80", bg: "rgba(74,222,128,0.1)", border: "rgba(74,222,128,0.3)" },
    Moderate: { color: "#FCD34D", bg: "rgba(252,211,77,0.1)", border: "rgba(252,211,77,0.3)" },
    High: { color: "#FB923C", bg: "rgba(251,146,60,0.1)", border: "rgba(251,146,60,0.3)" },
    Critical: { color: "#F87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.3)" },
  };
  const likelihoodColors = { High: "#4ADE80", Medium: "#FCD34D", Low: "#94A3B8" };
  const rc = riskColors[suggestion?.risk_level] || riskColors.Low;

  return (
    <div style={{
      background: "linear-gradient(135deg, #0A0F1E 0%, #0D1628 100%)",
      border: "1.5px solid rgba(30,107,85,0.4)",
      borderRadius: 14, overflow: "hidden", marginBottom: 20,
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "linear-gradient(135deg,#1E6B55,#27856A)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color: "#fff", flexShrink: 0,
        }}>✦</div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 13, color: "#fff" }}>
          Alera AI · Clinical Decision Support
        </div>
        {loading ? (
          <div style={{ marginLeft: "auto", fontSize: 11, color: "#27856A", fontFamily: "'JetBrains Mono',monospace", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#27856A", animation: "pulse 1s infinite" }} />
            Analyzing…
          </div>
        ) : (
          <>
            {suggestion?.risk_level && (
              <div style={{
                marginLeft: "auto", fontSize: 10, padding: "3px 10px", borderRadius: 20,
                background: rc.bg, color: rc.color, border: `1px solid ${rc.border}`,
                fontFamily: "'Syne',sans-serif", fontWeight: 700,
              }}>
                {suggestion.risk_level} Risk
              </div>
            )}
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "rgba(255,255,255,0.3)",
              cursor: "pointer", fontSize: 18, padding: "0 0 0 8px", lineHeight: 1,
            }}>✕</button>
          </>
        )}
      </div>

      {loading && (
        <div style={{ padding: "20px 18px", color: "rgba(255,255,255,0.4)", fontSize: 13, fontStyle: "italic" }}>
          Claude is analyzing symptoms and generating differential diagnoses…
        </div>
      )}

      {!loading && suggestion && (
        <>
          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 18px" }}>
            {[
              { key: "differentials", label: "Differentials" },
              { key: "tests", label: "Tests" },
              { key: "plan", label: "Treatment Plan" },
            ].map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                padding: "8px 14px", border: "none", background: "transparent",
                borderBottom: `2px solid ${activeTab === t.key ? "#27856A" : "transparent"}`,
                color: activeTab === t.key ? "#27856A" : "rgba(255,255,255,0.35)",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s",
              }}>{t.label}</button>
            ))}
            {suggestion.risk_reason && (
              <div style={{
                marginLeft: "auto", alignSelf: "center",
                fontSize: 11, color: rc.color, fontStyle: "italic",
                maxWidth: 200, textAlign: "right",
              }}>
                ⚠ {suggestion.risk_reason}
              </div>
            )}
          </div>

          {/* Differentials tab */}
          {activeTab === "differentials" && (
            <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
              {(suggestion.differentials || []).map((d, i) => (
                <div key={i} style={{
                  background: i === 0 ? "rgba(30,107,85,0.15)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${i === 0 ? "rgba(30,107,85,0.4)" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: 10, padding: "12px 14px",
                  transition: "all 0.15s",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
                      color: likelihoodColors[d.likelihood] || "#94A3B8",
                      background: `${likelihoodColors[d.likelihood]}22`,
                      padding: "2px 7px", borderRadius: 4,
                    }}>{d.likelihood || "?"}</span>
                    <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: "#fff" }}>{d.name}</span>
                    {d.icd && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono',monospace" }}>{d.icd}</span>}
                    <button
                      onClick={() => { onAccept("assessment", d.name); if (d.icd) onAccept("icd", d.icd); setAppliedDx(i); }}
                      style={{
                        marginLeft: "auto", padding: "3px 10px", borderRadius: 6,
                        border: `1px solid ${appliedDx === i ? "#27856A" : "rgba(30,107,85,0.4)"}`,
                        background: appliedDx === i ? "rgba(30,107,85,0.4)" : "rgba(30,107,85,0.15)",
                        color: "#27856A", fontSize: 11, fontWeight: 700, cursor: "pointer",
                        fontFamily: "'DM Sans',sans-serif",
                      }}
                    >{appliedDx === i ? "✓ Applied" : "Use"}</button>
                  </div>
                  {d.reasoning && (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 6, lineHeight: 1.5 }}>{d.reasoning}</div>
                  )}
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    {d.confirmatory_tests?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Confirm with</div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {d.confirmatory_tests.map((t, ti) => (
                            <span key={ti} style={{ fontSize: 10, padding: "2px 7px", background: "rgba(26,84,168,0.2)", color: "#5B9EE8", border: "1px solid rgba(26,84,168,0.3)", borderRadius: 4 }}>{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {d.red_flags?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Red flags</div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {d.red_flags.map((f, fi) => (
                            <span key={fi} style={{ fontSize: 10, padding: "2px 7px", background: "rgba(184,50,50,0.2)", color: "#F87171", border: "1px solid rgba(184,50,50,0.3)", borderRadius: 4 }}>⚠ {f}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 4, textAlign: "center", fontStyle: "italic" }}>
                AI suggestions — always verify clinically before applying
              </div>
            </div>
          )}

          {/* Tests tab */}
          {activeTab === "tests" && (
            <div style={{ padding: "14px 18px" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono',monospace", marginBottom: 10, letterSpacing: 0.8, textTransform: "uppercase" }}>
                Recommended Investigations
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(suggestion.recommended_tests || []).map((t, i) => (
                  <span key={i} style={{
                    padding: "6px 14px", borderRadius: 8,
                    background: "rgba(26,84,168,0.15)", color: "#5B9EE8",
                    border: "1px solid rgba(26,84,168,0.3)",
                    fontSize: 12, fontFamily: "'DM Sans',sans-serif",
                  }}>🔬 {t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Plan tab */}
          {activeTab === "plan" && (
            <div style={{ padding: "14px 18px" }}>
              {suggestion.treatment_suggestion && (
                <div style={{
                  background: "rgba(30,107,85,0.1)", border: "1px solid rgba(30,107,85,0.3)",
                  borderRadius: 8, padding: "10px 14px", marginBottom: 12,
                  fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6,
                }}>{suggestion.treatment_suggestion}</div>
              )}
              {suggestion.suggested_plan && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono',monospace", marginBottom: 8, letterSpacing: 0.8, textTransform: "uppercase" }}>Suggested Plan</div>
                  <div style={{
                    fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.8,
                    whiteSpace: "pre-line",
                  }}>{suggestion.suggested_plan}</div>
                </div>
              )}
              <button
                onClick={() => onAccept("plan", suggestion.suggested_plan)}
                style={{
                  padding: "8px 18px", borderRadius: 8,
                  background: "rgba(30,107,85,0.25)", color: "#27856A",
                  border: "1px solid rgba(30,107,85,0.4)",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif",
                }}
              >✓ Apply This Plan</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SOAPField({ label, fieldKey, value, onChange, onVoice, voiceActive, placeholder, rows = 4, icdCodes, onIcdClick }) {
  const icons = { subjective: "💬", objective: "🩺", assessment: "🧠", plan: "📋" };
  const colors = { subjective: "#1A5FA8", objective: "#1E6B55", assessment: "#E8860A", plan: "#6B4FA8" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          background: colors[fieldKey] + "22",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12,
        }}>{icons[fieldKey]}</div>
        <label style={{
          fontFamily: "'Syne',sans-serif", fontWeight: 700,
          fontSize: 12, color: "#0A0F1E", textTransform: "uppercase", letterSpacing: "0.5px",
        }}>{label}</label>
        <button onClick={() => onVoice(fieldKey)} style={{
          marginLeft: "auto",
          display: "flex", alignItems: "center", gap: 5,
          padding: "4px 10px",
          background: voiceActive === fieldKey ? "#E8860A" : "transparent",
          color: voiceActive === fieldKey ? "#fff" : "#E8860A",
          border: `1px solid ${voiceActive === fieldKey ? "#E8860A" : "rgba(232,134,10,0.35)"}`,
          borderRadius: 6, fontSize: 11, fontWeight: 600,
          cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
          transition: "all 0.2s",
          animation: voiceActive === fieldKey ? "voicePulse 1s infinite" : "none",
        }}>
          {voiceActive === fieldKey ? "🔴 Recording..." : "🎙 Dictate"}
        </button>
      </div>
      <div style={{ position: "relative" }}>
        <textarea
          value={value}
          onChange={e => onChange(fieldKey, e.target.value)}
          placeholder={placeholder}
          rows={rows}
          style={{
            width: "100%", padding: "12px 14px",
            border: `2px solid ${voiceActive === fieldKey ? colors[fieldKey] : "#E0DCD4"}`,
            borderRadius: 10, fontSize: 13.5,
            fontFamily: "'DM Sans', sans-serif", lineHeight: 1.65,
            background: voiceActive === fieldKey ? colors[fieldKey] + "08" : "#FDFCFA",
            color: "#0A0F1E", outline: "none", resize: "vertical",
            boxSizing: "border-box",
            transition: "border-color 0.2s, background 0.2s",
            boxShadow: voiceActive === fieldKey ? `0 0 0 3px ${colors[fieldKey]}22` : "none",
          }}
          onFocus={e => { if (voiceActive !== fieldKey) { e.target.style.borderColor = colors[fieldKey]; e.target.style.boxShadow = `0 0 0 3px ${colors[fieldKey]}18`; } }}
          onBlur={e => { if (voiceActive !== fieldKey) { e.target.style.borderColor = "#E0DCD4"; e.target.style.boxShadow = "none"; } }}
        />
        {value.length > 0 && (
          <div style={{
            position: "absolute", bottom: 8, right: 10,
            fontSize: 10, color: "#C0BAB0",
            fontFamily: "'JetBrains Mono',monospace",
          }}>{value.length} chars</div>
        )}
      </div>
      {/* ICD codes for assessment */}
      {fieldKey === "assessment" && icdCodes && icdCodes.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "#9A9890", fontFamily: "'JetBrains Mono',monospace", marginBottom: 5, letterSpacing: "0.5px" }}>ICD-10 MATCHES</div>
          <div>
            {icdCodes.map(c => (
              <span key={c.code} onClick={() => onIcdClick(c)} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 10px",
                background: "#F0EDE8", color: "#4A5060",
                border: "1px solid #E0DCD4",
                borderRadius: 5, fontSize: 11, cursor: "pointer",
                fontFamily: "'JetBrains Mono',monospace", margin: "2px 4px 2px 0",
                transition: "all 0.15s",
              }}
                onMouseEnter={e => { e.currentTarget.style.background = "#0A0F1E"; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#F0EDE8"; e.currentTarget.style.color = "#4A5060"; }}
              >
                {typeof c === "string" ? c : `${c.code} — ${c.label}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AleraClinicalNoteEditor({ patient, onComplete }) {
  const hasPatient = !!(patient?._db_id);
  if (!hasPatient) return <AleraPatientLookup screenName="Clinical Notes" screenIcon="📋" onSelect={p => onComplete?.({ _lookup: true, patient: p })} />;
  const { role, can } = useRole?.() || { role: "doctor", can: () => true };
  const { orgId, staffId } = useAuth();
  const canWrite    = can("canWriteNotes");
  const canSignOff  = can("canSignOffNote");
  const [activeTab, setActiveTab] = useState("soap");
  const [voiceActive, setVoiceActive] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [selectedIcd, setSelectedIcd] = useState(null);
  const [icdCodes, setIcdCodes] = useState([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSignOff, setShowSignOff] = useState(false);
  const [medHistory, setMedHistory] = useState({
    currentMeds: patient.nurseNotes ? `[Nurse notes: ${patient.nurseNotes}]` : "",
    pmh: "",
    familyHistory: "",
    socialHistory: "",
  });
  const [reconciledMeds, setReconciledMeds] = useState([]); // confirmed med list
  const [newMed, setNewMed] = useState("");
  const [ros, setRos] = useState({});
  const [labOrders, setLabOrders] = useState([]);
  const [followUp, setFollowUp] = useState({ weeks: "", instructions: "", referral: "" });
  const [noteTimer, setNoteTimer] = useState(0);
  const timerRef = useRef(null);

  const [soap, setSoap] = useState({
    subjective: "",
    objective: patient?.vitals ? `T: ${patient.vitals.temp}, BP: ${patient.vitals.bp}, Pulse: ${patient.vitals.pulse}, SpO2: ${patient.vitals.spo2}, Wt: ${patient.vitals.weight}` : "",
    assessment: "",
    plan: "",
  });

  const [tags, setTags] = useState([]);
  const [attachments, setAttachments] = useState([]);

  // Start timer on first keystroke
  useEffect(() => {
    const hasContent = Object.values(soap).some(v => v.length > (v === soap.objective ? 80 : 0));
    if (hasContent && !timerRef.current) {
      timerRef.current = setInterval(() => setNoteTimer(t => t + 1), 1000);
    }
    return () => {};
  }, [soap]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  // AI analysis on subjective change
  // Real Claude AI diagnosis assistant — debounced 1.5s after typing stops
  const aiTimerRef = useRef(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (soap.subjective.length < 20) { setAiSuggestion(null); setAiLoading(false); return; }
    clearTimeout(aiTimerRef.current);
    // Only show loading AFTER debounce fires, not during typing
    aiTimerRef.current = setTimeout(async () => {
      setAiLoading(true);
      setAiSuggestion(null);
      try {
        const vitals = patient.vitals || {};
        const prompt = `You are a clinical decision support assistant for a Nigerian doctor. Analyze the following and return ONLY valid JSON with no markdown.

Patient: ${patient.name || "Unknown"}, ${patient.age || "?"}, ${patient.sex || "?"}, Blood group: ${patient.blood || "?"}
Chief complaint / subjective: ${soap.subjective}
Objective findings: ${soap.objective || "Not yet recorded"}
Vitals: BP ${vitals.bp || "?"}, Temp ${vitals.temp || "?"}, Pulse ${vitals.pulse || "?"}, SpO2 ${vitals.spo2 || "?"}
Allergies: ${Array.isArray(patient.allergies) ? patient.allergies.join(", ") : patient.allergies || "None"}

Return JSON with exactly this structure:
{
  "differentials": [
    {
      "name": "Diagnosis name",
      "icd": "ICD-10 code",
      "likelihood": "High",
      "reasoning": "1-2 sentences why this fits",
      "red_flags": ["flag1"],
      "confirmatory_tests": ["test1"]
    }
  ],
  "recommended_tests": ["test1", "test2"],
  "treatment_suggestion": "First-line treatment based on Nigerian clinical guidelines",
  "suggested_plan": "1. Step one\n2. Step two\n3. Step three",
  "risk_level": "Low",
  "risk_reason": "Brief reason"
}

Provide 3-5 differentials ranked by likelihood. Be specific to Nigerian clinical context (malaria, typhoid, hypertension, diabetes, sickle cell, TB). Return ONLY the JSON object.`;

        const res = await fetch("https://zrstwfjnkpfobsboprzs.supabase.co/functions/v1/claude-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpyc3R3Zmpua3Bmb2JzYm9wcnpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjAwNjgsImV4cCI6MjA4ODQzNjA2OH0.K7C2_ScRsysaemOsDyaF67Y--ONEJREAMJNFXtvBmVc", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpyc3R3Zmpua3Bmb2JzYm9wcnpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjAwNjgsImV4cCI6MjA4ODQzNjA2OH0.K7C2_ScRsysaemOsDyaF67Y--ONEJREAMJNFXtvBmVc" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const data = await res.json();
        const text = data.content?.find(c => c.type === "text")?.text || "";
        const clean = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        console.log("[AleraAI] parsed:", JSON.stringify(parsed.differentials?.slice(0,2)));
        setAiSuggestion(parsed);
      } catch(e) {
        console.error("[AleraAI] Diagnosis assistant error:", e);
        setAiSuggestion(null);
      }
      setAiLoading(false);
    }, 2000);
    return () => clearTimeout(aiTimerRef.current);
  }, [soap.subjective, soap.objective]);

  // ICD-10 lookup on assessment change
  useEffect(() => {
    if (soap.assessment.length < 3) { setIcdCodes([]); return; }
    const lower = soap.assessment.toLowerCase();
    const matches = Object.entries(ICD10_MAP)
      .filter(([k]) => lower.includes(k))
      .flatMap(([, v]) => v);
    setIcdCodes(matches.slice(0, 5));
  }, [soap.assessment]);

  function setField(key, val) {
    setSoap(s => ({ ...s, [key]: val }));
  }

  function handleAiAccept(field, value) {
    if (field === "plan") {
      setSoap(s => ({ ...s, plan: value }));
    } else if (field === "icd") {
      // value is just the code string e.g. "R50.9" — wrap as object
      const icdObj = typeof value === "string" ? { code: value, label: value } : value;
      setSelectedIcd(icdObj);
      setIcdCodes(prev => {
        const exists = prev.some(c => (c.code || c) === (icdObj.code || icdObj));
        return exists ? prev : [icdObj, ...prev].slice(0, 5);
      });
    } else {
      setSoap(s => ({ ...s, assessment: value }));
    }
  }

  // ── Voice state ────────────────────────────────────────────────────────────
  const stopRecognitionRef = useRef(null);
  const [voiceError, setVoiceError] = useState(null);
  const [fullNoteListening, setFullNoteListening] = useState(false);
  const [fullNoteParsing,  setFullNoteParsing]  = useState(false);
  const [aiPrescriptions,  setAiPrescriptions]  = useState([]);

  // Dictate into a single SOAP field
  function handleVoice(field) {
    // If already recording this field — stop
    if (voiceActive === field) {
      stopRecognitionRef.current?.();
      stopRecognitionRef.current = null;
      setVoiceActive(null);
      return;
    }
    // If recording a different field — stop it first
    stopRecognitionRef.current?.();

    if (!SPEECH_SUPPORTED) {
      setVoiceError("Voice input isn't supported in this browser. Try Chrome or Edge.");
      return;
    }

    setVoiceActive(field);
    setVoiceError(null);

    stopRecognitionRef.current = startRecognition({
      onResult: transcript => {
        setSoap(s => ({
          ...s,
          [field]: s[field] ? s[field] + " " + transcript : transcript,
        }));
        setVoiceActive(null);
        stopRecognitionRef.current = null;
      },
      onError: () => {
        setVoiceActive(null);
        setVoiceError("Couldn't catch that. Tap the mic and try again.");
        stopRecognitionRef.current = null;
      },
      onEnd: () => {
        // onResult fires before onEnd — if we're still active here, nothing was heard
        setVoiceActive(prev => prev === field ? null : prev);
      },
    });
  }

  // Dictate the whole note in one go — Claude parses it into SOAP
  function handleFullNoteByVoice() {
    if (!SPEECH_SUPPORTED) {
      setVoiceError("Voice input isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    if (fullNoteListening) {
      stopRecognitionRef.current?.();
      stopRecognitionRef.current = null;
      setFullNoteListening(false);
      return;
    }

    setFullNoteListening(true);
    setVoiceError(null);

    stopRecognitionRef.current = startRecognition({
      continuous: true,   // keep recording until user taps stop
      onResult: async transcript => {
        setFullNoteListening(false);
        setFullNoteParsing(true);
        stopRecognitionRef.current = null;
        const parsed = await parseDictationToSOAP(transcript, patient);
        if (parsed) {
          setSoap(s => ({
            subjective: parsed.subjective || s.subjective,
            objective:  parsed.objective  || s.objective,
            assessment: parsed.assessment || s.assessment,
            plan:       parsed.plan       || s.plan,
          }));
          // Apply ICD code if returned
          if (parsed.icd_code) {
            setIcdCodes(prev => [parsed.icd_code, ...prev.filter(c => c !== parsed.icd_code)].slice(0, 5));
            setSelectedIcd(parsed.icd_code);
          }
          // Apply prescriptions if returned
          if (parsed.prescriptions?.length > 0) {
            setAiPrescriptions(parsed.prescriptions);
          }
        } else {
          // Fallback: drop full transcript into subjective
          setSoap(s => ({ ...s, subjective: s.subjective ? s.subjective + " " + transcript : transcript }));
          setVoiceError("Couldn't parse into SOAP — transcript added to Subjective.");
        }
        setFullNoteParsing(false);
      },
      onError: () => {
        setFullNoteListening(false);
        setFullNoteParsing(false);
        setVoiceError("Couldn't hear anything. Please try again.");
        stopRecognitionRef.current = null;
      },
      onEnd: () => {
        setFullNoteListening(false);
      },
    });
  }

  // Clean up on unmount
  useEffect(() => () => stopRecognitionRef.current?.(), []);

  function applyTemplate(t) {
    setSoap({ subjective: t.subjective, objective: soap.objective, assessment: t.assessment, plan: t.plan });
    setActiveTab("soap");
  }

  async function handleSave() {
    setSaving(true);
    clearInterval(timerRef.current);
    try {
      // Persist to Supabase if we have context IDs
      if (orgId && patient?._encounter_id && patient?._db_id) {
        const { data: note, error } = await saveNote(
          patient._encounter_id,
          patient._db_id,
          orgId,
          staffId,
          { subjective: soap.subjective, objective: soap.objective, assessment: soap.assessment, plan: soap.plan, signed: true },
        );
        if (error) console.error("[Alera Notes] Save error:", error.message);

        // Save diagnoses if assessment has content
        if (soap.assessment?.trim()) {
          const diagList = soap.assessment
            .split(/[,;\n]/)
            .map(d => d.trim())
            .filter(Boolean)
            .map((name, i) => ({ name, diagnosis_type: i === 0 ? "primary" : "secondary", certainty: "confirmed" }));
          await saveDiagnoses(patient._encounter_id, patient._db_id, orgId, staffId, diagList);
        }
      }
    } catch (err) {
      console.error("[Alera Notes] Unexpected error:", err);
    }
    setSaving(false);
    setSaved(true);
    onComplete?.({ soap, diagnosis: soap.assessment, icdCodes });
  }

  function addTag(tag) {
    if (!tags.includes(tag)) setTags(t => [...t, tag]);
  }

  const wordCount = Object.values(soap).join(" ").split(/\s+/).filter(Boolean).length;
  const isComplete = soap.subjective.length > 10 && soap.assessment.length > 3 && soap.plan.length > 10;

  const s = {
    card: {
      background: "#fff", borderRadius: 14,
      border: "1.5px solid #E0DCD4",
      boxShadow: "0 2px 12px rgba(10,15,30,0.06), 0 1px 4px rgba(10,15,30,0.04)",
    },
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#F5F2EC", fontFamily: "'DM Sans',sans-serif", color: "#0A0F1E" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: rgba(30,107,85,0.2); }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #D8D4CC; border-radius: 4px; }
        @keyframes slideIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes voicePulse { 0%,100%{box-shadow:0 0 0 0 rgba(232,134,10,0.5)} 50%{box-shadow:0 0 0 8px rgba(232,134,10,0)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes saveCheck { 0%{transform:scale(0) rotate(-10deg)} 70%{transform:scale(1.15) rotate(3deg)} 100%{transform:scale(1) rotate(0deg)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: "#0A0F1E", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: "#fff", letterSpacing: -0.5 }}>
            al<span style={{ color: "#27856A" }}>era</span>
          </div>
          <div style={{ width: 1, height: 20, background: "#1A2040" }} />
          <div style={{ fontSize: 12, color: "#5A6580" }}>Clinical Note Editor</div>
          <div style={{ fontSize: 12, color: "#2A3050" }}>›</div>
          <div style={{ fontSize: 12, color: "#7A8290" }}>{patient?.name}</div>
          <div style={{ fontSize: 12, color: "#2A3050" }}>›</div>
          <div style={{ fontSize: 12, color: "#27856A", fontFamily: "'JetBrains Mono',monospace" }}>{patient?.id}</div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {noteTimer > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: noteTimer < 20 ? "#27856A" : noteTimer < 40 ? "#E8860A" : "#E07060", fontFamily: "'JetBrains Mono',monospace" }}>
              ⏱ {noteTimer}s
            </div>
          )}
          <div style={{ fontSize: 11, color: "#3A4060", fontFamily: "'JetBrains Mono',monospace" }}>{wordCount} words</div>
          {["✦ AI", "🎙 VOICE", "● SYNC"].map((b, i) => (
            <span key={i} style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
              padding: "3px 8px", borderRadius: 4,
              background: ["rgba(30,107,85,0.15)", "rgba(232,134,10,0.15)", "rgba(30,107,85,0.1)"][i],
              color: ["#27856A", "#E8860A", "#3A7060"][i],
              border: `1px solid ${["rgba(30,107,85,0.3)", "rgba(232,134,10,0.3)", "rgba(30,107,85,0.2)"][i]}`,
            }}>{b}</span>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 0, maxHeight: "calc(100vh - 58px)" }}>

        {/* ── Left: Note editor ── */}
        <div style={{ padding: "28px 24px 28px 28px", overflowY: "auto", animation: "fadeIn 0.3s ease" }}>

          {/* Patient + vitals strip */}
          <div style={{ ...s.card, marginBottom: 20, overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(135deg,#0A0F1E,#101830)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#1E6B55", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                {(patient?.name || "").split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: "#fff" }}>{patient?.name}</div>
                <div style={{ display: "flex", gap: 10, marginTop: 3, flexWrap: "wrap" }}>
                  {[`${patient?.age}yrs`, patient?.sex, patient?.blood, `Allergies: ${patient?.allergies}`, patient?.insurance].map((m, i) => (
                    <span key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.07)", padding: "1px 7px", borderRadius: 4 }}>{m}</span>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {Object.entries(patient?.vitals || {}).map(([k, v]) => {
                  const isWarn = (k === "temp" && parseFloat(v) >= 38);
                  return (
                    <div key={k} style={{ textAlign: "center", background: "rgba(255,255,255,0.05)", padding: "6px 10px", borderRadius: 8, border: `1px solid ${isWarn ? "rgba(232,134,10,0.4)" : "rgba(255,255,255,0.08)"}` }}>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono',monospace", textTransform: "uppercase" }}>{k}</div>
                      <div style={{ fontSize: 13, fontFamily: "'Syne',sans-serif", fontWeight: 700, color: isWarn ? "#E8A03A" : "#fff" }}>{v.split(" ")[0]}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, marginBottom: 20, background: "#fff", borderRadius: 10, padding: 4, border: "1.5px solid #E0DCD4", flexWrap: "wrap" }}>
            {[
              { key: "soap",    label: "📋 SOAP Note" },
              { key: "history", label: "🏥 Medical History" },
              { key: "ros",     label: "🔍 Review of Systems" },
              { key: "labs",    label: "🔬 Lab Orders" },
              { key: "followup",label: "📅 Follow-Up" },
              { key: "templates", label: "⚡ Templates" },
            ].map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                padding: "8px 16px", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: activeTab === t.key ? "#0A0F1E" : "transparent",
                color: activeTab === t.key ? "#fff" : "#6B7080",
                cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                transition: "all 0.15s", whiteSpace: "nowrap",
              }}>{t.label}</button>
            ))}
          </div>

          {/* ── SOAP Tab ── */}
          {activeTab === "soap" && (
            <div style={{ animation: "slideIn 0.25s ease" }}>

              {/* AI Voice Hero Banner */}
              <div style={{
                background: fullNoteListening
                  ? "linear-gradient(135deg,#7C0000,#B80000)"
                  : "linear-gradient(135deg,#0D1117,#1A2636)",
                borderRadius: 12, padding: "16px 20px", marginBottom: 16,
                display: "flex", alignItems: "center", gap: 16,
                border: fullNoteListening ? "1.5px solid rgba(255,80,80,0.4)" : "1.5px solid rgba(30,107,85,0.3)",
                transition: "all 0.3s",
              }}>
                <button
                  onClick={handleFullNoteByVoice}
                  style={{
                    width: 56, height: 56, borderRadius: "50%",
                    background: fullNoteListening ? "rgba(255,80,80,0.3)" : "rgba(30,107,85,0.25)",
                    cursor: fullNoteParsing ? "default" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 24, flexShrink: 0, transition: "all 0.2s",
                    animation: fullNoteListening ? "voicePulse 1s infinite" : "none",
                    border: `1.5px solid ${fullNoteListening ? "rgba(255,80,80,0.5)" : "rgba(30,107,85,0.4)"}`,
                  }}
                >
                  {fullNoteListening ? "🔴" : fullNoteParsing ? "⏳" : "🎙"}
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 3 }}>
                    {fullNoteListening
                      ? "Listening… speak your full clinical note"
                      : fullNoteParsing
                      ? "Claude is parsing your dictation…"
                      : "AI Voice-First Documentation"}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                    {fullNoteListening
                      ? "Say diagnosis, vitals, symptoms, and drugs. Tap the mic to stop."
                      : fullNoteParsing
                      ? "Filling SOAP note, ICD codes, and prescription automatically…"
                      : "Tap 🎙 and dictate the full encounter. Claude fills all fields including prescription."}
                  </div>
                </div>
                {fullNoteListening && (
                  <div style={{ fontSize: 11, color: "rgba(255,80,80,0.8)", fontFamily: "'JetBrains Mono',monospace" }}>
                    ● REC
                  </div>
                )}
              </div>

              {/* AI Prescriptions from voice */}
              {aiPrescriptions.length > 0 && (
                <div style={{
                  background: "rgba(94,63,174,0.08)", border: "1.5px solid rgba(94,63,174,0.25)",
                  borderRadius: 10, padding: "14px 16px", marginBottom: 16,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 14 }}>💊</span>
                    <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: "#5E3FAE" }}>
                      AI Generated Prescription ({aiPrescriptions.length} drug{aiPrescriptions.length > 1 ? "s" : ""})
                    </span>
                    <button onClick={() => setAiPrescriptions([])} style={{ marginLeft: "auto", background: "none", border: "none", color: "#5E3FAE", cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                  {aiPrescriptions.map((rx, i) => (
                    <div key={i} style={{
                      background: "#fff", border: "1px solid rgba(94,63,174,0.15)",
                      borderRadius: 8, padding: "10px 12px", marginBottom: 6,
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0D1117" }}>
                          {rx.drug_name} {rx.strength && <span style={{ fontWeight: 400, color: "#6E7891" }}>· {rx.strength}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "#6E7891" }}>
                          {[rx.form, rx.frequency, rx.duration, rx.route].filter(Boolean).join(" · ")}
                          {rx.instructions ? " · " + rx.instructions : ""}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: "#5E3FAE", fontWeight: 700, background: "#F0EBFF", padding: "2px 8px", borderRadius: 10 }}>
                        Qty: {rx.quantity || "??"}
                      </div>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: "#5E3FAE", marginTop: 6, fontStyle: "italic" }}>
                    ✓ Prescription will be pre-filled when you proceed to the prescription screen
                  </div>
                </div>
              )}

              {/* AI Panel */}
              {(aiLoading || aiSuggestion) && (
                <AiPanel
                  key={aiLoading ? "loading" : "loaded"}
                  suggestion={aiSuggestion}
                  loading={aiLoading}
                  onAccept={handleAiAccept}
                  onDismiss={() => { setAiSuggestion(null); setAiLoading(false); }}
                />
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <SOAPField
                  label="Subjective — Chief Complaint & History"
                  fieldKey="subjective"
                  value={soap.subjective}
                  onChange={setField}
                  onVoice={handleVoice}
                  voiceActive={voiceActive}
                  placeholder="Patient presents with... (type or tap 🎙 to dictate)"
                  rows={4}
                />
                <SOAPField
                  label="Objective — Examination Findings"
                  fieldKey="objective"
                  value={soap.objective}
                  onChange={setField}
                  onVoice={handleVoice}
                  voiceActive={voiceActive}
                  placeholder="Vital signs and examination findings..."
                  rows={3}
                />
                <SOAPField
                  label="Assessment — Diagnosis"
                  fieldKey="assessment"
                  value={soap.assessment}
                  onChange={setField}
                  onVoice={handleVoice}
                  voiceActive={voiceActive}
                  placeholder="Diagnosis or clinical impression..."
                  rows={2}
                  icdCodes={icdCodes}
                  onIcdClick={c => {
                    setSelectedIcd(c);
                    // Only set assessment text if empty — never append ICD code into text
                    if (!soap.assessment) setField("assessment", c.label);
                  }}
                />
                <SOAPField
                  label="Plan — Treatment & Instructions"
                  fieldKey="plan"
                  value={soap.plan}
                  onChange={setField}
                  onVoice={handleVoice}
                  voiceActive={voiceActive}
                  placeholder="Treatment plan, medications, follow-up..."
                  rows={5}
                />
              </div>

              {/* Tags */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 10, color: "#9A9890", fontFamily: "'JetBrains Mono',monospace", marginBottom: 8, letterSpacing: "0.5px" }}>NOTE TAGS</div>
                <div>
                  {["Malaria", "Fever", "Antibiotics", "Follow-up 48h", "RDT ordered", "Preventive care", "Paediatric risk"].map(t => (
                    <Pill key={t} color={tags.includes(t) ? "ink" : "muted"} onClick={() => tags.includes(t) ? setTags(ts => ts.filter(x => x !== t)) : addTag(t)}>
                      {tags.includes(t) ? "✓ " : "+ "}{t}
                    </Pill>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Templates Tab ── */}
          {activeTab === "templates" && (
            <div style={{ animation: "slideIn 0.25s ease", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 13, color: "#6B7080", marginBottom: 4 }}>Apply a template to auto-fill all SOAP fields instantly.</div>
              {SOAP_TEMPLATES.map(t => (
                <div key={t.name} style={{
                  ...s.card, padding: "18px 20px", cursor: "pointer",
                  transition: "all 0.2s",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#1E6B55"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(30,107,85,0.12)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#E0DCD4"; e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
                  onClick={() => applyTemplate(t)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14 }}>{t.name} Template</div>
                    <span style={{ marginLeft: "auto", fontSize: 11, padding: "3px 9px", background: "#E8F4F0", color: "#1E6B55", borderRadius: 5, fontFamily: "'JetBrains Mono',monospace" }}>⚡ 1-click fill</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7080", lineHeight: 1.55 }}>{t.subjective.slice(0, 100)}…</div>
                </div>
              ))}
            </div>
          )}

          {/* ── History Tab ── */}
          {/* ── Medical History Tab ── */}
          {activeTab === "history" && (
            <div style={{ animation: "slideIn 0.25s ease", display: "flex", flexDirection: "column", gap: 16 }}>

              {/* ── MedRec Panel ── */}
              <div style={{ background: "#F0EBFF", border: "1px solid rgba(94,63,174,0.2)", borderRadius: 10, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>💊</span>
                  <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 13, color: "#5E3FAE" }}>MEDICATION RECONCILIATION</span>
                  {reconciledMeds.length > 0 && (
                    <span style={{ marginLeft: "auto", fontSize: 11, padding: "2px 8px", background: "#5E3FAE", color: "#fff", borderRadius: 10, fontWeight: 700 }}>
                      {reconciledMeds.length} confirmed
                    </span>
                  )}
                </div>

                {/* Nurse-recorded allergies */}
                {patient.allergies?.length > 0 && (
                  <div style={{ marginBottom: 10, padding: "8px 12px", background: "#FDECEA", border: "1px solid rgba(184,50,50,0.2)", borderRadius: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#B83232" }}>⚠ Allergies (nurse-recorded): </span>
                    <span style={{ fontSize: 12, color: "#3D4558" }}>
                      {patient.allergies.map(a => typeof a === "string" ? a : a.allergen).join(", ")}
                    </span>
                  </div>
                )}

                {/* Pain scale from triage */}
                {patient.painScale !== null && patient.painScale !== undefined && (
                  <div style={{ marginBottom: 10, padding: "8px 12px", background: "#fff", border: "1px solid rgba(94,63,174,0.15)", borderRadius: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#5E3FAE" }}>Pain Score (triage): </span>
                    <span style={{ fontSize: 12, color: "#3D4558" }}>{patient.painScale}/10 — {patient.painScale <= 3 ? "Mild" : patient.painScale <= 6 ? "Moderate" : "Severe"}</span>
                  </div>
                )}

                {/* Confirmed med list */}
                {reconciledMeds.length > 0 && (
                  <div style={{ marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {reconciledMeds.map((med, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "4px 10px", background: "#fff",
                        border: "1px solid rgba(94,63,174,0.3)", borderRadius: 20,
                        fontSize: 12, color: "#5E3FAE",
                      }}>
                        <span>✓ {med}</span>
                        <button onClick={() => setReconciledMeds(m => m.filter((_, j) => j !== i))} style={{
                          background: "none", border: "none", color: "#5E3FAE", cursor: "pointer", fontSize: 14, padding: 0,
                        }}>×</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add medication */}
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={newMed}
                    onChange={e => setNewMed(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && newMed.trim()) { setReconciledMeds(m => [...m, newMed.trim()]); setNewMed(""); } }}
                    placeholder="Add confirmed medication (e.g. Amlodipine 5mg OD)..."
                    style={{
                      flex: 1, padding: "8px 12px", border: "1px solid rgba(94,63,174,0.2)",
                      borderRadius: 8, fontSize: 12, fontFamily: "'DM Sans',sans-serif",
                      outline: "none", background: "#fff",
                    }}
                  />
                  <button onClick={() => { if (newMed.trim()) { setReconciledMeds(m => [...m, newMed.trim()]); setNewMed(""); } }} style={{
                    padding: "8px 14px", background: "#5E3FAE", color: "#fff", border: "none",
                    borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    fontFamily: "'Syne',sans-serif",
                  }}>+ Add</button>
                </div>
                <div style={{ fontSize: 11, color: "#8B7AB8", marginTop: 6 }}>
                  Add each current medication the patient is taking. This will be compared against new prescriptions.
                </div>
              </div>

              {[
                { key: "currentMeds", label: "Current Medications (Free Text)", placeholder: "List all current medications, doses, and frequency..." },
                { key: "pmh", label: "Past Medical History", placeholder: "Previous diagnoses, surgeries, hospitalizations, chronic conditions..." },
                { key: "familyHistory", label: "Family History", placeholder: "Relevant family medical conditions (e.g. diabetes, hypertension, cancer)..." },
                { key: "socialHistory", label: "Social History", placeholder: "Smoking, alcohol, occupation, living situation..." },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
                  <textarea
                    value={medHistory[key]}
                    onChange={e => setMedHistory(h => ({ ...h, [key]: e.target.value }))}
                    placeholder={placeholder}
                    rows={3}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: 8,
                      border: "1.5px solid #E0DCD4", fontSize: 13, color: "#0D1117",
                      fontFamily: "'DM Sans',sans-serif", resize: "vertical",
                      outline: "none", boxSizing: "border-box",
                    }}
                    onFocus={e => e.target.style.borderColor = "#1E6B55"}
                    onBlur={e => e.target.style.borderColor = "#E0DCD4"}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── Review of Systems Tab ── */}
          {activeTab === "ros" && (
            <div style={{ animation: "slideIn 0.25s ease" }}>
              <div style={{ fontSize: 13, color: "#6B7080", marginBottom: 16 }}>
                Check all systems reviewed. Mark positive findings.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  "Constitutional (fever, weight loss, fatigue)",
                  "Cardiovascular (chest pain, palpitations, edema)",
                  "Respiratory (cough, SOB, wheezing)",
                  "GI (nausea, vomiting, diarrhea, abdominal pain)",
                  "GU (dysuria, frequency, discharge)",
                  "Musculoskeletal (joint pain, swelling, weakness)",
                  "Neurological (headache, dizziness, numbness)",
                  "Skin (rash, itching, wounds)",
                  "EENT (eye pain, hearing, sore throat)",
                  "Psychiatric (anxiety, depression, sleep)",
                  "Endocrine (thirst, heat/cold intolerance)",
                  "Hematologic (bleeding, bruising, lymph nodes)",
                ].map(system => {
                  const val = ros[system];
                  return (
                    <div key={system} style={{
                      padding: "10px 12px", background: val === "positive" ? "#FEF5E7" : val === "negative" ? "#E6F3EE" : "#F7F5F1",
                      borderRadius: 8, border: `1px solid ${val === "positive" ? "#C97A10" : val === "negative" ? "#1A6650" : "#E8E4DE"}`,
                    }}>
                      <div style={{ fontSize: 12, color: "#3D4558", marginBottom: 6, lineHeight: 1.4 }}>{system}</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {["negative", "positive", "not reviewed"].map(opt => (
                          <button key={opt} onClick={() => setRos(r => ({ ...r, [system]: opt }))} style={{
                            padding: "3px 8px", borderRadius: 4, border: "none", fontSize: 10, fontWeight: 700,
                            cursor: "pointer", fontFamily: "'Syne',sans-serif",
                            background: val === opt ? (opt === "positive" ? "#C97A10" : opt === "negative" ? "#1A6650" : "#6E7891") : "#E8E4DE",
                            color: val === opt ? "#fff" : "#6E7891",
                          }}>{opt === "not reviewed" ? "N/R" : opt.charAt(0).toUpperCase() + opt.slice(1)}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Lab Orders Tab ── */}
          {activeTab === "labs" && (
            <div style={{ animation: "slideIn 0.25s ease" }}>
              <div style={{ fontSize: 13, color: "#6B7080", marginBottom: 16 }}>Order investigations for this patient</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                {[
                  "FBC", "MP (Malaria Parasite)", "Widal Test", "Blood Culture",
                  "LFT", "RFT", "Fasting Blood Sugar", "HbA1c",
                  "Lipid Profile", "Thyroid Function", "Urine MCS", "Stool MCS",
                  "ECG", "Chest X-Ray", "Abdominal USS", "HIV Screening",
                  "Hepatitis B", "Hepatitis C", "Genotype", "Pregnancy Test",
                  "PT/INR", "ESR", "CRP", "CD4 Count",
                ].map(test => {
                  const ordered = labOrders.includes(test);
                  return (
                    <button key={test} onClick={() => setLabOrders(l => ordered ? l.filter(t => t !== test) : [...l, test])} style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                      border: `1.5px solid ${ordered ? "#1A6650" : "#E8E4DE"}`,
                      background: ordered ? "#E6F3EE" : "#fff",
                      color: ordered ? "#1A6650" : "#6E7891",
                      cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                      transition: "all 0.12s",
                    }}>
                      {ordered ? "✓ " : ""}{test}
                    </button>
                  );
                })}
              </div>
              {labOrders.length > 0 && (
                <div style={{ padding: "12px 16px", background: "#E6F3EE", border: "1px solid rgba(26,102,80,0.2)", borderRadius: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1A6650", marginBottom: 6 }}>
                    {labOrders.length} test{labOrders.length > 1 ? "s" : ""} ordered
                  </div>
                  <div style={{ fontSize: 13, color: "#3D4558" }}>{labOrders.join(" · ")}</div>
                </div>
              )}
            </div>
          )}

          {/* ── Follow-Up Tab ── */}
          {activeTab === "followup" && (
            <div style={{ animation: "slideIn 0.25s ease", display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                  Follow-Up Timeline
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {["1 week", "2 weeks", "1 month", "3 months", "6 months", "As needed", "No follow-up"].map(opt => (
                    <button key={opt} onClick={() => setFollowUp(f => ({ ...f, weeks: opt }))} style={{
                      padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                      border: `1.5px solid ${followUp.weeks === opt ? "#1A6650" : "#E8E4DE"}`,
                      background: followUp.weeks === opt ? "#E6F3EE" : "#fff",
                      color: followUp.weeks === opt ? "#1A6650" : "#6E7891",
                      cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                    }}>{opt}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                  Follow-Up Instructions
                </div>
                <textarea
                  value={followUp.instructions}
                  onChange={e => setFollowUp(f => ({ ...f, instructions: e.target.value }))}
                  placeholder="Instructions for the patient at next visit..."
                  rows={3}
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 8,
                    border: "1.5px solid #E0DCD4", fontSize: 13, fontFamily: "'DM Sans',sans-serif",
                    resize: "vertical", outline: "none", boxSizing: "border-box",
                  }}
                  onFocus={e => e.target.style.borderColor = "#1E6B55"}
                  onBlur={e => e.target.style.borderColor = "#E0DCD4"}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                  Referral (if needed)
                </div>
                <input
                  value={followUp.referral}
                  onChange={e => setFollowUp(f => ({ ...f, referral: e.target.value }))}
                  placeholder="e.g. Refer to cardiologist, Refer to physiotherapy..."
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 8,
                    border: "1.5px solid #E0DCD4", fontSize: 13, fontFamily: "'DM Sans',sans-serif",
                    outline: "none", boxSizing: "border-box",
                  }}
                  onFocus={e => e.target.style.borderColor = "#1E6B55"}
                  onBlur={e => e.target.style.borderColor = "#E0DCD4"}
                />
              </div>
              {(followUp.weeks || followUp.instructions || followUp.referral) && (
                <div style={{ padding: "12px 16px", background: "#E6F3EE", border: "1px solid rgba(26,102,80,0.2)", borderRadius: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1A6650", marginBottom: 4 }}>Follow-Up Plan</div>
                  {followUp.weeks && <div style={{ fontSize: 13, color: "#3D4558" }}>Return in: <strong>{followUp.weeks}</strong></div>}
                  {followUp.referral && <div style={{ fontSize: 13, color: "#3D4558", marginTop: 2 }}>Referral: <strong>{followUp.referral}</strong></div>}
                </div>
              )}
              {followUp.weeks && (
                <button
                  onClick={() => onComplete?.({ _bookAppointment: true, patient, followUp })}
                  style={{
                    padding: "10px 20px", background: "#1A6650", color: "#fff",
                    border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700,
                    cursor: "pointer", fontFamily: "'Syne',sans-serif",
                    display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  📅 Book Follow-Up Appointment →
                </button>
              )}
            </div>
          )}

          {/* ── Action Bar ── */}
          <div style={{ display: "flex", gap: 10, marginTop: 24, alignItems: "center" }}>
            {saved ? (
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "12px 20px", background: "#E8F4F0",
                border: "1.5px solid rgba(30,107,85,0.3)", borderRadius: 10,
                animation: "saveCheck 0.4s cubic-bezier(0.34,1.56,0.64,1)",
              }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, color: "#1E6B55" }}>Note saved</span>
                <button
                  onClick={() => setShowSignOff(true)}
                  style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#1E6B55", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Syne',sans-serif" }}
                >Sign Off & Discharge Patient →</button>
              </div>
            ) : (
              <>
                <button
                  onClick={handleSave}
                  disabled={!isComplete || saving || !canSignOff}
                  title={!canSignOff ? "Only doctors can sign off clinical notes" : ""}
                  style={{
                    padding: "12px 28px", borderRadius: 10, border: "none",
                    background: isComplete && canSignOff ? "#1E6B55" : "#C8C4BC",
                    color: "#fff", fontSize: 14, fontWeight: 700,
                    cursor: isComplete && canSignOff ? "pointer" : "not-allowed",
                    fontFamily: "'Syne',sans-serif",
                    boxShadow: isComplete && canSignOff ? "0 4px 16px rgba(30,107,85,0.3)" : "none",
                    transition: "all 0.2s",
                    display: "flex", alignItems: "center", gap: 8,
                  }}
                  onMouseEnter={e => { if (isComplete && canSignOff) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(30,107,85,0.4)"; } }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = isComplete && canSignOff ? "0 4px 16px rgba(30,107,85,0.3)" : "none"; }}
                >
                  {saving ? (
                    <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                  ) : "✓"} {canSignOff ? "Save Note" : "Sign-off requires Doctor"}
                </button>
                <button style={{
                  padding: "12px 18px", borderRadius: 10,
                  border: "1.5px solid #E0DCD4", background: "transparent",
                  color: "#6B7080", fontSize: 13.5, fontWeight: 500, cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#E8860A"; e.currentTarget.style.color = "#E8860A"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#E0DCD4"; e.currentTarget.style.color = "#6B7080"; }}
                  onClick={() => handleFullNoteByVoice()}
                >🎙 {fullNoteListening ? "🔴 Tap to stop…" : fullNoteParsing ? "⏳ Parsing…" : "Full note by voice"}</button>
                <button style={{
                  padding: "12px 18px", borderRadius: 10,
                  border: "1.5px solid #E0DCD4", background: "transparent",
                  color: "#6B7080", fontSize: 13.5, cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#1A5FA8"; e.currentTarget.style.color = "#1A5FA8"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#E0DCD4"; e.currentTarget.style.color = "#6B7080"; }}
                  onClick={() => setActiveTab("templates")}
                >⚡ Apply template</button>
                {!isComplete && (
                  <div style={{ fontSize: 11, color: "#C0B8B0", fontFamily: "'JetBrains Mono',monospace", marginLeft: 4 }}>
                    Complete S, A, P to save
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div style={{ background: "#0A0F1E", borderLeft: "1px solid #1A2040", padding: "24px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Note completeness */}
          <div>
            <div style={{ fontSize: 10, color: "#3A4060", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 12 }}>Note Status</div>
            {[
              { key: "subjective", label: "Subjective", done: soap.subjective.length > 10 },
              { key: "objective", label: "Objective", done: soap.objective.length > 20 },
              { key: "assessment", label: "Assessment", done: soap.assessment.length > 3 },
              { key: "plan", label: "Plan", done: soap.plan.length > 10 },
            ].map(f => (
              <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid #1A2040" }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: f.done ? "#1E6B55" : "#1A2040",
                  border: `2px solid ${f.done ? "#1E6B55" : "#2A3050"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, color: "#fff", flexShrink: 0,
                  transition: "all 0.3s",
                }}>{f.done ? "✓" : ""}</div>
                <div style={{ fontSize: 12.5, color: f.done ? "rgba(255,255,255,0.7)" : "#3A4060" }}>{f.label}</div>
                {f.done && <div style={{ marginLeft: "auto", fontSize: 10, color: "#1E6B55" }}>✓</div>}
              </div>
            ))}
            <div style={{ marginTop: 12, height: 4, background: "#1A2040", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2,
                background: "linear-gradient(90deg,#1E6B55,#27856A)",
                width: `${([soap.subjective.length > 10, soap.objective.length > 20, soap.assessment.length > 3, soap.plan.length > 10].filter(Boolean).length / 4) * 100}%`,
                transition: "width 0.4s ease",
              }} />
            </div>
          </div>

          {/* ICD code */}
          {selectedIcd && (
            <div>
              <div style={{ fontSize: 10, color: "#3A4060", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>ICD-10 Selected</div>
              <div style={{ background: "#101828", borderRadius: 10, padding: "12px 14px", border: "1px solid #1A2A40" }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 600, color: "#27856A", marginBottom: 3 }}>{typeof selectedIcd === "string" ? selectedIcd : selectedIcd.code}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{typeof selectedIcd === "string" ? "" : selectedIcd.label}</div>
              </div>
            </div>
          )}

          {/* Patient history */}
          <div>
            <div style={{ fontSize: 10, color: "#3A4060", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Past Encounters</div>
            {(patient?.history || []).map((h, i) => (
              <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid #1A2040", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                {h}
              </div>
            ))}
          </div>

          {/* Active tags */}
          {tags.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: "#3A4060", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Active Tags</div>
              <div>
                {tags.map(t => (
                  <span key={t} style={{
                    display: "inline-block", margin: "2px 3px 2px 0",
                    padding: "3px 9px", background: "rgba(30,107,85,0.2)",
                    color: "#27856A", border: "1px solid rgba(30,107,85,0.3)",
                    borderRadius: 5, fontSize: 11,
                    fontFamily: "'JetBrains Mono',monospace",
                  }}>{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Voice status */}
          {(voiceActive || fullNoteListening || fullNoteParsing || voiceError) && (
            <div style={{
              padding: "14px",
              background: voiceError
                ? "rgba(192,57,43,0.1)"
                : fullNoteParsing
                ? "rgba(26,95,168,0.1)"
                : "rgba(232,134,10,0.1)",
              border: `1px solid ${voiceError ? "rgba(192,57,43,0.3)" : fullNoteParsing ? "rgba(26,95,168,0.3)" : "rgba(232,134,10,0.3)"}`,
              borderRadius: 10, textAlign: "center",
              animation: (voiceActive || fullNoteListening) ? "pulse 1s infinite" : "none",
            }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>
                {voiceError ? "⚠️" : fullNoteParsing ? "✦" : "🎙"}
              </div>
              <div style={{
                fontSize: 12,
                color: voiceError ? "#C0392B" : fullNoteParsing ? "#1A5FA8" : "#E8A03A",
                fontFamily: "'JetBrains Mono',monospace",
                lineHeight: 1.5,
              }}>
                {voiceError
                  ? voiceError
                  : fullNoteParsing
                  ? "AI parsing dictation…"
                  : fullNoteListening
                  ? "Listening — speak your full note\nthen tap stop"
                  : `Listening · ${voiceActive}`}
              </div>
              {voiceError && (
                <button onClick={() => setVoiceError(null)} style={{
                  marginTop: 8, padding: "3px 10px",
                  background: "transparent", border: "1px solid rgba(192,57,43,0.4)",
                  borderRadius: 5, color: "#C0392B", fontSize: 11,
                  cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                }}>Dismiss</button>
              )}
            </div>
          )}

          {/* Keyboard shortcuts */}
          <div>
            <div style={{ fontSize: 10, color: "#3A4060", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Shortcuts</div>
            {[["Ctrl+S", "Save note"], ["Ctrl+V", "Voice input"], ["Ctrl+T", "Templates"], ["Tab", "Next field"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #1A2040", fontSize: 11 }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#27856A", background: "rgba(30,107,85,0.15)", padding: "1px 6px", borderRadius: 4 }}>{k}</span>
                <span style={{ color: "rgba(255,255,255,0.3)" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Doctor Sign-Off Modal ── */}
      {showSignOff && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(13,17,23,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, animation: "fadeUp 0.2s ease",
        }}>
          <div style={{
            background: "#fff", borderRadius: 16, padding: 36, width: 420,
            boxShadow: "0 24px 64px rgba(13,17,23,0.2)",
            fontFamily: "'DM Sans',sans-serif",
          }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: "#0D1117", marginBottom: 8 }}>
              Sign Off & Discharge
            </div>
            <div style={{ fontSize: 14, color: "#6E7891", marginBottom: 28 }}>
              Where should this patient go next?
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button
                onClick={() => { setShowSignOff(false); onComplete?.({ soap, diagnosis: soap.assessment, icdCodes, discharge: "pharmacy", medHistory, ros, labOrders, followUp, aiPrescriptions }); }}
                style={{
                  padding: "16px 20px", borderRadius: 12, border: "2px solid #1A6650",
                  background: "#E6F3EE", cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#1A6650"}
                onMouseLeave={e => e.currentTarget.style.background = "#E6F3EE"}
              >
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: "#1A6650", marginBottom: 2 }}>
                  💊 Send to Pharmacy
                </div>
                <div style={{ fontSize: 12, color: "#6E7891" }}>Patient has a prescription to collect</div>
              </button>

              <button
                onClick={() => { setShowSignOff(false); onComplete?.({ soap, diagnosis: soap.assessment, icdCodes, discharge: "billing", medHistory, ros, labOrders, followUp, aiPrescriptions }); }}
                style={{
                  padding: "16px 20px", borderRadius: 12, border: "2px solid #C97A10",
                  background: "#FEF5E7", cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#C97A10"}
                onMouseLeave={e => e.currentTarget.style.background = "#FEF5E7"}
              >
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: "#C97A10", marginBottom: 2 }}>
                  💰 Send to Billing
                </div>
                <div style={{ fontSize: 12, color: "#6E7891" }}>No prescription — proceed to checkout</div>
              </button>
            </div>

            <button
              onClick={() => setShowSignOff(false)}
              style={{
                marginTop: 20, width: "100%", padding: "10px", borderRadius: 8,
                border: "1px solid #E8E4DE", background: "transparent",
                color: "#6E7891", fontSize: 13, cursor: "pointer",
                fontFamily: "'DM Sans',sans-serif",
              }}
            >Cancel — go back to notes</button>
          </div>
        </div>
      )}
    </div>
  );
}
