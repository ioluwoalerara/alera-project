import { useState, useEffect, useCallback } from "react";
import { useRole } from "./AleraShell.jsx";
import { useAuth } from "./AleraAuth.jsx";
import { supabase } from "./supabase.js";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  ink: "#0D1117", inkSub: "#6E7891", inkMid: "#3D4558",
  paper: "#F7F5F1", paperDim: "#EFECE7", white: "#FFFFFF",
  sage: "#1A6650", sageMid: "#237A5F", sageLight: "#E6F3EE", sageBorder: "rgba(26,102,80,0.2)",
  blue: "#1854A8", blueLight: "#E8F0FB",
  amber: "#C97A10", amberLight: "#FEF5E7",
  rose: "#B83232", roseLight: "#FDECEA",
  purple: "#5E3FAE", purpleLight: "#F0EBFF",
  border: "#E8E4DE", borderMid: "#D4D0CA",
  shadow: "0 1px 3px rgba(13,17,23,0.06), 0 4px 16px rgba(13,17,23,0.04)",
  radius: 12, radiusSm: 8, radiusLg: 16,
};

const fmt = v => "₦" + Math.round(v || 0).toLocaleString("en-NG");

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_CONFIG = {
  draft:     { label: "Draft",     color: T.inkSub,  bg: T.paperDim,   icon: "📝" },
  submitted: { label: "Submitted", color: T.blue,    bg: T.blueLight,   icon: "📤" },
  approved:  { label: "Approved",  color: T.sage,    bg: T.sageLight,   icon: "✅" },
  rejected:  { label: "Rejected",  color: T.rose,    bg: T.roseLight,   icon: "❌" },
  paid:      { label: "Paid",      color: T.sage,    bg: T.sageLight,   icon: "💰" },
  appealed:  { label: "Appealed",  color: T.amber,   bg: T.amberLight,  icon: "📋" },
};

