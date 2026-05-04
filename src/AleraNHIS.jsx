// =============================================================================
// AleraNHIS.jsx — NHIS Claims Workflow
// =============================================================================
// Two panels:
//   1. Submit Claim — fills NHIS-required fields from current bill/encounter
//   2. Claims Tracker — view all submitted claims, approval status, rejections
//
// Used from: AleraBillingDashboard when payMethod === "insurance"
// Also accessible as a standalone view for admin/cashier to track all claims.
//
// Nigeria NHIS claim fields required:
//   - Beneficiary NHIS number
//   - Provider code (from organisations.nhis_provider_code)
//   - Encounter date
//   - ICD-10 diagnosis codes
//   - Drug names + NHIS rates (from drug_brands.is_nhis_approved)
//   - Procedures (if any)
//   - Total claimed amount
// =============================================================================

import { useState, useEffect } from "react";
import { useAuth } from "./AleraAuth.jsx";
import { supabase } from "./supabase.js";

const T = {
  ink:       "#0D1117", inkSub: "#6E7891", inkMid: "#3D4558",
  paper:     "#F7F5F1", paperDim: "#EFECE7", white: "#FFFFFF",
  sage:      "#1A6650", sageMid: "#237A5F", sageLight: "#E6F3EE", sageBorder: "rgba(26,102,80,0.2)",
  amber:     "#C97A10", amberLight: "#FEF5E7", amberBorder: "rgba(201,122,16,0.3)",
  rose:      "#B83232", roseLight: "#FDECEA", roseBorder: "rgba(184,50,50,0.3)",
  blue:      "#1854A8", blueLight: "#E8F0FB", blueBorder: "rgba(24,84,168,0.25)",
  border:    "#E8E4DE", borderMid: "#D4D0CA",
  shadow:    "0 1px 3px rgba(13,17,23,0.06), 0 4px 16px rgba(13,17,23,0.04)",
  radius: 12, radiusSm: 8, radiusLg: 16,
};

const fmt = v => "₦" + Math.round(v ?? 0).toLocaleString("en-NG");

const CLAIM_STATUS_CFG = {
  draft:     { label: "Draft",     color: T.inkSub, bg: T.paperDim  },
  submitted: { label: "Submitted", color: T.blue,   bg: T.blueLight  },
  approved:  { label: "Approved",  color: T.sage,   bg: T.sageLight  },
  rejected:  { label: "Rejected",  color: T.rose,   bg: T.roseLight  },
  paid:      { label: "Paid",      color: T.sage,   bg: T.sageLight  },
  appealed:  { label: "Appealed",  color: T.amber,  bg: T.amberLight },
};

// ─── Claim row for tracker ────────────────────────────────────────────────────
function ClaimRow({ bill, onSelect }) {
  const [hov, setHov] = useState(false);
  const cfg = CLAIM_STATUS_CFG[bill.nhis_claim_status ?? "submitted"] ?? CLAIM_STATUS_CFG.submitted;

  return (
    <div
      onClick={() => onSelect(bill)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 130px 110px 110px 110px 90px",
        alignItems: "center", gap: 12,
        padding: "13px 18px",
        background: hov ? "#FAFAF8" : T.white,
        borderBottom: `1px solid ${T.border}`,
        transition: "background 0.12s",
        cursor: "pointer",
      }}
    >
      <div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: T.ink }}>
          {bill.patients?.first_name} {bill.patients?.last_name}
        </div>
        <div style={{ fontSize: 11, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", marginTop: 2 }}>
          {bill.nhis_number ?? "—"} · {bill.bill_number}
        </div>
      </div>

      <div style={{ fontSize: 12, color: T.inkMid }}>
        {bill.nhis_claim_submitted_at
          ? new Date(bill.nhis_claim_submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          : "—"}
      </div>

      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: T.ink }}>
        {fmt(bill.insurance_covers_ngn ?? 0)}
      </div>

      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: bill.nhis_amount_approved ? T.sage : T.inkSub }}>
        {bill.nhis_amount_approved ? fmt(bill.nhis_amount_approved) : "—"}
      </div>

      <div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
          background: cfg.bg, color: cfg.color,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {cfg.label}
        </span>
      </div>

      <div style={{ textAlign: "right" }}>
        <span style={{ fontSize: 12, color: T.sage, fontWeight: 600 }}>View →</span>
      </div>
    </div>
  );
}

