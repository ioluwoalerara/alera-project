import { useState, useEffect, useCallback } from "react";
import { useRole } from "./AleraShell.jsx";
import { useAuth } from "./AleraAuth.jsx";
import { getPatientChart } from "./supabase.js";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  ink: "#0D1117", inkSub: "#6E7891", inkMid: "#3D4558",
  paper: "#F7F5F1", paperDim: "#EFECE7", white: "#FFFFFF",
  sage: "#1A6650", sageMid: "#237A5F", sageLight: "#E6F3EE", sageBorder: "rgba(26,102,80,0.2)",
  blue: "#1854A8", blueLight: "#E8F0FB", blueBorder: "rgba(24,84,168,0.2)",
  amber: "#C97A10", amberLight: "#FEF5E7", amberBorder: "rgba(201,122,16,0.2)",
  rose: "#B83232", roseLight: "#FDECEA", roseBorder: "rgba(184,50,50,0.2)",
  purple: "#5E3FAE", purpleLight: "#F0EBFF",
  border: "#E8E4DE", borderMid: "#D4D0CA",
  shadow: "0 1px 3px rgba(13,17,23,0.06), 0 4px 16px rgba(13,17,23,0.04)",
  radius: 12, radiusSm: 8, radiusLg: 16,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function age(dob) {
  if (!dob) return "—";
  return Math.floor((Date.now() - new Date(dob)) / 31557600000) + "y";
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const fmt = v => v != null ? "₦" + Math.round(v).toLocaleString("en-NG") : "—";

function Tag({ children, color = T.inkSub, bg = T.paperDim, size = 11 }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 8px",
      borderRadius: 20, fontSize: size, fontWeight: 700, letterSpacing: 0.3,
      color, background: bg, fontFamily: "'Syne',sans-serif", whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function Section({ title, icon, children, accent = T.sage }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
        paddingBottom: 8, borderBottom: `2px solid ${accent}22`,
      }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 13, color: accent, textTransform: "uppercase", letterSpacing: 0.8 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }) {
  return <div style={{ padding: "12px 0", fontSize: 13, color: T.inkSub, fontStyle: "italic" }}>{message}</div>;
}

// ─── AI Summary Component ──────────────────────────────────────────────────────
function AISummary({ encounter, patientName }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!encounter) return;
    setLoading(true);
    setSummary(null);
    setError(null);

    const note = encounter.clinical_notes?.[0];
    const diagnoses = encounter.diagnoses?.map(d => d.name).join(", ") || "Not recorded";
    const drugs = encounter.prescriptions?.map(p => p.drug_name).join(", ") || "None";
    const vitals = encounter.vitals?.[0];
    const bp = vitals ? `${vitals.bp_systolic}/${vitals.bp_diastolic} mmHg` : "Not recorded";

    const prompt = `You are a clinical assistant. Summarize this patient visit in 3-4 clear sentences for a clinician. Be concise and clinical.

Patient: ${patientName}
Date: ${fmtDate(encounter.registered_at)}
Chief Complaint: ${encounter.chief_complaint || "Not recorded"}
Diagnoses: ${diagnoses}
Prescriptions: ${drugs}
BP: ${bp}
${note ? `SOAP Assessment: ${note.assessment || ""}` : ""}
${note ? `Plan: ${note.plan || ""}` : ""}

Write a brief clinical summary only. No preamble.`;

    fetch("https://zrstwfjnkpfobsboprzs.supabase.co/functions/v1/claude-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer sb_publishable_9vhVnI6SveqLHto0wGpD7A_qwtHX8Dr", "apikey": "sb_publishable_9vhVnI6SveqLHto0wGpD7A_qwtHX8Dr" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    })
      .then(r => r.json())
      .then(d => {
        const text = d.content?.find(c => c.type === "text")?.text;
        setSummary(text || "Unable to generate summary.");
        setLoading(false);
      })
      .catch(() => {
        setError("AI summary unavailable.");
        setLoading(false);
      });
  }, [encounter?.id]);

  if (!encounter) return null;

  return (
    <div style={{
      background: "linear-gradient(135deg, #0D1117 0%, #1A2636 100%)",
      borderRadius: T.radius, padding: "20px 24px", marginBottom: 20,
      border: `1px solid rgba(26,102,80,0.3)`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>✨</span>
        <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 12, color: "#4ADE80", textTransform: "uppercase", letterSpacing: 1 }}>
          AI Summary · Most Recent Visit
        </span>
        <Tag color="#4ADE80" bg="rgba(74,222,128,0.1)">{fmtDate(encounter.registered_at)}</Tag>
      </div>
      {loading && (
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontStyle: "italic" }}>
          Generating clinical summary…
        </div>
      )}
      {error && <div style={{ color: "#F87171", fontSize: 13 }}>{error}</div>}
      {summary && (
        <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 1.6, fontFamily: "'DM Sans',sans-serif" }}>
          {summary}
        </div>
      )}
    </div>
  );
}