// ─── Claim Card ───────────────────────────────────────────────────────────────
function ClaimCard({ claim, onGenerate, onSubmit, onUpdateStatus, expanded, onToggle }) {
  const sc = STATUS_CONFIG[claim.nhis_claim_status || "draft"];
  const patient = claim.patient;
  const patientName = patient ? `${patient.first_name} ${patient.last_name}` : "Unknown Patient";

  return (
    <div style={{
      background: T.white, borderRadius: T.radius,
      border: `1px solid ${expanded ? T.sageBorder : T.border}`,
      overflow: "hidden", transition: "border-color 0.2s",
      boxShadow: expanded ? `0 4px 20px rgba(26,102,80,0.08)` : T.shadow,
    }}>
      {/* Header */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", padding: "14px 18px", background: "transparent",
          border: "none", cursor: "pointer", textAlign: "left",
          display: "flex", alignItems: "center", gap: 14,
        }}
        onMouseEnter={e => e.currentTarget.style.background = T.paperDim}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: T.ink }}>
              {patientName}
            </span>
            <span style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 10,
              background: sc.bg, color: sc.color, fontWeight: 700,
              fontFamily: "'Syne',sans-serif",
            }}>{sc.icon} {sc.label}</span>
            {claim.nhis_rejection_reason && (
              <span style={{ fontSize: 11, color: T.rose }}>⚠ {claim.nhis_rejection_reason}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: T.inkSub, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>📋 {claim.bill_number}</span>
            <span>🏥 NHIS: {patient?.nhis_number || claim.nhis_number || "—"}</span>
            <span>📅 {fmtDate(claim.created_at)}</span>
            <span>💰 {fmt(claim.subtotal || claim.patient_owes)}</span>
          </div>
        </div>
        <span style={{ color: T.inkSub, fontSize: 14, flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Expanded claim detail */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "20px 18px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

            {/* Patient Info */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Patient Details</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {[
                  { label: "Name", value: patientName },
                  { label: "NHIS No.", value: patient?.nhis_number || claim.nhis_number || "—" },
                  { label: "HMO", value: patient?.hmo_name || patient?.insurance_provider || "—" },
                  { label: "Visit Date", value: fmtDate(claim.created_at) },
                  { label: "Bill No.", value: claim.bill_number },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: "flex", gap: 8, fontSize: 13 }}>
                    <span style={{ color: T.inkSub, minWidth: 80 }}>{label}:</span>
                    <span style={{ color: T.ink, fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Financial Summary</div>
              <div style={{ background: T.paperDim, borderRadius: T.radiusSm, padding: "12px 14px" }}>
                {[
                  { label: "Subtotal", value: fmt(claim.subtotal || claim.patient_owes) },
                  { label: "Insurance Cover", value: fmt(claim.insurance_covers_ngn || 0) },
                  { label: "NHIS Approved", value: claim.nhis_amount_approved ? fmt(claim.nhis_amount_approved) : "Pending" },
                  { label: "Patient Owes", value: fmt(claim.patient_owes) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                    <span style={{ color: T.inkSub }}>{label}</span>
                    <span style={{ fontWeight: 700, color: T.ink }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Diagnoses and prescriptions from encounter */}
          {claim.encounter && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Clinical Details</div>
              <div style={{ background: T.paperDim, borderRadius: T.radiusSm, padding: "12px 14px" }}>
                {claim.encounter.chief_complaint && (
                  <div style={{ fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: T.inkSub }}>Chief Complaint: </span>
                    <span style={{ color: T.ink }}>{claim.encounter.chief_complaint}</span>
                  </div>
                )}
                {claim.diagnoses?.length > 0 && (
                  <div style={{ fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: T.inkSub }}>Diagnoses: </span>
                    <span style={{ color: T.ink }}>{claim.diagnoses.map(d => `${d.name}${d.icd_code ? ` (${d.icd_code})` : ""}`).join(", ")}</span>
                  </div>
                )}
                {claim.prescriptions?.length > 0 && (
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: T.inkSub }}>Prescriptions: </span>
                    <span style={{ color: T.ink }}>{claim.prescriptions.map(p => p.drug_name).join(", ")}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rejection reason if rejected */}
          {claim.nhis_claim_status === "rejected" && claim.nhis_rejection_reason && (
            <div style={{
              padding: "12px 14px", background: T.roseLight,
              border: `1px solid rgba(184,50,50,0.2)`, borderRadius: T.radiusSm, marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.rose, marginBottom: 4 }}>❌ Rejection Reason</div>
              <div style={{ fontSize: 13, color: T.inkMid }}>{claim.nhis_rejection_reason}</div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(!claim.nhis_claim_status || claim.nhis_claim_status === "draft") && (
              <button onClick={() => onSubmit(claim)} style={{
                padding: "10px 20px", background: T.sage, color: "#fff",
                border: "none", borderRadius: T.radiusSm, fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: "'Syne',sans-serif",
              }}>📤 Submit Claim</button>
            )}
            {claim.nhis_claim_status === "rejected" && (
              <button onClick={() => onSubmit(claim, true)} style={{
                padding: "10px 20px", background: T.amber, color: "#fff",
                border: "none", borderRadius: T.radiusSm, fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: "'Syne',sans-serif",
              }}>📋 Appeal Claim</button>
            )}
            {["submitted", "appealed"].includes(claim.nhis_claim_status) && (
              <>
                <button onClick={() => onUpdateStatus(claim, "approved")} style={{
                  padding: "10px 20px", background: T.sageLight, color: T.sage,
                  border: `1px solid ${T.sageBorder}`, borderRadius: T.radiusSm, fontSize: 13, fontWeight: 700,
                  cursor: "pointer", fontFamily: "'Syne',sans-serif",
                }}>✅ Mark Approved</button>
                <button onClick={() => onUpdateStatus(claim, "rejected")} style={{
                  padding: "10px 20px", background: T.roseLight, color: T.rose,
                  border: `1px solid rgba(184,50,50,0.2)`, borderRadius: T.radiusSm, fontSize: 13, fontWeight: 700,
                  cursor: "pointer", fontFamily: "'Syne',sans-serif",
                }}>❌ Mark Rejected</button>
              </>
            )}
            {claim.nhis_claim_status === "approved" && (
              <button onClick={() => onUpdateStatus(claim, "paid")} style={{
                padding: "10px 20px", background: T.sageLight, color: T.sage,
                border: `1px solid ${T.sageBorder}`, borderRadius: T.radiusSm, fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: "'Syne',sans-serif",
              }}>💰 Mark Paid</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Rejection Modal ──────────────────────────────────────────────────────────
function RejectionModal({ claim, onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  const COMMON_REASONS = [
    "Invalid NHIS number",
    "Patient not enrolled in NHIS",
    "Service not covered under NHIS",
    "Incomplete documentation",
    "Drug not on NHIS formulary",
    "Pre-authorization required",
    "Duplicate claim",
    "Claim submitted after deadline",
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(13,17,23,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: T.white, borderRadius: T.radiusLg, width: "100%", maxWidth: 460,
        boxShadow: "0 24px 64px rgba(13,17,23,0.2)", fontFamily: "'DM Sans',sans-serif",
      }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: T.ink }}>Mark as Rejected</div>
          <div style={{ fontSize: 13, color: T.inkSub, marginTop: 4 }}>Select or enter the rejection reason from NHIS</div>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {COMMON_REASONS.map(r => (
              <button key={r} onClick={() => setReason(r)} style={{
                padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                border: `1px solid ${reason === r ? T.rose : T.border}`,
                background: reason === r ? T.roseLight : T.white,
                color: reason === r ? T.rose : T.inkSub, cursor: "pointer",
              }}>{r}</button>
            ))}
          </div>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Or type custom rejection reason..."
            rows={3}
            style={{
              width: "100%", padding: "10px 14px", border: `1px solid ${T.border}`,
              borderRadius: T.radiusSm, fontSize: 13, resize: "vertical",
              outline: "none", fontFamily: "'DM Sans',sans-serif", boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 10 }}>
          <button onClick={() => onConfirm(reason)} disabled={!reason.trim()} style={{
            flex: 1, padding: "12px", background: reason.trim() ? T.rose : T.paperDim,
            color: reason.trim() ? "#fff" : T.inkSub, border: "none",
            borderRadius: T.radiusSm, fontSize: 14, fontWeight: 700,
            cursor: reason.trim() ? "pointer" : "default", fontFamily: "'Syne',sans-serif",
          }}>Confirm Rejection</button>
          <button onClick={onClose} style={{
            padding: "12px 20px", border: `1px solid ${T.border}`, background: T.white,
            color: T.inkSub, borderRadius: T.radiusSm, fontSize: 14, cursor: "pointer",
          }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AleraNHISClaims() {
  const { role } = useRole?.() || { role: "admin" };
  const { orgId } = useAuth?.() || {};

  const [claims, setClaims]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState("all");
  const [expanded, setExpanded]   = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [search, setSearch]       = useState("");

  // Stats
  const stats = {
    total:     claims.length,
    draft:     claims.filter(c => !c.nhis_claim_status || c.nhis_claim_status === "draft").length,
    submitted: claims.filter(c => c.nhis_claim_status === "submitted").length,
    approved:  claims.filter(c => c.nhis_claim_status === "approved").length,
    rejected:  claims.filter(c => c.nhis_claim_status === "rejected").length,
    paid:      claims.filter(c => c.nhis_claim_status === "paid").length,
    totalValue: claims.reduce((s, c) => s + (c.patient_owes || 0), 0),
    approvedValue: claims.filter(c => ["approved", "paid"].includes(c.nhis_claim_status))
      .reduce((s, c) => s + (c.nhis_amount_approved || c.patient_owes || 0), 0),
  };

  const loadClaims = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    // Load bills with NHIS patients
    const { data } = await supabase
      .from("bills")
      .select(`
        id, bill_number, subtotal, patient_owes, insurance_covers_ngn,
        nhis_number, nhis_claim_status, nhis_amount_approved, nhis_rejection_reason,
        nhis_claim_submitted_at, created_at, updated_at,
        patient:patients!patient_id(
          id, first_name, last_name, nhis_number, hmo_name, insurance_provider
        ),
        encounter:encounters!encounter_id(
          id, chief_complaint, status,
          diagnoses(id, name, icd_code),
          prescriptions(id, drug_name, strength, quantity)
        )
      `)
      .eq("org_id", orgId)
      .not("nhis_number", "is", null)
      .order("created_at", { ascending: false });

    // Also load bills where patient has nhis_number
    const { data: data2 } = await supabase
      .from("bills")
      .select(`
        id, bill_number, subtotal, patient_owes, insurance_covers_ngn,
        nhis_number, nhis_claim_status, nhis_amount_approved, nhis_rejection_reason,
        nhis_claim_submitted_at, created_at, updated_at,
        patient:patients!patient_id(
          id, first_name, last_name, nhis_number, hmo_name, insurance_provider
        ),
        encounter:encounters!encounter_id(
          id, chief_complaint, status,
          diagnoses(id, name, icd_code),
          prescriptions(id, drug_name, strength, quantity)
        )
      `)
      .eq("org_id", orgId)
      .not("patient.nhis_number", "is", null)
      .order("created_at", { ascending: false });

    // Merge and deduplicate
    const all = [...(data || []), ...(data2 || [])];
    const seen = new Set();
    const unique = all.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    setClaims(unique);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { loadClaims(); }, [loadClaims]);

  async function handleSubmit(claim, isAppeal = false) {
    const newStatus = isAppeal ? "appealed" : "submitted";
    await supabase.from("bills").update({
      nhis_claim_status: newStatus,
      nhis_claim_submitted_at: new Date().toISOString(),
      nhis_number: claim.patient?.nhis_number || claim.nhis_number,
    }).eq("id", claim.id);
    loadClaims();
  }

  async function handleUpdateStatus(claim, newStatus) {
    if (newStatus === "rejected") {
      setRejecting(claim);
      return;
    }
    await supabase.from("bills").update({
      nhis_claim_status: newStatus,
      ...(newStatus === "approved" ? { nhis_amount_approved: claim.patient_owes } : {}),
    }).eq("id", claim.id);
    loadClaims();
  }

  async function handleConfirmRejection(reason) {
    await supabase.from("bills").update({
      nhis_claim_status: "rejected",
      nhis_rejection_reason: reason,
    }).eq("id", rejecting.id);
    setRejecting(null);
    loadClaims();
  }

  // Filter and search
  const filtered = claims.filter(c => {
    const matchStatus = filter === "all" || (c.nhis_claim_status || "draft") === filter;
    const name = `${c.patient?.first_name || ""} ${c.patient?.last_name || ""} ${c.bill_number || ""} ${c.nhis_number || ""}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div style={{ minHeight: "100vh", background: T.paper, fontFamily: "'DM Sans',sans-serif", color: T.ink }}>

      {/* Header */}
      <div style={{
        background: T.white, borderBottom: `1px solid ${T.border}`,
        padding: "16px 28px", position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: T.ink }}>
            NHIS Claims
          </div>
          <div style={{ fontSize: 12, color: T.inkSub }}>
            {fmt(stats.approvedValue)} approved of {fmt(stats.totalValue)} total
          </div>
        </div>
      </div>

      <div style={{ padding: "20px 28px", maxWidth: 1100, margin: "0 auto" }}>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Total Claims", value: stats.total, color: T.ink },
            { label: "Draft", value: stats.draft, color: T.inkSub, key: "draft" },
            { label: "Submitted", value: stats.submitted, color: T.blue, key: "submitted" },
            { label: "Approved", value: stats.approved, color: T.sage, key: "approved" },
            { label: "Rejected", value: stats.rejected, color: T.rose, key: "rejected" },
            { label: "Paid", value: stats.paid, color: T.sage, key: "paid" },
          ].map(({ label, value, color, key }) => (
            <button key={label} onClick={() => setFilter(key || "all")} style={{
              background: filter === (key || "all") ? T.sageLight : T.white,
              border: `1px solid ${filter === (key || "all") ? T.sageBorder : T.border}`,
              borderRadius: T.radiusSm, padding: "12px 14px", cursor: "pointer", textAlign: "left",
            }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color, marginBottom: 2 }}>{value}</div>
              <div style={{ fontSize: 11, color: T.inkSub }}>{label}</div>
            </button>
          ))}
        </div>

        {/* Search and filter */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by patient name, bill number, NHIS number..."
            style={{
              flex: 1, padding: "10px 14px", border: `1px solid ${T.border}`,
              borderRadius: T.radiusSm, fontSize: 13, outline: "none",
              fontFamily: "'DM Sans',sans-serif",
            }}
          />
          <div style={{ fontSize: 13, color: T.inkSub, whiteSpace: "nowrap" }}>
            {filtered.length} claim{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Claims list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: T.inkSub }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            Loading claims…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: "center", padding: 48, background: T.white,
            borderRadius: T.radius, border: `1px solid ${T.border}`,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏥</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: T.ink, marginBottom: 4 }}>
              No NHIS Claims Found
            </div>
            <div style={{ fontSize: 13, color: T.inkSub }}>
              Claims are automatically generated for patients with NHIS numbers after billing.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map(claim => (
              <ClaimCard
                key={claim.id}
                claim={claim}
                expanded={expanded === claim.id}
                onToggle={() => setExpanded(expanded === claim.id ? null : claim.id)}
                onSubmit={handleSubmit}
                onUpdateStatus={handleUpdateStatus}
              />
            ))}
          </div>
        )}
      </div>

      {/* Rejection modal */}
      {rejecting && (
        <RejectionModal
          claim={rejecting}
          onConfirm={handleConfirmRejection}
          onClose={() => setRejecting(null)}
        />
      )}
    </div>
  );
}
