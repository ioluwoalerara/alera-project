import { useState } from "react";
import AleraPatientLookup from "./AleraPatientLookup.jsx";
import { useRole } from "./AleraShell.jsx";
import { useAuth } from "./AleraAuth.jsx";

// ─── Design Tokens (matches Alera system) ─────────────────────────────────────
const T = {
  ink:      "#0D1117", inkSub: "#6E7891", inkMid: "#3D4558",
  paper:    "#F7F5F1", paperDim: "#EFECE7", white: "#FFFFFF",
  sage:     "#1A6650", sageMid: "#237A5F", sageLight: "#E6F3EE", sageBorder: "rgba(26,102,80,0.2)",
  blue:     "#1854A8", blueLight: "#E8F0FB",
  amber:    "#C97A10", amberLight: "#FEF5E7",
  rose:     "#B83232", roseLight: "#FDECEA",
  purple:   "#5E3FAE", purpleLight: "#F0EBFF",
  border:   "#E8E4DE", borderMid: "#D4D0CA",
  shadow:   "0 1px 3px rgba(13,17,23,0.06), 0 4px 16px rgba(13,17,23,0.04)",
  radius: 12, radiusSm: 8, radiusLg: 16,
};

const fmt = v => "₦" + Math.round(v).toLocaleString("en-NG");

// ─── Mock prescription for fallback ──────────────────────────────────────────
const MOCK_RX = [
  { id: 1, drug: "Artemether/Lumefantrine", strength: "80mg/480mg", form: "Tablet", brand: "Coartem",   qty: 6,  freq: "BD", duration: "3 days", route: "Oral", price: 2000, instructions: "Take with food or fat-containing drink." },
  { id: 2, drug: "Paracetamol",             strength: "500mg",       form: "Tablet", brand: "Panadol",   qty: 15, freq: "TDS", duration: "5 days", route: "Oral", price: 200,  instructions: "Do not exceed 4g/day." },
  { id: 3, drug: "Oral Rehydration Salts",  strength: "1 sachet",    form: "Sachet", brand: "Electroral", qty: 3,  freq: "TDS", duration: "1 day",  route: "Oral", price: 150,  instructions: "Mix in 200ml clean water." },
];

const MOCK_PATIENT = {
  name: "Adaeze Okafor", age: 33, sex: "Female",
  patientNumber: "ALR-0001", visitId: "VIS-20250225-0847",
  diagnosis: "Malaria (P. falciparum)",
  doctor: "Dr. Chidi Okonkwo",
  allergies: "None",
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function Tag({ children, color, bg }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
      color, background: bg, fontFamily: "'Syne',sans-serif",
    }}>{children}</span>
  );
}