// ─── Vitals Card ───────────────────────────────────────────────────────────────
function VitalsRow({ vitals }) {
  if (!vitals?.length) return <EmptyState message="No vitals recorded" />;
  const v = vitals[0];
  const items = [
    { label: "BP", value: v.bp_systolic ? `${v.bp_systolic}/${v.bp_diastolic}` : "—", unit: "mmHg", alert: v.bp_systolic > 140 || v.bp_diastolic > 90 },
    { label: "Temp", value: v.temperature ?? "—", unit: "°C", alert: v.temperature > 37.5 },
    { label: "Pulse", value: v.pulse_rate ?? "—", unit: "bpm", alert: v.pulse_rate > 100 || v.pulse_rate < 60 },
    { label: "SpO₂", value: v.spo2 ?? "—", unit: "%", alert: v.spo2 < 95 },
    { label: "Weight", value: v.weight_kg ?? "—", unit: "kg" },
    { label: "BMI", value: v.bmi ?? "—", unit: "" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8 }}>
      {items.map(({ label, value, unit, alert }) => (
        <div key={label} style={{
          background: alert ? T.roseLight : T.paperDim,
          border: `1px solid ${alert ? T.roseBorder : T.border}`,
          borderRadius: T.radiusSm, padding: "10px 12px", textAlign: "center",
        }}>
          <div style={{ fontSize: 10, color: T.inkSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 15, color: alert ? T.rose : T.ink }}>{value}</div>
          <div style={{ fontSize: 10, color: T.inkSub }}>{unit}</div>
        </div>
      ))}
    </div>
  );
}