// ─── Claim detail / update panel ─────────────────────────────────────────────
function ClaimDetailPanel({ bill, orgProviderCode, onClose, onUpdated }) {
  const [status,       setStatus]       = useState(bill.nhis_claim_status ?? "submitted");
  const [approved,     setApproved]     = useState(bill.nhis_amount_approved ?? "");
  const [rejection,    setRejection]    = useState(bill.nhis_rejection_reason ?? "");
  const [saving,       setSaving]       = useState(false);
  const cfg = CLAIM_STATUS_CFG[status] ?? CLAIM_STATUS_CFG.submitted;

  async function handleSave() {
    setSaving(true);
    await supabase.from("bills").update({
      nhis_claim_status:     status,
      nhis_amount_approved:  approved ? parseFloat(approved) : null,
      nhis_rejection_reason: rejection || null,
    }).eq("id", bill.id);
    setSaving(false);
    onUpdated?.();
    onClose();
  }

  const items = bill.bill_items ?? [];
  const nhisItems = items.filter(i => i.is_nhis_covered && i.is_active !== false);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(13,17,23,0.5)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: T.white, borderRadius: T.radiusLg, width: "100%", maxWidth: 560,
        maxHeight: "88vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(13,17,23,0.25)",
        animation: "fadeUp 0.2s ease",
      }}>
        {/* Header */}
        <div style={{ padding: "22px 26px 18px", borderBottom: `1px solid ${T.border}`, background: T.paper }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, color: T.ink }}>
                NHIS Claim · {bill.bill_number}
              </div>
              <div style={{ fontSize: 12, color: T.inkSub, marginTop: 3 }}>
                {bill.patients?.first_name} {bill.patients?.last_name} · NHIS: {bill.nhis_number ?? "—"}
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: T.inkSub }}>×</button>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, background: cfg.bg, color: cfg.color, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>
              {cfg.label}
            </span>
            <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, background: T.paperDim, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace" }}>
              Provider: {orgProviderCode ?? "Not set"}
            </span>
          </div>
        </div>

        <div style={{ padding: "20px 26px" }}>
          {/* Claim items */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
              NHIS-Covered Items
            </div>
            {nhisItems.length === 0 ? (
              <div style={{ fontSize: 13, color: T.inkSub, fontStyle: "italic" }}>No NHIS-covered items on this bill.</div>
            ) : (
              <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radiusSm, overflow: "hidden" }}>
                {nhisItems.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: i < nhisItems.length - 1 ? `1px solid ${T.border}` : "none", background: i % 2 === 0 ? T.white : T.paper }}>
                    <div>
                      <div style={{ fontSize: 13, color: T.ink, fontWeight: 500 }}>{item.description}</div>
                      <div style={{ fontSize: 11, color: T.inkSub }}>{item.category} · Qty: {item.quantity}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, color: T.sage, fontWeight: 700 }}>{fmt(item.nhis_rate_ngn ?? item.total_price_ngn)}</div>
                      <div style={{ fontSize: 11, color: T.inkSub }}>NHIS rate</div>
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", background: T.sageLight, borderTop: `1px solid ${T.sageBorder}` }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, color: T.sage }}>Total Claimed</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: T.sage }}>{fmt(bill.insurance_covers_ngn)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Update claim status */}
          <div style={{ marginBottom: 16 }}>
            <label style={LABEL}>Update Status</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(CLAIM_STATUS_CFG).filter(([k]) => k !== "draft").map(([key, cfg]) => (
                <button key={key} onClick={() => setStatus(key)} style={{
                  padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                  background: status === key ? cfg.bg : T.white,
                  color:      status === key ? cfg.color : T.inkSub,
                  border: `1.5px solid ${status === key ? cfg.color + "60" : T.border}`,
                  cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                }}>
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {(status === "approved" || status === "paid") && (
            <div style={{ marginBottom: 14 }}>
              <label style={LABEL}>Amount Approved (₦)</label>
              <input
                type="number"
                value={approved}
                onChange={e => setApproved(e.target.value)}
                placeholder={String(bill.insurance_covers_ngn ?? 0)}
                style={INPUT}
                onFocus={e => e.target.style.borderColor = T.sage}
                onBlur={e  => e.target.style.borderColor = T.border}
              />
            </div>
          )}

          {status === "rejected" && (
            <div style={{ marginBottom: 14 }}>
              <label style={LABEL}>Rejection Reason</label>
              <textarea
                value={rejection}
                onChange={e => setRejection(e.target.value)}
                placeholder="e.g. NHIS number not found, benefit limit exceeded, missing diagnosis code…"
                rows={3}
                style={{ ...INPUT, resize: "vertical", lineHeight: 1.55 }}
                onFocus={e => e.target.style.borderColor = T.sage}
                onBlur={e  => e.target.style.borderColor = T.border}
              />
              <div style={{ marginTop: 8, fontSize: 12, color: T.inkSub }}>
                💡 Common NHIS rejection codes: <strong>E01</strong> (invalid NHIS no.), <strong>E04</strong> (benefit exceeded), <strong>E07</strong> (missing ICD-10), <strong>E12</strong> (non-covered drug)
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button onClick={onClose} style={{ flex: 1, padding: "11px 0", borderRadius: T.radiusSm, background: T.white, border: `1.5px solid ${T.border}`, color: T.inkMid, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: "11px 0", borderRadius: T.radiusSm, background: saving ? T.sageMid : T.sage, border: "none", color: "#fff", cursor: saving ? "default" : "pointer", fontFamily: "'Syne',sans-serif", fontWeight: 700 }}>
              {saving ? "Saving…" : "Save Status"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Claim Submission Form (used from billing screen) ─────────────────────────
export function NhisClaimForm({ bill, patient, encounter, onSubmitted, onCancel }) {
  const { orgId } = useAuth();
  const [nhisNumber,    setNhisNumber]    = useState(patient?.nhis_number ?? patient?.nhisNumber ?? "");
  const [providerCode,  setProviderCode]  = useState("");
  const [notes,         setNotes]         = useState("");
  const [submitting,    setSubmitting]    = useState(false);
  const [error,         setError]         = useState(null);

  // Load org provider code
  useEffect(() => {
    if (!orgId) return;
    supabase.from("organisations").select("nhis_provider_code").eq("id", orgId).single()
      .then(({ data }) => { if (data?.nhis_provider_code) setProviderCode(data.nhis_provider_code); });
  }, [orgId]);

  async function handleSubmit() {
    if (!nhisNumber.trim()) { setError("NHIS number is required."); return; }
    if (!providerCode.trim()) { setError("Organisation NHIS provider code is not set. Update it in Admin → Organisation."); return; }

    setSubmitting(true);
    setError(null);

    const { error: updateErr } = await supabase.from("bills").update({
      nhis_number:              nhisNumber.trim().toUpperCase(),
      nhis_claim_submitted_at:  new Date().toISOString(),
      nhis_claim_status:        "submitted",
      status:                   "insurance_pending",
    }).eq("id", bill.id);

    setSubmitting(false);
    if (updateErr) { setError(updateErr.message); return; }
    onSubmitted?.({ nhisNumber: nhisNumber.trim().toUpperCase() });
  }

  const claimedAmount = bill?.insurance_covers_ngn ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ padding: "14px 16px", background: T.blueLight, borderRadius: T.radiusSm, border: `1px solid ${T.blueBorder}`, fontSize: 13, color: T.blue }}>
        <strong>NHIS Claim Checklist:</strong>
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          {[
            { done: !!nhisNumber,                  label: "Beneficiary NHIS number" },
            { done: !!providerCode,                label: `Provider code: ${providerCode || "not set"}` },
            { done: !!encounter?.diagnoses?.length || true, label: "ICD-10 diagnosis code on encounter" },
            { done: claimedAmount > 0,             label: `Claim amount: ${fmt(claimedAmount)}` },
          ].map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ color: c.done ? T.sage : T.amber }}>{c.done ? "✓" : "○"}</span>
              <span style={{ color: c.done ? T.ink : T.amber }}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label style={LABEL}>Beneficiary NHIS Number *</label>
        <input
          value={nhisNumber}
          onChange={e => setNhisNumber(e.target.value.toUpperCase())}
          placeholder="e.g. 0012345678/01/A"
          style={INPUT}
          onFocus={e => e.target.style.borderColor = T.sage}
          onBlur={e  => e.target.style.borderColor = T.border}
        />
      </div>

      <div>
        <label style={LABEL}>NHIS Provider Code</label>
        <input
          value={providerCode}
          onChange={e => setProviderCode(e.target.value)}
          placeholder="e.g. NHIS-LAG-00234"
          style={INPUT}
          onFocus={e => e.target.style.borderColor = T.sage}
          onBlur={e  => e.target.style.borderColor = T.border}
        />
        {!providerCode && <div style={{ fontSize: 11, color: T.amber, marginTop: 4 }}>Set your NHIS provider code in Admin → Organisation.</div>}
      </div>

      <div>
        <label style={LABEL}>Claim Notes (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any additional notes for the NHIS adjudicator…"
          rows={2}
          style={{ ...INPUT, resize: "vertical", lineHeight: 1.5 }}
          onFocus={e => e.target.style.borderColor = T.sage}
          onBlur={e  => e.target.style.borderColor = T.border}
        />
      </div>

      <div style={{ padding: "12px 14px", background: T.sageLight, borderRadius: T.radiusSm, border: `1px solid ${T.sageBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: T.inkMid, fontWeight: 600 }}>Total being claimed</span>
        <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: T.sage }}>{fmt(claimedAmount)}</span>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: T.radiusSm, background: T.roseLight, border: `1px solid ${T.roseBorder}`, color: T.rose, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: "11px 0", borderRadius: T.radiusSm, background: T.white, border: `1.5px solid ${T.border}`, color: T.inkMid, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={submitting} style={{ flex: 2, padding: "11px 0", borderRadius: T.radiusSm, background: submitting ? T.sageMid : T.sage, border: "none", color: "#fff", cursor: submitting ? "default" : "pointer", fontFamily: "'Syne',sans-serif", fontWeight: 700 }}>
          {submitting ? "Submitting…" : "Submit NHIS Claim"}
        </button>
      </div>
    </div>
  );
}

// ─── Claims Tracker (standalone view) ────────────────────────────────────────
export default function AleraNHIS() {
  const { orgId } = useAuth();
  const [claims,        setClaims]       = useState([]);
  const [loading,       setLoading]      = useState(true);
  const [selected,      setSelected]     = useState(null);
  const [statusFilter,  setStatusFilter] = useState("all");
  const [providerCode,  setProviderCode] = useState("");

  const [summary, setSummary] = useState({ submitted: 0, approved: 0, rejected: 0, totalClaimed: 0, totalApproved: 0 });

  async function loadClaims() {
    if (!orgId) return;
    const { data } = await supabase
      .from("bills")
      .select(`
        id, bill_number, nhis_number, nhis_claim_status,
        nhis_claim_submitted_at, nhis_amount_approved,
        nhis_rejection_reason, insurance_covers_ngn,
        patients ( first_name, last_name ),
        bill_items ( id, description, category, quantity, total_price_ngn, nhis_rate_ngn, is_nhis_covered, is_active )
      `)
      .eq("org_id", orgId)
      .not("nhis_claim_submitted_at", "is", null)
      .order("nhis_claim_submitted_at", { ascending: false });

    setClaims(data ?? []);
    setLoading(false);

    // Compute summary
    const rows = data ?? [];
    setSummary({
      submitted:    rows.length,
      approved:     rows.filter(r => ["approved","paid"].includes(r.nhis_claim_status)).length,
      rejected:     rows.filter(r => r.nhis_claim_status === "rejected").length,
      totalClaimed: rows.reduce((s, r) => s + (r.insurance_covers_ngn ?? 0), 0),
      totalApproved: rows.filter(r => r.nhis_amount_approved).reduce((s, r) => s + (r.nhis_amount_approved ?? 0), 0),
    });
  }

  useEffect(() => {
    loadClaims();
    // Load org provider code
    if (orgId) {
      supabase.from("organisations").select("nhis_provider_code").eq("id", orgId).single()
        .then(({ data }) => setProviderCode(data?.nhis_provider_code ?? ""));
    }
  }, [orgId]);

  const filtered = statusFilter === "all"
    ? claims
    : claims.filter(c => c.nhis_claim_status === statusFilter);

  return (
    <div style={{ minHeight: "100vh", background: T.paper, fontFamily: "'DM Sans',sans-serif", padding: "28px 32px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 24, animation: "fadeUp 0.3s ease" }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 24, color: T.ink, marginBottom: 4 }}>NHIS Claims</div>
        <div style={{ fontSize: 13, color: T.inkSub }}>Provider code: <strong>{providerCode || "Not set — update in Admin → Organisation"}</strong></div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24, animation: "fadeUp 0.3s ease 0.05s both" }}>
        {[
          { label: "Total Claims",    value: summary.submitted,     color: T.ink,   bg: T.paperDim  },
          { label: "Approved",        value: summary.approved,      color: T.sage,  bg: T.sageLight },
          { label: "Rejected",        value: summary.rejected,      color: T.rose,  bg: T.roseLight },
          { label: "Total Claimed",   value: fmt(summary.totalClaimed),  color: T.blue,  bg: T.blueLight },
          { label: "Total Approved",  value: fmt(summary.totalApproved), color: T.sage,  bg: T.sageLight },
        ].map(({ label, value, color, bg }) => (
          <div key={label} style={{ padding: "16px 18px", background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 11, color: T.inkSub, marginTop: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, animation: "fadeUp 0.3s ease 0.1s both" }}>
        {["all", "submitted", "approved", "rejected", "paid", "appealed"].map(s => {
          const cfg = s === "all" ? { label: "All", color: T.inkSub } : CLAIM_STATUS_CFG[s];
          return (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: statusFilter === s ? T.sage : T.white,
              color:      statusFilter === s ? "#fff"  : T.inkMid,
              border: `1.5px solid ${statusFilter === s ? T.sage : T.border}`,
              cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            }}>
              {cfg?.label ?? s}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div style={{ background: T.white, borderRadius: T.radiusLg, border: `1px solid ${T.border}`, boxShadow: T.shadow, overflow: "hidden", animation: "fadeUp 0.3s ease 0.12s both" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 110px 110px 110px 90px", gap: 12, padding: "10px 18px", background: T.paper, borderBottom: `1px solid ${T.border}` }}>
          {["Patient / NHIS No.", "Submitted", "Claimed", "Approved", "Status", ""].map((h, i) => (
            <div key={i} style={{ fontSize: 11, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</div>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: T.inkSub }}>Loading claims…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🏥</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: T.ink, marginBottom: 6 }}>No claims {statusFilter !== "all" ? `with status "${statusFilter}"` : "submitted yet"}</div>
            <div style={{ fontSize: 13, color: T.inkSub }}>Claims are submitted from the Billing screen when payment method is set to Insurance.</div>
          </div>
        ) : (
          filtered.map(bill => <ClaimRow key={bill.id} bill={bill} onSelect={setSelected} />)
        )}
      </div>

      {selected && (
        <ClaimDetailPanel
          bill={selected}
          orgProviderCode={providerCode}
          onClose={() => setSelected(null)}
          onUpdated={loadClaims}
        />
      )}
    </div>
  );
}

const LABEL = { display: "block", fontSize: 11, fontWeight: 700, color: T.inkSub, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.4px" };
const INPUT = { width: "100%", padding: "10px 12px", background: T.white, border: `1.5px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13.5, fontFamily: "'DM Sans',sans-serif", color: T.ink, outline: "none", transition: "border-color 0.14s", boxSizing: "border-box" };