function DrugCard({ item, dispensed, onToggle }) {
  const checked = dispensed[item.id] ?? false;
  return (
    <div style={{
      background: T.white,
      border: `2px solid ${checked ? T.sage : T.border}`,
      borderRadius: T.radius,
      padding: "20px 24px",
      transition: "all 0.2s",
      opacity: checked ? 0.75 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        {/* Checkbox */}
        <button
          onClick={() => onToggle(item.id)}
          style={{
            width: 24, height: 24, borderRadius: 6, flexShrink: 0, marginTop: 2,
            border: `2px solid ${checked ? T.sage : T.borderMid}`,
            background: checked ? T.sage : T.white,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "all 0.15s",
          }}
        >
          {checked && <span style={{ color: "#fff", fontSize: 14, fontWeight: 900 }}>✓</span>}
        </button>

        {/* Drug info */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: T.ink }}>
              {item.drug}
            </span>
            <Tag color={T.blue} bg={T.blueLight}>{item.strength}</Tag>
            <Tag color={T.inkSub} bg={T.paperDim}>{item.form}</Tag>
            {item.brand && (
              <Tag color={T.purple} bg={T.purpleLight}>Brand: {item.brand}</Tag>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "6px 20px", marginBottom: 10 }}>
            {[
              { label: "Qty", value: `${item.qty} ${item.form.toLowerCase()}s` },
              { label: "Frequency", value: item.freq },
              { label: "Duration", value: item.duration },
              { label: "Route", value: item.route },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: T.inkSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 1 }}>{label}</div>
                <div style={{ fontSize: 13, color: T.inkMid, fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>

          {item.instructions && (
            <div style={{
              padding: "8px 12px", background: T.amberLight,
              borderRadius: T.radiusSm, fontSize: 12, color: T.amber,
              borderLeft: `3px solid ${T.amber}`,
            }}>
              ⚠ {item.instructions}
            </div>
          )}
        </div>

        {/* Price */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 15, color: T.ink }}>{fmt(item.price)}</div>
          <div style={{ fontSize: 11, color: T.inkSub }}>per item</div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AleraDispensingScreen({ patient, onComplete }) {
  const hasPatient = !!(patient?._db_id);
  if (!hasPatient) return <AleraPatientLookup screenName="Dispensing" screenIcon="💊" onSelect={p => onComplete?.({ _lookup: true, patient: p })} />;
  const { role } = useRole?.() || { role: "pharmacist" };
  const { orgId, staffId } = useAuth?.() || {};

  // Use real prescription from patient state if available, else mock
  const rxList = patient.rxList?.length ? patient.rxList : MOCK_RX;

  const [dispensed, setDispensed]   = useState({});
  const [notes, setNotes]           = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed]   = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const toggleDrug = id => setDispensed(d => ({ ...d, [id]: !d[id] }));
  const allDispensed = rxList.every(r => dispensed[r.id]);
  const dispensedCount = rxList.filter(r => dispensed[r.id]).length;
  const totalValue = rxList.filter(r => dispensed[r.id]).reduce((s, r) => s + (r.price || 0), 0);

  function handleConfirmDispense() {
    setConfirming(true);
    setTimeout(() => {
      setConfirming(false);
      setConfirmed(true);
      setShowConfirmModal(false);
      // After 1.5s show confirmed state then call onComplete
      setTimeout(() => {
        onComplete?.({
          dispensed: true,
          dispensedItems: rxList.filter(r => dispensed[r.id]),
          dispensingNotes: notes,
          totalValue,
        });
      }, 1500);
    }, 1000);
  }

  if (confirmed) {
    return (
      <div style={{
        minHeight: "100vh", background: T.paper, display: "flex",
        alignItems: "center", justifyContent: "center",
        fontFamily: "'DM Sans',sans-serif",
      }}>
        <div style={{ textAlign: "center", animation: "fadeUp 0.4s ease" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 24, color: T.ink, marginBottom: 8 }}>
            Drugs Dispensed
          </div>
          <div style={{ color: T.inkSub, fontSize: 15 }}>
            {patient.name} has been sent to billing
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.paper, fontFamily: "'DM Sans',sans-serif", color: T.ink }}>

      {/* ── Header ── */}
      <header style={{
        background: T.white, height: 54, borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: T.ink, letterSpacing: -0.5 }}>
            al<span style={{ color: T.sage }}>era</span>
          </div>
          <div style={{ width: 1, height: 16, background: T.border }} />
          <nav style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: T.inkSub }}>
            <span>Dispensing</span>
            <span style={{ color: T.borderMid, margin: "0 3px" }}>›</span>
            <span>{patient.name}</span>
            <span style={{ color: T.borderMid, margin: "0 3px" }}>›</span>
            <span style={{ color: T.inkMid, fontFamily: "'JetBrains Mono',monospace" }}>{patient.visitId || patient.patientNumber}</span>
          </nav>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{
            padding: "5px 12px", background: T.purpleLight,
            border: `1px solid rgba(94,63,174,0.2)`, borderRadius: 6,
            fontSize: 12, fontWeight: 700, color: T.purple, fontFamily: "'Syne',sans-serif",
          }}>
            💊 Pharmacist — Dispense Drugs
          </div>
          <span style={{ fontSize: 11.5, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace" }}>
            {dispensedCount}/{rxList.length} dispensed
          </span>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", minHeight: "calc(100vh - 54px)" }}>

        {/* ── Left: Prescription list ── */}
        <div style={{ padding: "28px 24px 48px 28px", overflowY: "auto" }}>

          {/* Patient summary */}
          <div style={{
            background: T.white, borderRadius: T.radius, padding: "16px 20px",
            border: `1px solid ${T.border}`, marginBottom: 20,
            display: "flex", gap: 32, flexWrap: "wrap",
          }}>
            {[
              { label: "Patient",    value: patient.name },
              { label: "Age / Sex",  value: `${patient.age || "—"} · ${patient.sex || "—"}` },
              { label: "Diagnosis",  value: patient.diagnosis || "—" },
              { label: "Prescribed by", value: patient.provider || patient.assignedDoctor?.name || "—" },
              { label: "Allergies", value: patient.allergies || "None", alert: patient.allergies && patient.allergies !== "None" },
            ].map(({ label, value, alert }) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: T.inkSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: alert ? T.rose : T.inkMid }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: T.ink }}>
              Prescription ({rxList.length} {rxList.length === 1 ? "item" : "items"})
            </div>
            {!allDispensed && (
              <button
                onClick={() => setDispensed(Object.fromEntries(rxList.map(r => [r.id, true])))}
                style={{
                  padding: "5px 14px", borderRadius: T.radiusSm, border: `1px solid ${T.sageBorder}`,
                  background: T.sageLight, color: T.sage, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "'Syne',sans-serif",
                }}
              >
                Mark all dispensed
              </button>
            )}
          </div>

          {/* Drug cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rxList.map(item => (
              <DrugCard
                key={item.id}
                item={item}
                dispensed={dispensed}
                onToggle={toggleDrug}
              />
            ))}
          </div>

          {/* Pharmacist notes */}
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.inkSub, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Dispensing Notes (optional)
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Brand substituted — Coartem out of stock, dispensed Lonart instead..."
              rows={3}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: T.radiusSm,
                border: `1px solid ${T.border}`, fontSize: 13, color: T.ink,
                background: T.white, resize: "vertical", fontFamily: "'DM Sans',sans-serif",
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* ── Right: Summary panel ── */}
        <div style={{
          borderLeft: `1px solid ${T.border}`, padding: "24px 20px",
          background: T.white, display: "flex", flexDirection: "column", gap: 20,
        }}>

          {/* Progress */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
              Dispensing Progress
            </div>
            <div style={{ background: T.paperDim, borderRadius: 6, height: 8, overflow: "hidden", marginBottom: 8 }}>
              <div style={{
                height: "100%", borderRadius: 6,
                background: allDispensed ? T.sage : T.blue,
                width: `${rxList.length ? (dispensedCount / rxList.length) * 100 : 0}%`,
                transition: "width 0.3s ease",
              }} />
            </div>
            <div style={{ fontSize: 13, color: T.inkMid }}>
              {dispensedCount} of {rxList.length} items marked dispensed
            </div>
          </div>

          {/* Items list */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
              Items
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rxList.map(r => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                    background: dispensed[r.id] ? T.sage : T.paperDim,
                    border: `1.5px solid ${dispensed[r.id] ? T.sage : T.borderMid}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {dispensed[r.id] && <span style={{ color: "#fff", fontSize: 10, fontWeight: 900 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1, fontSize: 13, color: dispensed[r.id] ? T.inkSub : T.ink, textDecoration: dispensed[r.id] ? "line-through" : "none" }}>
                    {r.drug}
                  </div>
                  <div style={{ fontSize: 12, color: T.inkSub }}>{fmt(r.price || 0)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          {dispensedCount > 0 && (
            <div style={{
              padding: "12px 16px", background: T.sageLight,
              borderRadius: T.radiusSm, border: `1px solid ${T.sageBorder}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: T.sage, fontWeight: 600 }}>Drug total</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: T.sage }}>{fmt(totalValue)}</div>
              </div>
            </div>
          )}

          {/* Not all dispensed warning */}
          {!allDispensed && dispensedCount > 0 && (
            <div style={{
              padding: "10px 14px", background: T.amberLight,
              borderRadius: T.radiusSm, fontSize: 12, color: T.amber,
              border: `1px solid rgba(201,122,16,0.2)`,
            }}>
              ⚠ {rxList.length - dispensedCount} item{rxList.length - dispensedCount > 1 ? "s" : ""} not yet marked dispensed
            </div>
          )}

          {/* Confirm button */}
          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={dispensedCount === 0}
            style={{
              padding: "14px", borderRadius: T.radius, border: "none",
              background: dispensedCount === 0 ? T.paperDim : T.sage,
              color: dispensedCount === 0 ? T.inkSub : "#fff",
              fontSize: 14, fontWeight: 700, cursor: dispensedCount === 0 ? "default" : "pointer",
              fontFamily: "'Syne',sans-serif", transition: "all 0.15s",
              marginTop: "auto",
            }}
          >
            {allDispensed ? "✓ Confirm Dispense → Billing" : `Confirm ${dispensedCount} Item${dispensedCount !== 1 ? "s" : ""} → Billing`}
          </button>
        </div>
      </div>

      {/* ── Confirm Modal ── */}
      {showConfirmModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(13,17,23,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{
            background: T.white, borderRadius: T.radiusLg, padding: 36, width: 400,
            boxShadow: "0 24px 64px rgba(13,17,23,0.2)", fontFamily: "'DM Sans',sans-serif",
          }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: T.ink, marginBottom: 8 }}>
              Confirm Dispensing
            </div>
            <div style={{ fontSize: 14, color: T.inkSub, marginBottom: 20 }}>
              You are about to confirm dispensing {dispensedCount} of {rxList.length} items for <strong>{patient.name}</strong>.
              {!allDispensed && (
                <span style={{ color: T.amber, display: "block", marginTop: 8 }}>
                  ⚠ {rxList.length - dispensedCount} item{rxList.length - dispensedCount > 1 ? "s" : ""} will be marked as not dispensed.
                </span>
              )}
            </div>

            {notes && (
              <div style={{
                padding: "10px 14px", background: T.paperDim, borderRadius: T.radiusSm,
                fontSize: 13, color: T.inkMid, marginBottom: 20,
                fontStyle: "italic",
              }}>
                Note: {notes}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={handleConfirmDispense}
                disabled={confirming}
                style={{
                  flex: 1, padding: "12px", borderRadius: T.radiusSm, border: "none",
                  background: T.sage, color: "#fff", fontSize: 14, fontWeight: 700,
                  cursor: confirming ? "default" : "pointer", fontFamily: "'Syne',sans-serif",
                }}
              >
                {confirming ? "Confirming…" : "✓ Confirm & Send to Billing"}
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                style={{
                  padding: "12px 20px", borderRadius: T.radiusSm,
                  border: `1px solid ${T.border}`, background: T.white,
                  color: T.inkMid, fontSize: 14, cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