// ─── SOAP Note ────────────────────────────────────────────────────────────────
function SOAPNote({ notes }) {
  if (!notes?.length) return <EmptyState message="No clinical notes recorded" />;
  const note = notes[0];
  const sections = [
    { key: "subjective", label: "S — Subjective" },
    { key: "objective",  label: "O — Objective" },
    { key: "assessment", label: "A — Assessment" },
    { key: "plan",       label: "P — Plan" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {sections.map(({ key, label }) => note[key] && (
        <div key={key} style={{ background: T.paperDim, borderRadius: T.radiusSm, padding: "10px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.sage, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 13, color: T.inkMid, lineHeight: 1.6 }}>{note[key]}</div>
        </div>
      ))}
      {note.author && (
        <div style={{ fontSize: 11, color: T.inkSub, textAlign: "right" }}>
          By {note.author.first_name} {note.author.last_name} · {fmtDateTime(note.created_at)}
        </div>
      )}
    </div>
  );
}

// ─── Prescriptions ────────────────────────────────────────────────────────────
function PrescriptionList({ prescriptions }) {
  if (!prescriptions?.length) return <EmptyState message="No prescriptions" />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {prescriptions.map((p, i) => (
        <div key={i} style={{
          background: T.white, border: `1px solid ${T.border}`,
          borderRadius: T.radiusSm, padding: "10px 14px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: T.ink, marginBottom: 3 }}>
              {p.drug_name} {p.strength && <span style={{ fontWeight: 400, color: T.inkSub }}>· {p.strength}</span>}
            </div>
            <div style={{ fontSize: 12, color: T.inkSub }}>
              {[p.qty && `Qty: ${p.qty}`, p.frequency, p.duration, p.route].filter(Boolean).join(" · ")}
            </div>
            {p.instructions && (
              <div style={{ fontSize: 11, color: T.amber, marginTop: 3 }}>⚠ {p.instructions}</div>
            )}
          </div>
          {p.brand && <Tag color={T.purple} bg={T.purpleLight}>{p.brand}</Tag>}
        </div>
      ))}
    </div>
  );
}

// ─── Diagnoses ────────────────────────────────────────────────────────────────
function DiagnosesList({ diagnoses }) {
  if (!diagnoses?.length) return <EmptyState message="No diagnoses recorded" />;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {diagnoses.map((d, i) => (
        <div key={i} style={{
          background: d.diagnosis_type === "primary" ? T.sageLight : T.paperDim,
          border: `1px solid ${d.diagnosis_type === "primary" ? T.sageBorder : T.border}`,
          borderRadius: T.radiusSm, padding: "8px 12px",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{d.name}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            {d.icd_code && <Tag color={T.blue} bg={T.blueLight}>{d.icd_code}</Tag>}
            <Tag color={d.diagnosis_type === "primary" ? T.sage : T.inkSub} bg="transparent">
              {d.diagnosis_type}
            </Tag>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Bill Summary ─────────────────────────────────────────────────────────────
function BillSummary({ bills }) {
  if (!bills?.length) return <EmptyState message="No billing records" />;
  const bill = bills[0];
  const paid = bill.bill_payments?.reduce((s, p) => s + (p.amount || 0), 0) || 0;
  const owing = (bill.patient_owes || 0) - paid;
  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "12px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: T.inkSub }}>Total Bill</span>
        <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: T.ink }}>{fmt(bill.patient_owes)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: T.inkSub }}>Paid</span>
        <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: T.sage }}>{fmt(paid)}</span>
      </div>
      {owing > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: T.rose }}>Outstanding</span>
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: T.rose }}>{fmt(owing)}</span>
        </div>
      )}
      {bill.bill_payments?.map((p, i) => (
        <div key={i} style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}`, fontSize: 12, color: T.inkSub, display: "flex", justifyContent: "space-between" }}>
          <span>Payment · {p.payment_method}</span>
          <span>{fmtDate(p.paid_at)} · {fmt(p.amount)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Visit Card ───────────────────────────────────────────────────────────────
function VisitCard({ encounter, isExpanded, onToggle, canViewClinical, canViewPrescriptions, canViewBilling, isFirst }) {
  const doctor = encounter.assigned_doctor;
  const statusColors = {
    completed: { color: T.sage, bg: T.sageLight },
    with_doctor: { color: T.blue, bg: T.blueLight },
    waiting_billing: { color: T.amber, bg: T.amberLight },
    waiting_pharmacy: { color: T.purple, bg: T.purpleLight },
  };
  const sc = statusColors[encounter.status] || { color: T.inkSub, bg: T.paperDim };

  return (
    <div style={{
      background: T.white, border: `1px solid ${isExpanded ? T.sageBorder : T.border}`,
      borderRadius: T.radius, overflow: "hidden", transition: "border-color 0.2s",
      boxShadow: isExpanded ? `0 4px 20px rgba(26,102,80,0.08)` : "none",
    }}>
      {/* Visit header */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", padding: "14px 18px", background: "transparent",
          border: "none", cursor: "pointer", textAlign: "left",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}
        onMouseEnter={e => e.currentTarget.style.background = T.paperDim}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", background: isFirst ? T.sage : T.paperDim,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 12,
            color: isFirst ? "#fff" : T.inkSub,
          }}>
            {isFirst ? "★" : encounter.visit_number?.slice(-2) || "V"}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
              <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: T.ink }}>
                {fmtDate(encounter.registered_at)}
              </span>
              {isFirst && <Tag color={T.sage} bg={T.sageLight}>Most Recent</Tag>}
              <Tag color={sc.color} bg={sc.bg}>{encounter.status?.replace(/_/g, " ")}</Tag>
            </div>
            <div style={{ fontSize: 12, color: T.inkSub, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {encounter.chief_complaint && <span>📋 {encounter.chief_complaint}</span>}
              {doctor && <span>👨‍⚕️ Dr. {doctor.last_name}</span>}
              {encounter.diagnoses?.[0] && <span>🔍 {encounter.diagnoses[0].name}</span>}
            </div>
          </div>
        </div>
        <span style={{ color: T.inkSub, fontSize: 14, flexShrink: 0 }}>{isExpanded ? "▲" : "▼"}</span>
      </button>

      {/* Visit detail */}
      {isExpanded && (
        <div style={{ padding: "0 18px 18px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 20 }}>

            {canViewClinical && (
              <>
                <Section title="Vitals" icon="🩺" accent={T.blue}>
                  <VitalsRow vitals={encounter.vitals} />
                </Section>

                <Section title="Diagnoses" icon="🔍" accent={T.sage}>
                  <DiagnosesList diagnoses={encounter.diagnoses} />
                </Section>

                <Section title="Clinical Notes" icon="📋" accent={T.inkMid}>
                  <SOAPNote notes={encounter.clinical_notes} />
                </Section>
              </>
            )}

            {canViewPrescriptions && (
              <Section title="Prescriptions" icon="💊" accent={T.purple}>
                <PrescriptionList prescriptions={encounter.prescriptions} />
              </Section>
            )}

            {canViewBilling && (
              <Section title="Billing" icon="💰" accent={T.amber}>
                <BillSummary bills={encounter.bills} />
              </Section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
/**
 * AleraPatientChart
 *
 * Props:
 *   patientId   — DB UUID of the patient (required)
 *   onClose     — optional callback to close the chart panel
 *   embedded    — if true, renders as a panel (no full-page chrome)
 */
export default function AleraPatientChart({ patientId, onClose, embedded = false }) {
  const { role, can, canRead } = useRole?.() || { role: "doctor", can: () => true, canRead: () => true };
  const { orgId } = useAuth?.() || {};

  const canViewClinical      = canRead("canViewNotes");
  const canViewPrescriptions = canRead("canViewPrescriptions");
  const canViewBilling       = canRead("canViewBilling");
  const canViewAISummary     = role === "doctor" || role === "nurse" || role === "admin";

  const [chart, setChart]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [expanded, setExpanded] = useState({});
  const [activeTab, setActiveTab] = useState("visits");

  useEffect(() => {
    if (!patientId) return;
    setLoading(true);
    getPatientChart(patientId).then(({ patient, encounters }) => {
      setChart({ patient, encounters });
      // Auto-expand most recent visit
      if (encounters?.[0]) setExpanded({ [encounters[0].id]: true });
      setLoading(false);
    }).catch(e => {
      setError("Failed to load chart.");
      setLoading(false);
    });
  }, [patientId]);

  const toggleVisit = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  if (!patientId) return (
    <div style={{ padding: 40, textAlign: "center", color: T.inkSub, fontFamily: "'DM Sans',sans-serif" }}>
      No patient selected
    </div>
  );

  if (loading) return (
    <div style={{ padding: 40, textAlign: "center", color: T.inkSub, fontFamily: "'DM Sans',sans-serif" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
      Loading patient chart…
    </div>
  );

  if (error) return (
    <div style={{ padding: 40, textAlign: "center", color: T.rose, fontFamily: "'DM Sans',sans-serif" }}>
      {error}
    </div>
  );

  const { patient, encounters } = chart;
  const allergies = patient?.patient_allergies || [];
  const patientName = [patient?.first_name, patient?.last_name].filter(Boolean).join(" ") || "Unknown";

  const tabs = [
    { key: "visits",    label: "Visit History",   icon: "📅", always: true },
    { key: "vitals",    label: "Vitals Trend",     icon: "📈", show: canViewClinical && encounters.some(e => e.vitals?.length > 0) },
    { key: "summary",   label: "AI Summary",       icon: "✨", show: canViewAISummary && encounters.length > 0 },
    { key: "allergies", label: "Allergies",         icon: "⚠️", always: true },
  ].filter(t => t.always || t.show);

  const wrapper = embedded ? {
    fontFamily: "'DM Sans',sans-serif", color: T.ink,
    height: "100%", display: "flex", flexDirection: "column", overflow: "hidden",
  } : {
    minHeight: "100vh", background: T.paper,
    fontFamily: "'DM Sans',sans-serif", color: T.ink,
  };

  return (
    <div style={wrapper}>

      {/* ── Header ── */}
      <div style={{
        background: T.white, borderBottom: `1px solid ${T.border}`,
        padding: embedded ? "16px 20px" : "20px 28px",
        position: "sticky", top: 0, zIndex: 10,
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Avatar */}
          <div style={{
            width: 48, height: 48, borderRadius: "50%", background: T.sage,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: "#fff", flexShrink: 0,
          }}>
            {patientName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: T.ink, marginBottom: 4 }}>
              {patientName}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {patient?.patient_number && <Tag color={T.inkSub} bg={T.paperDim}>{patient.patient_number}</Tag>}
              {patient?.date_of_birth && <Tag color={T.inkMid} bg={T.paperDim}>{age(patient.date_of_birth)}</Tag>}
              {patient?.biological_sex && <Tag color={T.inkMid} bg={T.paperDim}>{patient.biological_sex}</Tag>}
              {patient?.blood_group && <Tag color={T.rose} bg={T.roseLight}>🩸 {patient.blood_group}</Tag>}
              {allergies.length > 0 && <Tag color={T.rose} bg={T.roseLight}>⚠ {allergies.length} allerg{allergies.length > 1 ? "ies" : "y"}</Tag>}
              <Tag color={T.blue} bg={T.blueLight}>{encounters.length} visit{encounters.length !== 1 ? "s" : ""}</Tag>
            </div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} style={{
            padding: "6px 14px", borderRadius: T.radiusSm, border: `1px solid ${T.border}`,
            background: T.white, color: T.inkSub, fontSize: 13, cursor: "pointer",
            fontFamily: "'DM Sans',sans-serif",
          }}>✕ Close</button>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={{
        background: T.white, borderBottom: `1px solid ${T.border}`,
        padding: "0 20px", display: "flex", gap: 4,
      }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: "10px 16px", border: "none", background: "transparent",
            borderBottom: `2px solid ${activeTab === t.key ? T.sage : "transparent"}`,
            color: activeTab === t.key ? T.sage : T.inkSub,
            fontSize: 13, fontWeight: activeTab === t.key ? 700 : 400,
            cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6,
          }}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: embedded ? "16px 20px" : "24px 28px" }}>

        {/* Visit History */}
        {activeTab === "visits" && (
          <div>
            {encounters.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: T.inkSub }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                No visits recorded yet
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {encounters.map((enc, i) => (
                  <VisitCard
                    key={enc.id}
                    encounter={enc}
                    isFirst={i === 0}
                    isExpanded={!!expanded[enc.id]}
                    onToggle={() => toggleVisit(enc.id)}
                    canViewClinical={canViewClinical}
                    canViewPrescriptions={canViewPrescriptions}
                    canViewBilling={canViewBilling}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI Summary */}
        {activeTab === "summary" && canViewAISummary && (
          <div>
            <AISummary encounter={encounters[0]} patientName={patientName} />
            {encounters.length > 1 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: T.inkSub, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Previous Visits
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {encounters.slice(1).map(enc => (
                    <div key={enc.id} style={{
                      background: T.white, border: `1px solid ${T.border}`,
                      borderRadius: T.radiusSm, padding: "10px 14px",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{fmtDate(enc.registered_at)}</div>
                        <div style={{ fontSize: 12, color: T.inkSub }}>
                          {enc.diagnoses?.[0]?.name || enc.chief_complaint || "No diagnosis recorded"}
                        </div>
                      </div>
                      {enc.assigned_doctor && (
                        <Tag color={T.inkSub} bg={T.paperDim}>
                          Dr. {enc.assigned_doctor.last_name}
                        </Tag>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Vitals Trend */}
        {activeTab === "vitals" && (() => {
          // Collect vitals across all encounters, oldest first
          const vitalPoints = encounters
            .filter(e => e.vitals?.length > 0)
            .map(e => ({ date: e.registered_at, v: e.vitals[0] }))
            .reverse();

          if (vitalPoints.length === 0) return (
            <div style={{ textAlign: "center", padding: 40, color: T.inkSub }}>No vitals recorded yet</div>
          );

          const metrics = [
            {
              key: "bp", label: "Blood Pressure (Systolic)", unit: "mmHg",
              color: T.rose, normalMin: 90, normalMax: 120,
              getValue: v => v.bp_systolic,
            },
            {
              key: "temp", label: "Temperature", unit: "°C",
              color: T.amber, normalMin: 36.1, normalMax: 37.2,
              getValue: v => v.temperature,
            },
            {
              key: "weight", label: "Weight", unit: "kg",
              color: T.blue, normalMin: null, normalMax: null,
              getValue: v => v.weight_kg,
            },
            {
              key: "pulse", label: "Pulse Rate", unit: "bpm",
              color: T.purple, normalMin: 60, normalMax: 100,
              getValue: v => v.pulse_rate,
            },
          ];

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {metrics.map(metric => {
                const points = vitalPoints.map(p => ({
                  date: new Date(p.date).toLocaleDateString("en-NG", { day: "numeric", month: "short" }),
                  value: metric.getValue(p.v),
                })).filter(p => p.value != null);

                if (points.length === 0) return null;

                const values = points.map(p => p.value);
                const min = Math.min(...values);
                const max = Math.max(...values);
                const range = max - min || 1;
                const chartH = 80;

                return (
                  <div key={metric.key} style={{
                    background: T.white, borderRadius: T.radius,
                    border: `1px solid ${T.border}`, padding: "16px 20px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: T.ink }}>
                        {metric.label}
                      </div>
                      <div style={{ display: "flex", gap: 12, fontSize: 11, color: T.inkSub }}>
                        <span>Min: <strong style={{ color: metric.color }}>{min}{metric.unit}</strong></span>
                        <span>Max: <strong style={{ color: metric.color }}>{max}{metric.unit}</strong></span>
                        <span>Latest: <strong style={{ color: metric.color }}>{points[points.length-1]?.value}{metric.unit}</strong></span>
                      </div>
                    </div>

                    {/* Chart */}
                    <div style={{ position: "relative", height: chartH + 24 }}>
                      {/* Normal range band */}
                      {metric.normalMin && metric.normalMax && (
                        <div style={{
                          position: "absolute",
                          top: chartH - ((metric.normalMax - min) / range) * chartH,
                          height: ((metric.normalMax - metric.normalMin) / range) * chartH,
                          left: 0, right: 0,
                          background: "rgba(26,102,80,0.06)",
                          border: "1px dashed rgba(26,102,80,0.2)",
                          borderRadius: 4,
                        }} />
                      )}

                      {/* Bars */}
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: chartH, position: "relative", zIndex: 1 }}>
                        {points.map((p, i) => {
                          const h = Math.max(((p.value - min) / range) * chartH, 4);
                          const isHigh = metric.normalMax && p.value > metric.normalMax;
                          const isLow = metric.normalMin && p.value < metric.normalMin;
                          const barColor = isHigh || isLow ? T.rose : metric.color;
                          return (
                            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                              <div style={{ fontSize: 9, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace" }}>{p.value}</div>
                              <div style={{
                                width: "100%", background: barColor, borderRadius: "3px 3px 0 0",
                                height: h, opacity: i === points.length - 1 ? 1 : 0.6,
                                transition: "height 0.3s ease",
                              }} />
                            </div>
                          );
                        })}
                      </div>

                      {/* X axis labels */}
                      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        {points.map((p, i) => (
                          <div key={i} style={{ flex: 1, fontSize: 8, color: T.inkSub, textAlign: "center", fontFamily: "'JetBrains Mono',monospace" }}>
                            {p.date}
                          </div>
                        ))}
                      </div>
                    </div>

                    {metric.normalMin && metric.normalMax && (
                      <div style={{ fontSize: 10, color: T.inkSub, marginTop: 4 }}>
                        Normal range: {metric.normalMin}–{metric.normalMax}{metric.unit}
                        {values.some(v => v > metric.normalMax || v < metric.normalMin) && (
                          <span style={{ color: T.rose, fontWeight: 700, marginLeft: 8 }}>⚠ Out-of-range values detected</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Allergies */}
        {activeTab === "allergies" && (
          <div>
            {allergies.length === 0 ? (
              <div style={{
                background: T.sageLight, border: `1px solid ${T.sageBorder}`,
                borderRadius: T.radius, padding: "20px 24px",
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <span style={{ fontSize: 24 }}>✅</span>
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: T.sage }}>No Known Allergies</div>
                  <div style={{ fontSize: 13, color: T.inkSub }}>No allergies recorded for this patient</div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {allergies.map((a, i) => (
                  <div key={i} style={{
                    background: T.roseLight, border: `1px solid ${T.roseBorder}`,
                    borderRadius: T.radiusSm, padding: "12px 16px",
                    display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <span style={{ fontSize: 20 }}>⚠️</span>
                    <div>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: T.rose }}>{a.allergen}</div>
                      <div style={{ fontSize: 12, color: T.inkSub }}>
                        {[a.severity, a.reaction].filter(Boolean).join(" · ") || "Severity not recorded"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
