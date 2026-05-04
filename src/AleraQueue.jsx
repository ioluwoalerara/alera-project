// =============================================================================
// AleraQueue.jsx — Live Waiting Room / Patient Queue
// =============================================================================
// Real-time view of today's patient queue.
// Updates instantly via Supabase Realtime when:
//   - New patient is registered (encounter created)
//   - Encounter status changes (triage → with_doctor → completed)
//   - Doctor assignment changes
//
// Used by: receptionist, nurse, admin
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { useRole } from "./AleraShell.jsx";
import { useAuth } from "./AleraAuth.jsx";
import { supabase, getWaitingQueue, updateEncounterStatus } from "./supabase.js";

// ─── Design tokens (match Alera light theme) ─────────────────────────────────
const T = {
  ink:        "#0D1117", inkSub: "#6E7891", inkMid: "#3D4558",
  paper:      "#F7F5F1", paperDim: "#EFECE7", white: "#FFFFFF",
  sage:       "#1A6650", sageMid: "#237A5F", sageLight: "#E6F3EE", sageBorder: "rgba(26,102,80,0.2)",
  amber:      "#C97A10", amberLight: "#FEF5E7", amberBorder: "rgba(201,122,16,0.3)",
  rose:       "#B83232", roseLight: "#FDECEA", roseBorder: "rgba(184,50,50,0.3)",
  blue:       "#1854A8", blueLight: "#E8F0FB", blueBorder: "rgba(24,84,168,0.25)",
  purple:     "#5E3FAE", purpleLight: "#F0EBFF",
  border:     "#E8E4DE", borderMid: "#D4D0CA",
  shadow:     "0 1px 3px rgba(13,17,23,0.06), 0 4px 16px rgba(13,17,23,0.04)",
  shadowMd:   "0 4px 24px rgba(13,17,23,0.10)",
  radius: 12, radiusSm: 8, radiusLg: 16,
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS = {
  waiting_triage:   { label: "Waiting for Triage",  color: T.amber,  bg: T.amberLight,  icon: "🕐" },
  in_triage:        { label: "In Triage",            color: T.blue,   bg: T.blueLight,   icon: "🩺" },
  waiting_doctor:   { label: "Waiting for Doctor",   color: T.purple, bg: T.purpleLight, icon: "⏳" },
  with_doctor:      { label: "With Doctor",          color: T.sage,   bg: T.sageLight,   icon: "👨‍⚕️" },
  waiting_pharmacy: { label: "Waiting for Pharmacy", color: T.blue,   bg: T.blueLight,   icon: "💊" },
  waiting_billing:  { label: "Waiting for Billing",  color: T.amber,  bg: T.amberLight,  icon: "💰" },
  completed:        { label: "Completed",            color: T.sage,   bg: T.sageLight,   icon: "✅" },
  discharged:       { label: "Discharged",           color: T.inkSub, bg: T.paperDim,    icon: "🏠" },
  waiting:          { label: "Waiting",              color: T.amber,  bg: T.amberLight,  icon: "🕐" },
  triage:           { label: "In Triage",            color: T.blue,   bg: T.blueLight,   icon: "🩺" },
};

const URGENCY = {
  immediate:  { label: "IMMEDIATE",  color: "#fff",   bg: T.rose,   border: T.rose,   priority: 0 },
  emergent:   { label: "EMERGENT",   color: T.rose,   bg: T.roseLight, border: T.roseBorder, priority: 1 },
  urgent:     { label: "URGENT",     color: T.amber,  bg: T.amberLight, border: T.amberBorder, priority: 2 },
  semi_urgent:{ label: "SEMI-URGENT",color: T.blue,   bg: T.blueLight, border: T.blueBorder, priority: 3 },
  non_urgent: { label: "ROUTINE",    color: T.inkSub, bg: T.paperDim, border: T.border, priority: 4 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function waitTime(registeredAt) {
  if (!registeredAt) return "—";
  const mins = Math.floor((Date.now() - new Date(registeredAt)) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function age(dob) {
  if (!dob) return "—";
  return `${new Date().getFullYear() - new Date(dob).getFullYear()}y`;
}

function initials(first, last) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

// ─── PatientRow ───────────────────────────────────────────────────────────────
function PatientRow({ enc, onAdvance, onView, onSeePatient, canAdvance, isAdvancing, role }) {
  const [hov, setHov] = useState(false);
  const st  = STATUS[enc.status]  ?? STATUS.waiting;
  const urg = URGENCY[enc.urgency] ?? URGENCY.non_urgent;
  const pat = enc.patient ?? {};
  const doc = enc.doctor  ?? null;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "28px 1fr 120px 120px 90px 80px 110px",
        alignItems: "center",
        gap: 12,
        padding: "13px 18px",
        background: hov ? "#FAFAF8" : T.white,
        borderBottom: `1px solid ${T.border}`,
        transition: "background 0.12s",
      }}
    >
      {/* Urgency dot */}
      <div title={urg.label} style={{
        width: 10, height: 10, borderRadius: "50%",
        background: urg.bg, border: `2px solid ${urg.color}`,
        flexShrink: 0,
        ...(urg.priority === 0 ? { animation: "urgPulse 1.2s ease-in-out infinite" } : {}),
      }} />

      {/* Patient info */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div style={{
          width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
          background: urg.priority <= 1 ? T.roseLight : T.sageLight,
          border: `1.5px solid ${urg.priority <= 1 ? T.roseBorder : T.sageBorder}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 12,
          color: urg.priority <= 1 ? T.rose : T.sage,
        }}>
          {initials(pat.first_name, pat.last_name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13.5,
            color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {pat.first_name} {pat.middle_name ? pat.middle_name + " " : ""}{pat.last_name}
          </div>
          <div style={{ fontSize: 11, color: T.inkSub, display: "flex", gap: 6, marginTop: 1 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{pat.patient_number ?? "—"}</span>
            <span>·</span>
            <span>{age(pat.date_of_birth)} · {pat.biological_sex === "male" ? "M" : pat.biological_sex === "female" ? "F" : "—"}</span>
          </div>
        </div>
      </div>

      {/* Chief complaint */}
      <div style={{
        fontSize: 12, color: T.inkMid,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }} title={enc.chief_complaint ?? ""}>
        {enc.chief_complaint ?? <span style={{ color: T.inkSub, fontStyle: "italic" }}>—</span>}
      </div>

      {/* Status badge */}
      <div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
          background: st.bg, color: st.color,
          fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.3px",
          display: "inline-flex", alignItems: "center", gap: 4,
        }}>
          {st.icon} {st.label}
        </span>
      </div>

      {/* Doctor */}
      <div style={{ fontSize: 12, color: T.inkMid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {doc ? `Dr. ${doc.last_name}` : <span style={{ color: T.inkSub }}>Unassigned</span>}
      </div>

      {/* Wait time */}
      <div style={{
        fontFamily: "'JetBrains Mono',monospace", fontSize: 12,
        color: (() => {
          const mins = Math.floor((Date.now() - new Date(enc.registered_at)) / 60000);
          return mins > 45 ? T.rose : mins > 20 ? T.amber : T.inkSub;
        })(),
        fontWeight: 600,
      }}>
        {waitTime(enc.registered_at)}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={() => onView(enc)} style={{
          padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
          background: "none", border: `1px solid ${T.border}`, color: T.inkMid,
          cursor: "pointer", transition: "all 0.12s",
          fontFamily: "'DM Sans',sans-serif",
        }}
          onMouseEnter={e => { e.target.style.borderColor = T.sage; e.target.style.color = T.sage; }}
          onMouseLeave={e => { e.target.style.borderColor = T.border; e.target.style.color = T.inkMid; }}
        >
          View
        </button>
        {onSeePatient && (
          (role === "nurse"       && enc.status === "waiting_triage") ||
          (role === "doctor"      && enc.status === "waiting_doctor")  ||
          (role === "pharmacist"  && enc.status === "waiting_pharmacy") ||
          (role === "cashier"     && enc.status === "waiting_billing") ||
          (role === "receptionist" && enc.status === "completed") ||
          (role === "admin"       && ["waiting_triage","waiting_doctor","waiting_pharmacy","waiting_billing"].includes(enc.status))
        ) && (
          <button onClick={() => {
            const pat = enc.patient ?? {};
            onSeePatient({
              _db_id:        pat.id ?? null,
              _encounter_id: enc.id,
              id:            pat.patient_number ?? "",
              name:          [pat.first_name, pat.middle_name, pat.last_name].filter(Boolean).join(" ") || "Unknown",
              age:           pat.date_of_birth ? Math.floor((Date.now() - new Date(pat.date_of_birth)) / 31557600000) : null,
              sex:           pat.biological_sex ?? "",
              phone:         pat.phone_number ?? "",
              blood:         pat.blood_group ?? "",
              allergies:     (pat.patient_allergies ?? []).map(a => a.allergen),
              insurance:     pat.insurance_provider ?? "",
              insuranceId:   pat.insurance_id ?? "",
              visitReason:   enc.chief_complaint ?? "",
              vitals:        null, diagnosis: null, soap: null, rxList: [],
            });
          }} style={{
            padding: "5px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700,
            background: T.sage, border: "none", color: "#fff",
            cursor: "pointer", transition: "all 0.12s", fontFamily: "'Syne',sans-serif",
          }}
            onMouseEnter={e => e.target.style.background = T.sageMid}
            onMouseLeave={e => e.target.style.background = T.sage}
          >
            See Patient →
          </button>
        )}
        {canAdvance && ["waiting_pharmacy","waiting_billing"].includes(enc.status) && (
          <button onClick={() => onAdvance(enc.id, st.next)} disabled={isAdvancing === enc.id} style={{
            padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
            background: isAdvancing === enc.id ? T.sageMid : T.sage,
            border: "none", color: "#fff", cursor: isAdvancing === enc.id ? "default" : "pointer",
            transition: "all 0.12s", fontFamily: "'Syne',sans-serif",
            opacity: isAdvancing === enc.id ? 0.7 : 1,
          }}>
            {isAdvancing === enc.id ? "…" : "→ " + (STATUS[st.next]?.label ?? "Next")}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Queue stats bar ──────────────────────────────────────────────────────────
function StatsBar({ encounters }) {
  const stats = {
    total:    encounters.filter(e => e.status !== "completed" && e.status !== "discharged").length,
    triage:   encounters.filter(e => ["waiting_triage","in_triage"].includes(e.status)).length,
    doctor:   encounters.filter(e => ["waiting_doctor","with_doctor"].includes(e.status)).length,
    pharmacy: encounters.filter(e => ["waiting_pharmacy","waiting_billing"].includes(e.status)).length,
    critical: encounters.filter(e => ["immediate","emergent"].includes(e.urgency)).length,
    avgWait:  (() => {
      const active = encounters.filter(e => e.registered_at);
      if (!active.length) return 0;
      return Math.round(active.reduce((s, e) => s + (Date.now() - new Date(e.registered_at)) / 60000, 0) / active.length);
    })(),
  };

  const items = [
    { label: "Active",      value: stats.total,    color: T.ink,   bg: T.paperDim   },
    { label: "For Triage",  value: stats.triage,   color: T.amber, bg: T.amberLight },
    { label: "For Doctor",  value: stats.doctor,   color: T.sage,  bg: T.sageLight  },
    { label: "For Pharmacy/Billing", value: stats.pharmacy, color: T.blue, bg: T.blueLight },
    { label: "Critical",    value: stats.critical, color: T.rose,  bg: T.roseLight  },
  ];

  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
      {items.map(({ label, value, color, bg }) => (
        <div key={label} style={{
          flex: 1, padding: "12px 14px", borderRadius: T.radiusSm,
          background: bg, border: `1px solid ${color}22`,
        }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color, lineHeight: 1 }}>
            {value}
          </div>
          <div style={{ fontSize: 11, color: T.inkSub, marginTop: 4, fontWeight: 600, letterSpacing: "0.3px", textTransform: "uppercase" }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── PatientDetailPanel ───────────────────────────────────────────────────────
function PatientDetailPanel({ enc, onClose, onAdvance, canAdvance }) {
  if (!enc) return null;
  const pat = enc.patient ?? {};
  const st  = STATUS[enc.status] ?? STATUS.waiting;
  const urg = URGENCY[enc.urgency] ?? URGENCY.non_urgent;

  return (
    <div style={{
      position: "fixed", right: 0, top: 0, bottom: 0, width: 380,
      background: T.white, borderLeft: `1px solid ${T.border}`,
      boxShadow: "-8px 0 32px rgba(13,17,23,0.12)",
      zIndex: 100, display: "flex", flexDirection: "column",
      animation: "slideIn 0.2s ease",
      fontFamily: "'DM Sans',sans-serif",
    }}>
      <style>{`@keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

      {/* Header */}
      <div style={{ padding: "20px 22px 16px", borderBottom: `1px solid ${T.border}`, background: T.paper }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, color: T.ink }}>
              {pat.first_name} {pat.middle_name ? pat.middle_name + " " : ""}{pat.last_name}
            </div>
            <div style={{ fontSize: 12, color: T.inkSub, marginTop: 3 }}>
              {pat.patient_number} · {age(pat.date_of_birth)} · {pat.biological_sex ?? "—"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: T.inkSub, lineHeight: 1 }}>×</button>
        </div>

        {/* Urgency + Status */}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
            background: urg.bg, color: urg.color, border: `1px solid ${urg.border}`,
            fontFamily: "'JetBrains Mono',monospace",
          }}>
            {urg.label}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
            background: st.bg, color: st.color,
            fontFamily: "'JetBrains Mono',monospace",
          }}>
            {st.icon} {st.label}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6,
            background: T.paperDim, color: T.inkSub,
            fontFamily: "'JetBrains Mono',monospace",
          }}>
            ⏱ {waitTime(enc.registered_at)}
          </span>
        </div>
      </div>

      {/* Details */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
        <Row label="Chief Complaint" value={enc.chief_complaint ?? "—"} />
        <Row label="Insurance"       value={pat.insurance_provider ?? "None"} />
        <Row label="Blood Group"     value={pat.blood_group ?? "—"} />
        <Row label="Registered"      value={enc.registered_at ? new Date(enc.registered_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" }) : "—"} />
        <Row label="Doctor"          value={enc.doctor ? `Dr. ${enc.doctor.first_name} ${enc.doctor.last_name}` : "Unassigned"} />
        <Row label="Visit #"         value={enc.visit_number ?? "—"} />

        {enc.patient?.patient_allergies?.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: T.inkSub, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Allergies</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {enc.patient.patient_allergies.map((a, i) => (
                <span key={i} style={{
                  fontSize: 12, padding: "3px 9px", borderRadius: 6,
                  background: T.roseLight, color: T.rose,
                  border: `1px solid ${T.roseBorder}`, fontWeight: 600,
                }}>
                  ⚠️ {a.allergen}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action */}
      {canAdvance && st.next && (
        <div style={{ padding: "14px 22px", borderTop: `1px solid ${T.border}`, background: T.paper }}>
          <button onClick={() => { onAdvance(enc.id, st.next); onClose(); }} style={{
            width: "100%", padding: "13px 0", borderRadius: T.radiusSm,
            background: T.sage, border: "none", color: "#fff",
            fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14,
            cursor: "pointer", transition: "background 0.14s",
          }}
            onMouseEnter={e => e.target.style.background = T.sageMid}
            onMouseLeave={e => e.target.style.background = T.sage}
          >
            Move to {STATUS[st.next]?.label ?? "Next"} →
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "9px 0", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 12, color: T.inkSub, fontWeight: 600, flexShrink: 0, marginRight: 12 }}>{label}</span>
      <span style={{ fontSize: 13, color: T.ink, textAlign: "right" }}>{value}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AleraQueue({ onStartEncounter, onSeePatient }) {
  const { role, can } = useRole?.() || { role: "receptionist", can: () => true };
  const { orgId }     = useAuth();

  const canAdvanceStatus = can("canStartEncounter") || role === "nurse" || role === "admin";

  const [encounters,   setEncounters]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [selected,     setSelected]     = useState(null);
  const [advancing,    setAdvancing]    = useState(null);   // encounter ID being advanced
  const [filter,       setFilter]       = useState("all");  // all | waiting | with_doctor | critical
  const [searchQ,      setSearchQ]      = useState("");
  const [lastUpdated,  setLastUpdated]  = useState(null);
  const [realtimeLive, setRealtimeLive] = useState(false);

  // ── Load queue ─────────────────────────────────────────────────────────────
  const loadQueue = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await getWaitingQueue(orgId);
    if (!error) {
      setEncounters(data ?? []);
      setLastUpdated(new Date());
    }
    setLoading(false);
  }, [orgId]);

  // Initial load
  useEffect(() => { loadQueue(); }, [loadQueue]);

  // Realtime subscription
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("queue-screen")
      .on("postgres_changes", {
        event:  "*",
        schema: "public",
        table:  "encounters",
        filter: `org_id=eq.${orgId}`,
      }, () => {
        loadQueue();
        setLastUpdated(new Date());
      })
      .subscribe(status => {
        setRealtimeLive(status === "SUBSCRIBED");
      });

    return () => supabase.removeChannel(channel);
  }, [orgId, loadQueue]);

  // Refresh wait-time display every 60s (no DB hit needed — just re-render)
  useEffect(() => {
    const t = setInterval(() => setEncounters(e => [...e]), 60000);
    return () => clearInterval(t);
  }, []);

  // ── Advance status ─────────────────────────────────────────────────────────
  async function handleAdvance(encounterId, nextStatus) {
    setAdvancing(encounterId);
    await updateEncounterStatus(encounterId, nextStatus);
    setAdvancing(null);
    // Realtime will trigger loadQueue, but also update locally for instant feedback
    setEncounters(prev => prev.map(e =>
      e.id === encounterId ? { ...e, status: nextStatus } : e
    ));
  }

  // ── Filter + search ────────────────────────────────────────────────────────
  const filtered = encounters.filter(enc => {
    const pat = enc.patient ?? {};
    const name = `${pat.first_name ?? ""} ${pat.middle_name ?? ""} ${pat.last_name ?? ""}`.toLowerCase();
    const matchSearch = !searchQ || name.includes(searchQ.toLowerCase()) || (pat.patient_number ?? "").toLowerCase().includes(searchQ.toLowerCase());

    const matchFilter = filter === "all"
      ? true
      : filter === "critical"
      ? ["immediate","emergent"].includes(enc.urgency)
      : enc.status === filter;

    return matchSearch && matchFilter;
  });

  // Sort: immediate first, then by urgency, then by wait time
  const sorted = [...filtered].sort((a, b) => {
    const ua = URGENCY[a.urgency]?.priority ?? 4;
    const ub = URGENCY[b.urgency]?.priority ?? 4;
    if (ua !== ub) return ua - ub;
    return new Date(a.registered_at) - new Date(b.registered_at);
  });

  const filterTabs = [
    { key: "all",              label: "All",              count: encounters.length },
    { key: "waiting_triage",   label: "For Triage",       count: encounters.filter(e => e.status === "waiting_triage").length },
    { key: "waiting_doctor",   label: "For Doctor",       count: encounters.filter(e => e.status === "waiting_doctor").length },
    { key: "waiting_pharmacy", label: "For Pharmacy",     count: encounters.filter(e => e.status === "waiting_pharmacy").length },
    { key: "waiting_billing",  label: "For Billing",      count: encounters.filter(e => e.status === "waiting_billing").length },
    { key: "critical",         label: "⚠️ Critical",      count: encounters.filter(e => ["immediate","emergent"].includes(e.urgency)).length },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: T.paper,
      fontFamily: "'DM Sans',sans-serif",
      padding: "28px 32px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes urgPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(184,50,50,0.4); } 50% { box-shadow: 0 0 0 5px rgba(184,50,50,0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, animation: "fadeUp 0.3s ease" }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 24, color: T.ink, marginBottom: 4 }}>
            Patient Queue
          </div>
          <div style={{ fontSize: 13, color: T.inkSub, display: "flex", alignItems: "center", gap: 8 }}>
            {realtimeLive ? (
              <><span style={{ width: 7, height: 7, borderRadius: "50%", background: T.sage, display: "inline-block", animation: "urgPulse 2s ease infinite" }} /> Live · Updates automatically</>
            ) : (
              <><span style={{ width: 7, height: 7, borderRadius: "50%", background: T.amber, display: "inline-block" }} /> Connecting…</>
            )}
            {lastUpdated && (
              <span style={{ color: T.borderMid }}>· Last: {lastUpdated.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: T.inkSub, pointerEvents: "none" }}>🔍</span>
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search patient…"
              style={{
                padding: "8px 12px 8px 30px",
                background: T.white, border: `1.5px solid ${T.border}`,
                borderRadius: T.radiusSm, fontSize: 13, color: T.ink,
                outline: "none", width: 200, fontFamily: "'DM Sans',sans-serif",
              }}
              onFocus={e => e.target.style.borderColor = T.sage}
              onBlur={e  => e.target.style.borderColor = T.border}
            />
          </div>

          {/* Register new patient */}
          {can("canRegisterPatient") && (
            <button
              onClick={() => onStartEncounter?.()}
              style={{
                padding: "9px 18px", borderRadius: T.radiusSm,
                background: T.sage, border: "none", color: "#fff",
                fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13,
                cursor: "pointer", transition: "background 0.14s",
              }}
              onMouseEnter={e => e.target.style.background = T.sageMid}
              onMouseLeave={e => e.target.style.background = T.sage}
            >
              + New Patient
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ animation: "fadeUp 0.3s ease 0.05s both" }}>
        <StatsBar encounters={encounters} />
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, animation: "fadeUp 0.3s ease 0.1s both" }}>
        {filterTabs.map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key)} style={{
            padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            background: filter === tab.key ? T.sage : T.white,
            color:      filter === tab.key ? "#fff"  : T.inkMid,
            border: `1.5px solid ${filter === tab.key ? T.sage : T.border}`,
            cursor: "pointer", transition: "all 0.14s",
            fontFamily: "'DM Sans',sans-serif",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                minWidth: 18, height: 18, borderRadius: 9, fontSize: 11,
                background: filter === tab.key ? "rgba(255,255,255,0.25)" : T.paperDim,
                color: filter === tab.key ? "#fff" : T.inkSub,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                padding: "0 4px",
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{
        background: T.white, borderRadius: T.radiusLg,
        border: `1px solid ${T.border}`, boxShadow: T.shadow,
        overflow: "hidden", animation: "fadeUp 0.3s ease 0.15s both",
      }}>
        {/* Table header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "28px 1fr 120px 120px 90px 80px 110px",
          gap: 12,
          padding: "10px 18px",
          background: T.paper,
          borderBottom: `1px solid ${T.border}`,
        }}>
          {["", "Patient", "Complaint", "Status", "Doctor", "Wait", ""].map((h, i) => (
            <div key={i} style={{ fontSize: 11, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: T.inkSub }}>
            <div style={{ width: 24, height: 24, border: `2px solid ${T.border}`, borderTopColor: T.sage, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
            Loading queue…
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: "64px 0", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🏥</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: T.ink, marginBottom: 6 }}>
              {searchQ ? "No patients match your search" : filter === "all" ? "Queue is empty" : "No patients in this category"}
            </div>
            <div style={{ fontSize: 13, color: T.inkSub }}>
              {filter === "all" && "Register a new patient to get started."}
            </div>
          </div>
        ) : (
          sorted.map(enc => (
            <PatientRow
              key={enc.id}
              enc={enc}
              onAdvance={handleAdvance}
              onView={setSelected}
              onSeePatient={onSeePatient}
              canAdvance={canAdvanceStatus}
              isAdvancing={advancing}
              role={role}
            />
          ))
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <PatientDetailPanel
          enc={selected}
          onClose={() => setSelected(null)}
          onAdvance={handleAdvance}
          canAdvance={canAdvanceStatus}
        />
      )}
    </div>
  );
}
