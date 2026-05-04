import { useState, useRef } from "react";
import AleraPatientLookup from "./AleraPatientLookup.jsx";
import { useRole } from "./AleraShell.jsx";

// ─── Design Tokens ────────────────────────────────────────────────────────────
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

// ─── Mock Data ────────────────────────────────────────────────────────────────
const PATIENT = {
  id: "ALE-00847", name: "Adaeze Okafor", age: 33, sex: "Female",
  insurance: "NHIS", insuranceId: "NHIS-00234-21",
  phone: "+234 803 441 7892", email: "adaeze.okafor@gmail.com",
  diagnosis: "Malaria (P. falciparum) [B50.9]",
  visitId: "VIS-20250225-0847", provider: "Dr. Chidi Okonkwo",
};

const AUTO_CHARGES = [
  { id: 1, category: "consultation",  description: "General Outpatient Consultation",       code: "CON-001",     unitPrice: 3000, qty: 1, nhisCovered: true,  nhisRate: 0.8 },
  { id: 2, category: "medication",    description: "Artemether/Lumefantrine 80/480mg × 3d", code: "MED-ART-001", unitPrice: 2000, qty: 1, nhisCovered: true,  nhisRate: 0.7 },
  { id: 3, category: "medication",    description: "Paracetamol 500mg strip",               code: "MED-PAR-001", unitPrice: 200,  qty: 1, nhisCovered: false, nhisRate: 0   },
  { id: 4, category: "medication",    description: "Oral Rehydration Salts × 3 sachets",    code: "MED-ORS-001", unitPrice: 300,  qty: 1, nhisCovered: false, nhisRate: 0   },
  { id: 5, category: "investigation", description: "Malaria RDT",                           code: "INV-RDT-001", unitPrice: 1000, qty: 1, nhisCovered: true,  nhisRate: 0.9 },
];

const EXTRA_SERVICES = [
  { id: 6, category: "investigation", description: "Full Blood Count (FBC)",  code: "INV-FBC-001", unitPrice: 2500, qty: 1, nhisCovered: true,  nhisRate: 0.75 },
  { id: 7, category: "investigation", description: "Widal Test",              code: "INV-WID-001", unitPrice: 1500, qty: 1, nhisCovered: false, nhisRate: 0    },
  { id: 8, category: "procedure",     description: "IV Cannulation & Fluids", code: "PRO-IVC-001", unitPrice: 3500, qty: 1, nhisCovered: true,  nhisRate: 0.6  },
  { id: 9, category: "consultation",  description: "Specialist Referral Fee", code: "CON-REF-001", unitPrice: 5000, qty: 1, nhisCovered: true,  nhisRate: 0.5  },
];

const CATEGORY_META = {
  consultation:  { label: "Consult",       color: T.blue,   bg: T.blueLight   },
  medication:    { label: "Medication",    color: T.sage,   bg: T.sageLight   },
  investigation: { label: "Investigation", color: T.amber,  bg: T.amberLight  },
  procedure:     { label: "Procedure",     color: T.purple, bg: T.purpleLight },
};

const PAYMENT_METHODS = [
  { id: "cash",      label: "Cash",       icon: "💵", desc: "Collect & mark paid" },
  { id: "transfer",  label: "Transfer",   icon: "📲", desc: "Verify & confirm"    },
  { id: "pos",       label: "POS / Card", icon: "💳", desc: "Swipe or tap"        },
  { id: "insurance", label: "Insurance",  icon: "🏥", desc: "Submit NHIS claim"   },
  { id: "split",     label: "Split",      icon: "✂️", desc: "Cash + insurance"    },
];

const TODAY_TRANSACTIONS = [
  { id: "VIS-0841", time: "08:14", patient: "Ibrahim Musa",       method: "cash",      amount: 5500,  status: "paid"    },
  { id: "VIS-0842", time: "08:47", patient: "Ngozi Adeleke",      method: "pos",       amount: 8200,  status: "paid"    },
  { id: "VIS-0843", time: "09:02", patient: "Yusuf Abubakar",     method: "transfer",  amount: 12000, status: "paid"    },
  { id: "VIS-0844", time: "09:31", patient: "Chidinma Eze",       method: "insurance", amount: 0,     status: "paid",   nhisClaim: 4800 },
  { id: "VIS-0845", time: "10:05", patient: "Emeka Nwosu",        method: "cash",      amount: 3200,  status: "paid"    },
  { id: "VIS-0846", time: "10:38", patient: "Fatima Bello",       method: "split",     amount: 2900,  status: "paid",   nhisClaim: 1800 },
  { id: "VIS-0847", time: "11:14", patient: "Adaeze Okafor",      method: "cash",      amount: 8500,  status: "pending" },
  { id: "VIS-0848", time: "11:52", patient: "Chukwuemeka Obiora", method: "pos",       amount: 6700,  status: "paid"    },
];

const OPENING_FLOAT = 10000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = v => "₦" + Math.round(v).toLocaleString("en-NG");

function calcTotals(items, payMethod, discountPct) {
  const active    = items.filter(i => i.active);
  const subtotal  = active.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const isIns     = payMethod === "insurance" || payMethod === "split";
  const nhisCover = isIns ? Math.round(active.filter(i => i.nhisCovered).reduce((s, i) => s + i.unitPrice * i.qty * i.nhisRate, 0)) : 0;
  const discountAmt = Math.round((subtotal - nhisCover) * discountPct / 100);
  return { subtotal, nhisCover, discountAmt, patientOwes: Math.max(0, subtotal - nhisCover - discountAmt) };
}

function calcDrawerSummary(txns) {
  const paid = txns.filter(t => t.status === "paid");
  const cash = paid.filter(t => t.method === "cash" || t.method === "split").reduce((s, t) => s + t.amount, 0);
  const pos  = paid.filter(t => t.method === "pos").reduce((s, t) => s + t.amount, 0);
  const tr   = paid.filter(t => t.method === "transfer").reduce((s, t) => s + t.amount, 0);
  const ins  = paid.filter(t => t.method === "insurance").reduce((s, t) => s + (t.nhisClaim || 0), 0);
  return { cash, pos, transfer: tr, insurance: ins, totalCollected: cash + pos + tr, expectedCash: cash + OPENING_FLOAT, count: paid.length };
}

function generateReceiptText(patient, items, totals, payMethod, ts) {
  const active = items.filter(i => i.active);
  const method = PAYMENT_METHODS.find(p => p.id === payMethod)?.label || payMethod;
  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      ALERA HEALTH CLINIC
      Official Receipt
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Receipt No : RCP-${Date.now().toString().slice(-8)}
Date       : ${ts}  |  Visit: ${patient.visitId}
Patient    : ${patient.name} (${patient.id})
Diagnosis  : ${patient.diagnosis}
Provider   : ${patient.provider}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SERVICES:
${active.map((i, x) => `${x + 1}. ${i.description}\n   ${i.code}  ×${i.qty}  ${fmt(i.unitPrice * i.qty)}`).join("\n")}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Subtotal   : ${fmt(totals.subtotal)}
${totals.nhisCover > 0 ? `NHIS Cover : -${fmt(totals.nhisCover)}\n` : ""}${totals.discountAmt > 0 ? `Discount   : -${fmt(totals.discountAmt)}\n` : ""}TOTAL PAID : ${fmt(totals.patientOwes)}
Method     : ${method}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Thank you. Get well soon.
Powered by Alera Health EMR`;
}

function generateCloseReport(summary, counted, staff, ts) {
  const diff   = counted - summary.expectedCash;
  const status = diff === 0 ? "BALANCED" : diff > 0 ? `OVERAGE +₦${Math.abs(diff).toLocaleString()}` : `SHORTAGE -₦${Math.abs(diff).toLocaleString()}`;
  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ALERA HEALTH CLINIC
    End-of-Day Cash Drawer Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date      : ${ts}
Closed by : ${staff}
Report ID : CDR-${Date.now().toString().slice(-8)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COLLECTIONS:
  Cash         : ₦${summary.cash.toLocaleString()}
  POS / Card   : ₦${summary.pos.toLocaleString()}
  Transfer     : ₦${summary.transfer.toLocaleString()}
  NHIS Claims  : ₦${summary.insurance.toLocaleString()}
  Total        : ₦${summary.totalCollected.toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CASH RECONCILIATION:
  Opening float : ₦${OPENING_FLOAT.toLocaleString()}
  Cash received : ₦${summary.cash.toLocaleString()}
  Expected      : ₦${summary.expectedCash.toLocaleString()}
  Counted       : ₦${counted.toLocaleString()}
  STATUS        : ${status}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${summary.count} visits  ·  Signed: ${staff}`;
}

// ─── Atoms ────────────────────────────────────────────────────────────────────
function Tag({ color, bg, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 5, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.3px", fontFamily: "'JetBrains Mono',monospace", color, background: bg, flexShrink: 0 }}>
      {children}
    </span>
  );
}

function Btn({ children, variant = "primary", onClick, disabled, full, size = "md", danger }) {
  const pad  = size === "sm" ? "7px 14px" : size === "lg" ? "13px 28px" : "9px 18px";
  const fz   = size === "sm" ? 12 : size === "lg" ? 14 : 13;
  const base = { border: "none", borderRadius: T.radiusSm, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, transition: "all 0.14s", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, width: full ? "100%" : undefined, opacity: disabled ? 0.4 : 1, padding: pad, fontSize: fz };
  const map  = {
    primary: { background: danger ? T.rose : T.ink, color: "#fff" },
    sage:    { background: T.sage, color: "#fff" },
    ghost:   { background: "transparent", color: T.inkSub, border: `1px solid ${T.border}` },
    soft:    { background: T.paperDim, color: T.inkMid, border: `1px solid ${T.border}` },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...base, ...(map[variant] || map.primary) }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.filter = "brightness(1.08)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
      onMouseLeave={e => { e.currentTarget.style.filter = ""; e.currentTarget.style.transform = ""; }}
    >{children}</button>
  );
}

// ─── Line Item ────────────────────────────────────────────────────────────────
function LineItem({ item, onToggle, onQtyChange, onRemove }) {
  const meta    = CATEGORY_META[item.category] || CATEGORY_META.consultation;
  const total   = item.unitPrice * item.qty;
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: hov && item.active ? "#FAFAF8" : T.white, borderBottom: `1px solid ${T.border}`, opacity: item.active ? 1 : 0.38, transition: "all 0.14s" }}>
      <div onClick={() => onToggle(item.id)} style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `2px solid ${item.active ? meta.color : T.borderMid}`, background: item.active ? meta.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.14s" }}>
        {item.active && <span style={{ fontSize: 10, color: "#fff", lineHeight: 1, fontWeight: 700 }}>✓</span>}
      </div>
      <Tag color={meta.color} bg={meta.bg}>{meta.label}</Tag>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.description}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2 }}>
          <span style={{ fontSize: 11, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace" }}>{item.code}</span>
          {item.nhisCovered && <Tag color={T.blue} bg={T.blueLight}>NHIS</Tag>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
        {[{ label: "−", val: Math.max(1, item.qty - 1) }, { label: item.qty, val: null }, { label: "＋", val: item.qty + 1 }].map((b, i) =>
          b.val === null
            ? <span key={i} style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", width: 18, textAlign: "center", color: T.ink }}>{b.label}</span>
            : <button key={i} onClick={() => onQtyChange(item.id, b.val)} style={{ width: 22, height: 22, borderRadius: 5, border: `1px solid ${T.border}`, background: "none", cursor: "pointer", fontSize: 13, color: T.inkSub, display: "flex", alignItems: "center", justifyContent: "center" }}
                onMouseEnter={e => { e.currentTarget.style.background = T.paperDim; }} onMouseLeave={e => { e.currentTarget.style.background = "none"; }}>{b.label}</button>
        )}
      </div>
      <span style={{ fontSize: 11.5, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", width: 64, textAlign: "right", flexShrink: 0 }}>{fmt(item.unitPrice)}</span>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: item.active ? T.ink : T.inkSub, fontFamily: "'JetBrains Mono',monospace", width: 76, textAlign: "right", flexShrink: 0 }}>{fmt(total)}</span>
      <button onClick={() => onRemove(item.id)} style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "none", cursor: "pointer", color: T.inkSub, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", opacity: hov ? 1 : 0, transition: "all 0.14s", flexShrink: 0 }}
        onMouseEnter={e => { e.currentTarget.style.color = T.rose; }} onMouseLeave={e => { e.currentTarget.style.color = T.inkSub; }}>✕</button>
    </div>
  );
}

// ─── Payment Method Picker ────────────────────────────────────────────────────
function PaymentPicker({ value, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
      {PAYMENT_METHODS.map(m => {
        const sel = value === m.id;
        return (
          <div key={m.id} onClick={() => onChange(m.id)} style={{ padding: "12px 8px", borderRadius: T.radiusSm, cursor: "pointer", textAlign: "center", border: `1.5px solid ${sel ? T.sage : T.border}`, background: sel ? T.sageLight : T.white, transition: "all 0.14s" }}
            onMouseEnter={e => { if (!sel) { e.currentTarget.style.borderColor = T.sageMid; e.currentTarget.style.background = "#F4F9F7"; } }}
            onMouseLeave={e => { if (!sel) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.white; } }}
          >
            <div style={{ fontSize: 22, marginBottom: 5 }}>{m.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: sel ? T.sage : T.ink, marginBottom: 2 }}>{m.label}</div>
            <div style={{ fontSize: 10.5, color: T.inkSub, lineHeight: 1.3 }}>{m.desc}</div>
            {sel && <div style={{ marginTop: 7, width: 5, height: 5, borderRadius: "50%", background: T.sage, margin: "7px auto 0" }} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Cash Drawer ──────────────────────────────────────────────────────────────
const METHOD_META = {
  cash:      { label: "Cash",     color: T.sage,   bg: T.sageLight   },
  pos:       { label: "POS",      color: T.blue,   bg: T.blueLight   },
  transfer:  { label: "Transfer", color: T.purple, bg: T.purpleLight },
  insurance: { label: "NHIS",     color: T.amber,  bg: T.amberLight  },
  split:     { label: "Split",    color: T.sage,   bg: T.sageLight   },
};

function DrawerStepBar({ step }) {
  const steps   = [{ key: "review", label: "Review" }, { key: "count", label: "Count Cash" }, { key: "confirm", label: "Sign Off" }];
  const order   = steps.map(s => s.key);
  const current = order.indexOf(step);
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 28 }}>
      {steps.map((s, i) => {
        const mine = order.indexOf(s.key), done = mine < current, active = mine === current;
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: done ? T.sage : active ? T.ink : T.paperDim, color: done || active ? "#fff" : T.inkSub, display: "flex", alignItems: "center", justifyContent: "center", fontSize: done ? 12 : 11.5, fontWeight: 700, fontFamily: "'Syne',sans-serif", boxShadow: active ? `0 0 0 4px ${T.paperDim}` : "none", transition: "all 0.3s" }}>
                {done ? "✓" : mine + 1}
              </div>
              <span style={{ fontSize: 10.5, whiteSpace: "nowrap", fontFamily: "'JetBrains Mono',monospace", color: active ? T.ink : done ? T.sage : T.inkSub, fontWeight: active ? 600 : 400 }}>{s.label}</span>
            </div>
            {i < steps.length - 1 && <div style={{ flex: 1, height: 1.5, margin: "0 10px", marginBottom: 20, background: done ? T.sage : T.border, transition: "background 0.3s" }} />}
          </div>
        );
      })}
    </div>
  );
}

function CashDrawerTab({ canReopen = false }) {
  const [transactions]  = useState(TODAY_TRANSACTIONS);
  const [countedCash, setCountedCash] = useState("");
  const [staffName, setStaffName]     = useState("Tunde Adeleke (Cashier)");
  const [step, setStep]               = useState("review");
  const [closing, setClosing]         = useState(false);
  const [smsSent, setSmsSent]         = useState(false);
  const ts = useRef(new Date().toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })).current;

  const summary  = calcDrawerSummary(transactions);
  const counted  = parseInt(countedCash.replace(/[^0-9]/g, "")) || 0;
  const diff     = counted - summary.expectedCash;
  const balanced = diff === 0, overage = diff > 0, shortage = diff < 0;
  const diffAbs  = Math.abs(diff);
  const varColor = balanced ? T.sage : overage ? T.amber : T.rose;
  const varBg    = balanced ? T.sageLight : overage ? T.amberLight : T.roseLight;
  const varLabel = balanced ? "Balanced" : overage ? `+${fmt(diffAbs)} overage` : `−${fmt(diffAbs)} shortage`;
  const reportText = generateCloseReport(summary, counted, staffName, ts);

  if (step === "closed") return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <div style={{ background: T.ink, borderRadius: T.radiusLg, padding: "36px 32px", textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>🔒</div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: "#fff", marginBottom: 6 }}>Drawer Closed</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginBottom: 20 }}>{staffName} · {ts}</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 20px", borderRadius: T.radiusSm, background: balanced ? "rgba(26,102,80,0.2)" : overage ? "rgba(201,122,16,0.2)" : "rgba(184,50,50,0.2)", border: `1px solid ${balanced ? "rgba(26,102,80,0.4)" : overage ? "rgba(201,122,16,0.4)" : "rgba(184,50,50,0.4)"}` }}>
          <span style={{ fontSize: 16 }}>{balanced ? "✅" : overage ? "📈" : "⚠"}</span>
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: balanced ? "#5BCCA0" : overage ? "#F0B84A" : "#F07070" }}>
            {balanced ? "Perfectly balanced" : overage ? `Overage · +${fmt(diffAbs)}` : `Shortage · −${fmt(diffAbs)}`}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22 }}>
          <Btn variant="ghost" onClick={() => { setSmsSent(true); setTimeout(() => setSmsSent(false), 3000); }} style={{ color: smsSent ? T.sage : undefined }}>{smsSent ? "✓ Sent" : "📨 SMS Report"}</Btn>
          <Btn variant="ghost">🖨 Print</Btn>
          {canReopen && <Btn variant="ghost" danger onClick={() => { setStep("review"); setCountedCash(""); }}>🔓 Re-open</Btn>}
        </div>
      </div>
      <div style={{ background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, padding: "20px", boxShadow: T.shadow }}>
        <div style={{ fontSize: 10.5, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", marginBottom: 12, letterSpacing: "0.5px" }}>END-OF-DAY REPORT</div>
        <pre style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: T.inkMid, lineHeight: 1.85, whiteSpace: "pre-wrap", background: T.paper, padding: "16px", borderRadius: T.radiusSm, border: `1px solid ${T.border}` }}>{reportText}</pre>
      </div>
    </div>
  );

  return (
    <div style={{ animation: "fadeUp 0.25s ease" }}>
      <DrawerStepBar step={step} />

      {/* Step 1 — Review */}
      {step === "review" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 18 }}>
            {[{ label: "Cash", value: summary.cash, ...METHOD_META.cash }, { label: "POS", value: summary.pos, ...METHOD_META.pos }, { label: "Transfer", value: summary.transfer, ...METHOD_META.transfer }, { label: "NHIS", value: summary.insurance, ...METHOD_META.insurance }].map(c => (
              <div key={c.label} style={{ background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, padding: "16px", boxShadow: T.shadow }}>
                <Tag color={c.color} bg={c.bg}>{c.label}</Tag>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: c.color, marginTop: 10 }}>{fmt(c.value)}</div>
              </div>
            ))}
          </div>
          <div style={{ background: T.ink, borderRadius: T.radius, padding: "18px 22px", marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)", fontFamily: "'JetBrains Mono',monospace", marginBottom: 4 }}>TOTAL COLLECTED</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 26, color: "#fff", letterSpacing: -0.5 }}>{fmt(summary.totalCollected)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)", fontFamily: "'JetBrains Mono',monospace", marginBottom: 4 }}>VISITS TODAY</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 26, color: "#5BCCA0" }}>{summary.count}</div>
            </div>
          </div>
          <div style={{ background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: 20, boxShadow: T.shadow }}>
            <div style={{ display: "flex", gap: 12, padding: "9px 16px", background: T.paper, borderBottom: `1px solid ${T.border}` }}>
              {["PATIENT", "TIME", "METHOD", "AMOUNT", "STATUS"].map((h, i) => (
                <div key={h} style={{ fontSize: 10, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", flex: i === 0 ? 1 : "none", width: [, 48, 74, 86, 48][i], textAlign: i > 2 ? "right" : "left" }}>{h}</div>
              ))}
            </div>
            {transactions.map(tx => {
              const m = METHOD_META[tx.method] || METHOD_META.cash;
              return (
                <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: `1px solid ${T.border}`, background: tx.status === "pending" ? T.amberLight : T.white, transition: "background 0.1s" }}
                  onMouseEnter={e => { if (tx.status !== "pending") e.currentTarget.style.background = T.paper; }}
                  onMouseLeave={e => { e.currentTarget.style.background = tx.status === "pending" ? T.amberLight : T.white; }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.patient}</div>
                    <div style={{ fontSize: 10.5, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", marginTop: 1 }}>{tx.id}</div>
                  </div>
                  <div style={{ fontSize: 11.5, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", width: 48 }}>{tx.time}</div>
                  <div style={{ width: 74 }}><Tag color={m.color} bg={m.bg}>{m.label}</Tag></div>
                  <div style={{ width: 86, textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: tx.status === "pending" ? T.amber : T.ink }}>{tx.amount > 0 ? fmt(tx.amount) : "—"}</div>
                    {tx.nhisClaim ? <div style={{ fontSize: 10, color: T.blue, marginTop: 1 }}>{fmt(tx.nhisClaim)} NHIS</div> : null}
                  </div>
                  <div style={{ width: 48, textAlign: "right" }}><Tag color={tx.status === "paid" ? T.sage : T.amber} bg={tx.status === "paid" ? T.sageLight : T.amberLight}>{tx.status === "paid" ? "PAID" : "PEND"}</Tag></div>
                </div>
              );
            })}
          </div>
          <Btn variant="primary" onClick={() => setStep("count")}>Continue → Count Cash</Btn>
        </div>
      )}

      {/* Step 2 — Count */}
      {step === "count" && (
        <div style={{ animation: "fadeUp 0.2s ease" }}>
          <div style={{ background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, padding: "28px", boxShadow: T.shadow, marginBottom: 14 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 17, color: T.ink, marginBottom: 4 }}>Physical Cash Count</div>
            <div style={{ fontSize: 13, color: T.inkSub, marginBottom: 24 }}>Count all notes and coins in the drawer, then enter the total below.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
              <div style={{ padding: "16px", background: T.paper, borderRadius: T.radiusSm, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10.5, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", marginBottom: 6 }}>OPENING FLOAT</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: T.inkMid }}>{fmt(OPENING_FLOAT)}</div>
              </div>
              <div style={{ padding: "16px", background: T.sageLight, borderRadius: T.radiusSm, border: `1px solid ${T.sageBorder}` }}>
                <div style={{ fontSize: 10.5, color: T.sage, fontFamily: "'JetBrains Mono',monospace", marginBottom: 6 }}>CASH RECEIVED</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: T.sage }}>{fmt(summary.cash)}</div>
              </div>
            </div>
            <div style={{ padding: "13px 18px", background: T.ink, borderRadius: T.radiusSm, marginBottom: 22, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.65)" }}>Expected in drawer</span>
              <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: "#fff" }}>{fmt(summary.expectedCash)}</span>
            </div>
            <div style={{ marginBottom: counted > 0 ? 14 : 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.inkMid, marginBottom: 8 }}>Enter counted amount</div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: counted > 0 ? varColor : T.inkSub, transition: "color 0.2s" }}>₦</span>
                <input type="text" value={countedCash} onChange={e => setCountedCash(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0"
                  style={{ width: "100%", padding: "15px 16px 15px 40px", border: `2px solid ${counted > 0 ? varColor : T.border}`, borderRadius: T.radiusSm, fontSize: 26, fontFamily: "'Syne',sans-serif", fontWeight: 800, color: T.ink, outline: "none", boxSizing: "border-box", background: counted > 0 ? varBg : T.white, transition: "all 0.2s" }} />
              </div>
            </div>
            {counted > 0 && (
              <div style={{ padding: "12px 16px", borderRadius: T.radiusSm, background: varBg, border: `1px solid ${varColor}33`, display: "flex", alignItems: "center", gap: 12, animation: "fadeUp 0.2s ease" }}>
                <span style={{ fontSize: 20 }}>{balanced ? "✅" : overage ? "📈" : "⚠"}</span>
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: varColor }}>{varLabel}</div>
                  <div style={{ fontSize: 12, color: T.inkSub, marginTop: 2 }}>{balanced ? "Counted cash matches expected exactly." : overage ? "More cash than expected — double-check your count." : "Less than expected — recount before closing."}</div>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost" onClick={() => setStep("review")}>← Back</Btn>
            <Btn variant="primary" onClick={() => setStep("confirm")} disabled={counted === 0} full>Continue → Sign Off</Btn>
          </div>
        </div>
      )}

      {/* Step 3 — Confirm */}
      {step === "confirm" && (
        <div style={{ animation: "fadeUp 0.2s ease" }}>
          <div style={{ background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, padding: "28px", boxShadow: T.shadow, marginBottom: 14 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 17, color: T.ink, marginBottom: 20 }}>Sign Off & Close</div>
            <div style={{ background: T.paper, borderRadius: T.radiusSm, padding: "18px", marginBottom: 16, border: `1px solid ${T.border}` }}>
              {[{ label: "Cash", value: summary.cash, color: T.sage }, { label: "POS / Card", value: summary.pos, color: T.blue }, { label: "Bank Transfer", value: summary.transfer, color: T.purple }, { label: "NHIS Claims", value: summary.insurance, color: T.amber }].map((row, i, arr) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <span style={{ fontSize: 13, color: T.inkSub }}>{row.label}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 600, color: row.color }}>{fmt(row.value)}</span>
                </div>
              ))}
              <div style={{ height: 1, background: T.borderMid, margin: "10px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15 }}>Total Collected</span>
                <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 15 }}>{fmt(summary.totalCollected)}</span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: varBg, borderRadius: T.radiusSm, border: `1px solid ${varColor}33`, marginBottom: 20 }}>
              <span style={{ fontSize: 13, color: T.inkSub }}>Cash variance</span>
              <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 15, color: varColor }}>{varLabel}</span>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.inkMid, marginBottom: 8 }}>Closed by</div>
              <input value={staffName} onChange={e => setStaffName(e.target.value)}
                style={{ width: "100%", padding: "11px 14px", border: `1.5px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: T.ink, outline: "none", boxSizing: "border-box", transition: "border-color 0.15s, box-shadow 0.15s" }}
                onFocus={e => { e.target.style.borderColor = T.sage; e.target.style.boxShadow = `0 0 0 3px ${T.sageLight}`; }}
                onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = "none"; }} />
            </div>
            <div style={{ fontSize: 12, color: T.inkSub, marginBottom: 24 }}>{ts} · {summary.count} transactions processed</div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="ghost" onClick={() => setStep("count")}>← Back</Btn>
              <Btn variant="primary" danger onClick={() => { setClosing(true); setTimeout(() => { setClosing(false); setStep("closed"); }, 1400); }} disabled={closing || !staffName.trim()} full>
                {closing ? <><span style={{ display: "inline-block", width: 15, height: 15, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Closing…</> : "🔒 Close Drawer for Today"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AleraBillingDashboard({ patient, onComplete }) {
  const hasPatient = !!(patient?._db_id);
  if (!hasPatient) return <AleraPatientLookup screenName="Billing" screenIcon="💰" onSelect={p => onComplete?.({ _lookup: true, patient: p })} />;
  const { role, can, canRead } = useRole?.() || { role: "cashier", can: () => true, canRead: () => true };
  const canProcess  = can("canProcessPayment");
  const canEdit     = can("canEditBilling");
  const canDrawer   = can("canAccessDrawer");
  const canReopen   = can("canReopenDrawer");
  const viewOnly    = canRead("canViewBilling") && !canEdit;
  const isDoctor    = role === "doctor";
  const isCashier   = role === "cashier" || role === "receptionist";
  const [items, setItems]             = useState(AUTO_CHARGES.map(c => ({ ...c, active: true })));
  const [payMethod, setPayMethod]     = useState("cash");
  const [discountPct, setDiscountPct] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [showAdd, setShowAdd]         = useState(false);
  const [paid, setPaid]               = useState(false);
  const [paying, setPaying]           = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [smsSent, setSmsSent]         = useState(false);
  const [emailSent, setEmailSent]     = useState(false);
  const [tab, setTab]                 = useState("invoice");
  const ts = useRef(new Date().toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })).current;

  const totals = calcTotals(items, payMethod, discountPct);
  const isIns  = payMethod === "insurance" || payMethod === "split";
  const receipt = generateReceiptText(patient, items, totals, payMethod, ts);

  const toggleItem = id => setItems(its => its.map(i => i.id === id ? { ...i, active: !i.active } : i));
  const changeQty  = (id, qty) => setItems(its => its.map(i => i.id === id ? { ...i, qty } : i));
  const removeItem = id => setItems(its => its.filter(i => i.id !== id));
  const addService = svc => { setItems(its => [...its, { ...svc, active: true }]); setShowAdd(false); };

  const TABS = [{ key: "invoice", label: "Invoice" }, { key: "insurance", label: "Insurance" }, { key: "history", label: "History" }, ...(canDrawer ? [{ key: "drawer", label: "Cash Drawer" }] : [])];

  return (
    <div style={{ minHeight: "100vh", background: T.paper, fontFamily: "'DM Sans',sans-serif", color: T.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: #E6F3EE; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #D4D0CA; border-radius: 4px; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes spin   { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes paidIn { 0%{transform:scale(0.88);opacity:0} 70%{transform:scale(1.03)} 100%{transform:scale(1);opacity:1} }
      `}</style>

      {/* Header */}
      <header style={{ background: T.white, height: 54, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: T.ink, letterSpacing: -0.5 }}>al<span style={{ color: T.sage }}>era</span></div>
          <div style={{ width: 1, height: 16, background: T.border }} />
          <nav style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: T.inkSub }}>
            <span>Billing</span><span style={{ color: T.borderMid, margin: "0 3px" }}>›</span>
            <span>{patient.name}</span><span style={{ color: T.borderMid, margin: "0 3px" }}>›</span>
            <span style={{ color: T.inkMid, fontFamily: "'JetBrains Mono',monospace" }}>{patient.visitId}</span>
          </nav>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {isDoctor && (
            <div style={{ padding: "5px 12px", background: "#E8F0FB", border: "1px solid rgba(24,84,168,0.2)", borderRadius: 6, fontSize: 12, fontWeight: 700, color: "#1854A8", fontFamily: "'Syne',sans-serif" }}>
              🩺 Doctor — Add Charges
            </div>
          )}
          {isCashier && !paid && (
            <div style={{ padding: "5px 12px", background: T.amberLight, border: "1px solid rgba(201,122,16,0.2)", borderRadius: 6, fontSize: 12, fontWeight: 700, color: T.amber, fontFamily: "'Syne',sans-serif" }}>
              💰 Cashier — Collect Payment
            </div>
          )}
          {paid && <Tag color={T.sage} bg={T.sageLight}>✓ PAID · {fmt(totals.patientOwes)}</Tag>}
          <span style={{ fontSize: 11.5, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace" }}>{items.filter(i => i.active).length} items · {fmt(totals.subtotal)}</span>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 316px", minHeight: "calc(100vh - 54px)" }}>

        {/* Left */}
        <div style={{ padding: "28px 24px 48px 28px", overflowY: "auto" }}>

          {/* Patient card */}
          <div style={{ background: T.white, borderRadius: T.radiusLg, border: `1px solid ${T.border}`, boxShadow: T.shadow, marginBottom: 24, overflow: "hidden" }}>
            <div style={{ background: T.ink, padding: "15px 22px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: T.sage, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                {patient.name.split(" ").map(x => x[0]).join("").slice(0, 2)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: "#fff" }}>{patient.name}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  {[patient.id, patient.visitId, patient.diagnosis].map((x, i) => (
                    <span key={i} style={{ fontSize: 10.5, color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.07)", padding: "1px 7px", borderRadius: 4, fontFamily: "'JetBrains Mono',monospace" }}>{x}</span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono',monospace", marginBottom: 3 }}>INSURANCE</div>
                <div style={{ fontSize: 12.5, color: "#7BBFF5", fontWeight: 600 }}>{patient.insurance} · {patient.insuranceId}</div>
              </div>
            </div>
            <div style={{ padding: "9px 22px", display: "flex", gap: 18, fontSize: 12, color: T.inkSub }}>
              <span>👤 {patient.provider}</span><span>📅 {ts}</span><span>📱 {patient.phone}</span>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: `1px solid ${T.border}` }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: "9px 18px 10px", border: "none", background: "transparent", fontSize: 13.5, fontWeight: tab === t.key ? 600 : 400, color: tab === t.key ? T.ink : T.inkSub, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", borderBottom: `2px solid ${tab === t.key ? T.ink : "transparent"}`, marginBottom: -1, transition: "all 0.14s" }}
                onMouseEnter={e => { if (tab !== t.key) e.currentTarget.style.color = T.inkMid; }}
                onMouseLeave={e => { if (tab !== t.key) e.currentTarget.style.color = T.inkSub; }}
              >{t.label}</button>
            ))}
          </div>

          {/* Invoice */}
          {tab === "invoice" && (
            <div style={{ animation: "fadeUp 0.2s ease" }}>
              {/* AI banner */}
              {(() => {
                const active = items.filter(i => i.active);
                const msgs = [];
                if (!active.some(i => i.category === "consultation")) msgs.push({ type: "warn", text: "No consultation fee — is this intentional?" });
                if (active.length < 2) msgs.push({ type: "warn", text: "Only 1 charge on file. Verify nothing is missing." });
                if (payMethod === "insurance" && !active.some(i => i.nhisCovered)) msgs.push({ type: "info", text: "No NHIS-eligible items. Consider switching to cash." });
                if (msgs.length === 0) return (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: T.sageLight, borderRadius: T.radiusSm, marginBottom: 16, fontSize: 13, color: T.sage }}>
                    <span>✦</span><span style={{ fontWeight: 500 }}>AI: All charges look complete.</span>
                  </div>
                );
                return (
                  <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 7 }}>
                    {msgs.map((m, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, padding: "10px 16px", background: m.type === "warn" ? T.amberLight : T.blueLight, borderRadius: T.radiusSm, fontSize: 13, color: m.type === "warn" ? T.amber : T.blue, alignItems: "center" }}>
                        <span>{m.type === "warn" ? "⚠" : "ℹ"}</span><span style={{ fontWeight: 500 }}>AI: {m.text}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Line items */}
              <div style={{ background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, overflow: "hidden", boxShadow: T.shadow, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 16px", background: T.paper, borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ width: 18 }} /><div style={{ width: 80 }} />
                  <div style={{ flex: 1, fontSize: 10, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace" }}>DESCRIPTION</div>
                  <div style={{ fontSize: 10, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", width: 80, textAlign: "center" }}>QTY</div>
                  <div style={{ fontSize: 10, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", width: 64, textAlign: "right" }}>UNIT</div>
                  <div style={{ fontSize: 10, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", width: 76, textAlign: "right" }}>TOTAL</div>
                  <div style={{ width: 24 }} />
                </div>
                <div style={{ padding: "6px 16px", background: T.sageLight, borderBottom: `1px solid ${T.sageBorder}` }}>
                  <span style={{ fontSize: 10.5, color: T.sage, fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>✦ Auto-generated from encounter</span>
                </div>
                {items.map(item => <LineItem key={item.id} item={item} onToggle={toggleItem} onQtyChange={changeQty} onRemove={removeItem} />)}
                <div style={{ padding: "11px 16px", borderTop: `1px dashed ${T.border}` }}>
                  <button onClick={() => setShowAdd(s => !s)} style={{ padding: "7px 14px", border: `1.5px dashed ${T.borderMid}`, borderRadius: T.radiusSm, background: "transparent", color: T.inkSub, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.14s", display: "inline-flex", alignItems: "center", gap: 6 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = T.sage; e.currentTarget.style.color = T.sage; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderMid; e.currentTarget.style.color = T.inkSub; }}>＋ Add service</button>
                </div>
                {showAdd && (
                  <div style={{ padding: "0 16px 14px", animation: "fadeUp 0.2s ease" }}>
                    {EXTRA_SERVICES.filter(s => !items.find(i => i.id === s.id)).map(svc => {
                      const meta = CATEGORY_META[svc.category];
                      return (
                        <div key={svc.id} onClick={() => addService(svc)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: `1px solid ${T.border}`, borderRadius: T.radiusSm, marginBottom: 6, cursor: "pointer", background: T.white, transition: "all 0.12s" }}
                          onMouseEnter={e => { e.currentTarget.style.background = T.sageLight; e.currentTarget.style.borderColor = T.sageMid; }}
                          onMouseLeave={e => { e.currentTarget.style.background = T.white; e.currentTarget.style.borderColor = T.border; }}>
                          <Tag color={meta.color} bg={meta.bg}>{meta.label}</Tag>
                          <div style={{ flex: 1, fontSize: 13 }}>{svc.description}</div>
                          <span style={{ fontSize: 12.5, fontFamily: "'JetBrains Mono',monospace", color: T.sage, fontWeight: 600 }}>{fmt(svc.unitPrice)}</span>
                          {svc.nhisCovered && <Tag color={T.blue} bg={T.blueLight}>NHIS</Tag>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Discount */}
              <div style={{ background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, padding: "13px 16px", marginBottom: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", boxShadow: T.shadow }}>
                <span style={{ fontSize: 13, color: T.inkMid, fontWeight: 500, flexShrink: 0 }}>Discount</span>
                <div style={{ display: "flex", gap: 5 }}>
                  {[0, 5, 10, 15, 20].map(p => (
                    <button key={p} onClick={() => setDiscountPct(p)} style={{ padding: "5px 10px", borderRadius: T.radiusSm, border: `1.5px solid ${discountPct === p ? T.sage : T.border}`, background: discountPct === p ? T.sageLight : "transparent", color: discountPct === p ? T.sage : T.inkSub, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", transition: "all 0.12s" }}>{p}%</button>
                  ))}
                </div>
                <input value={discountReason} onChange={e => setDiscountReason(e.target.value)} placeholder="Reason (hardship, staff…)"
                  style={{ flex: 1, minWidth: 150, padding: "7px 11px", border: `1.5px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 12.5, fontFamily: "'DM Sans',sans-serif", outline: "none", color: T.ink, background: T.white, transition: "border-color 0.14s" }}
                  onFocus={e => { e.target.style.borderColor = T.sage; }} onBlur={e => { e.target.style.borderColor = T.border; }} />
              </div>

              {/* Payment method */}
              <div style={{ background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, padding: "16px", marginBottom: 16, boxShadow: T.shadow }}>
                <div style={{ fontSize: 11, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.5px", marginBottom: 13 }}>PAYMENT METHOD</div>
                <PaymentPicker value={payMethod} onChange={setPayMethod} />
                {payMethod === "split" && totals.nhisCover > 0 && (
                  <div style={{ marginTop: 14, padding: "14px 16px", background: T.blueLight, borderRadius: T.radiusSm, border: `1px solid rgba(26,84,168,0.12)`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, animation: "fadeUp 0.2s ease" }}>
                    {[{ label: "NHIS COVERS", value: totals.nhisCover, color: T.blue }, { label: "PATIENT PAYS", value: totals.patientOwes, color: T.sage }].map(r => (
                      <div key={r.label}>
                        <div style={{ fontSize: 10.5, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace", marginBottom: 5 }}>{r.label}</div>
                        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: r.color }}>{fmt(r.value)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {payMethod === "transfer" && (
                  <div style={{ marginTop: 14, padding: "11px 14px", background: T.paper, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, fontSize: 13, color: T.inkMid, animation: "fadeUp 0.2s ease" }}>
                    📲 GTBank · <strong>Alera Health Clinic</strong> · <strong>0123456789</strong> · Ref: {patient.visitId}
                  </div>
                )}
              </div>

              {/* Pay action */}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {paid ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 22px", background: T.sageLight, border: `1.5px solid ${T.sageBorder}`, borderRadius: T.radius, animation: "paidIn 0.4s ease" }}>
                    <span style={{ fontSize: 22 }}>✅</span>
                    <div>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: T.sage }}>{fmt(totals.patientOwes)} Received</div>
                      <div style={{ fontSize: 12, color: T.inkSub, marginTop: 1 }}>Proceed to Visit Exit →</div>
                    </div>
                  </div>
                ) : (
                  <>
                    {isDoctor ? (
                      <Btn variant="sage" size="lg"
                        onClick={() => { setPaying(true); setTimeout(() => { setPaying(false); onComplete?.({ chargesConfirmed: true, items, totals }); }, 800); }}
                        disabled={paying || items.filter(i => i.active).length === 0}
                      >
                        {paying
                          ? <><span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Saving charges…</>
                          : <>✓ Confirm Charges &amp; Return to Queue</>}
                      </Btn>
                    ) : canProcess ? (
                      <Btn variant="sage" size="lg"
                        onClick={() => { setPaying(true); setTimeout(() => { setPaying(false); setPaid(true); setShowReceipt(true); onComplete?.({ amountPaid: totals.patientOwes, paymentMethod: PAYMENT_METHODS.find(p => p.id === payMethod)?.label || payMethod }); }, 1400); }}
                        disabled={paying || items.filter(i => i.active).length === 0}
                      >
                        {paying ? <><span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Processing…</> : <>✓ Mark Paid · {fmt(totals.patientOwes)}</>}
                      </Btn>
                    ) : viewOnly ? (
                      <div style={{ padding: "10px 16px", background: "#FEF5E7", border: "1px solid rgba(201,122,16,0.3)", borderRadius: 9, fontSize: 13, color: "#C97A10" }}>
                        👁 View only — ask the cashier to process payment
                      </div>
                    ) : null}
                    <Btn variant="ghost" onClick={() => setShowReceipt(r => !r)}>🖨 Preview Receipt</Btn>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Insurance */}
          {tab === "insurance" && (
            <div style={{ animation: "fadeUp 0.2s ease" }}>
              <div style={{ background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, padding: "24px", boxShadow: T.shadow }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: T.blueLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏥</div>
                  <div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15 }}>NHIS Claim Summary</div>
                    <div style={{ fontSize: 12, color: T.inkSub, marginTop: 2 }}>Auto-coded · Ready to submit</div>
                  </div>
                  <div style={{ marginLeft: "auto" }}><Tag color={T.blue} bg={T.blueLight}>{patient.insurance} · {patient.insuranceId}</Tag></div>
                </div>
                {items.filter(i => i.active && i.nhisCovered).map(item => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ flex: 1, fontSize: 13 }}>{item.description}</div>
                    <span style={{ fontSize: 12, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace" }}>{fmt(item.unitPrice * item.qty)}</span>
                    <span style={{ fontSize: 12, color: T.blue, fontFamily: "'JetBrains Mono',monospace" }}>× {item.nhisRate * 100}% = {fmt(item.unitPrice * item.qty * item.nhisRate)}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: T.borderMid, margin: "14px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                  <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15 }}>Total NHIS Claim</span>
                  <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 15, color: T.blue }}>{fmt(totals.nhisCover)}</span>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <Btn variant="primary" full>📤 Submit NHIS Claim</Btn>
                  <Btn variant="ghost">🖨 Print Form</Btn>
                </div>
              </div>
            </div>
          )}

          {/* History */}
          {tab === "history" && (
            <div style={{ animation: "fadeUp 0.2s ease" }}>
              <div style={{ background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, padding: "24px", boxShadow: T.shadow }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 20 }}>Payment History — {patient.name}</div>
                {[{ date: "14 Jan 2025", amount: 7500, method: "Cash", diag: "Malaria" }, { date: "08 Nov 2024", amount: 4200, method: "NHIS", diag: "Hypertension" }, { date: "22 Sep 2024", amount: 12000, method: "Split", diag: "Antenatal" }].map((h, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 0", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: T.sageLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🧾</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{h.diag}</div>
                      <div style={{ fontSize: 11.5, color: T.inkSub, marginTop: 2 }}>{h.date} · {h.method}</div>
                    </div>
                    <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: T.sage }}>{fmt(h.amount)}</span>
                    <Tag color={T.sage} bg={T.sageLight}>PAID</Tag>
                  </div>
                ))}
                <div style={{ marginTop: 14, padding: "12px 14px", background: T.paper, borderRadius: T.radiusSm, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: T.inkSub }}>Lifetime spend</span>
                  <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17 }}>{fmt(23700)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Drawer */}
          {tab === "drawer" && <CashDrawerTab canReopen={canReopen} />}
        </div>

        {/* Right sidebar */}
        <div style={{ background: T.ink, borderLeft: `1px solid rgba(255,255,255,0.05)`, padding: "24px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Live total */}
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: T.radius, padding: "20px", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono',monospace", marginBottom: 8, letterSpacing: "0.6px" }}>PATIENT OWES</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 32, color: "#fff", letterSpacing: -0.5, lineHeight: 1, marginBottom: 16, transition: "all 0.3s" }}>{fmt(totals.patientOwes)}</div>
            {[
              { label: "Subtotal",     value: totals.subtotal,    color: "rgba(255,255,255,0.65)", show: true },
              { label: "NHIS cover",   value: -totals.nhisCover,  color: "#7BBFF5",               show: isIns && totals.nhisCover > 0 },
              { label: `Discount ${discountPct}%`, value: -totals.discountAmt, color: "#F0B84A", show: discountPct > 0 },
            ].filter(r => r.show).map((row, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>{row.label}</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", color: row.color }}>{row.value < 0 ? "−" : ""}{fmt(Math.abs(row.value))}</span>
              </div>
            ))}
          </div>

          {/* Delivery */}
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.6px", marginBottom: 12 }}>RECEIPT DELIVERY</div>
            {[
              { icon: "📨", label: "SMS Receipt",  sub: patient.phone,  action: () => { setSmsSent(true); setTimeout(() => setSmsSent(false), 3000); }, sent: smsSent   },
              { icon: "📧", label: "Email Receipt", sub: patient.email,  action: () => { setEmailSent(true); setTimeout(() => setEmailSent(false), 3000); }, sent: emailSent },
              { icon: "🖨", label: "Print",         sub: "A5 thermal",   action: () => {},                                                                  sent: false     },
            ].map((d, i) => (
              <button key={i} onClick={d.action} style={{ width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, marginBottom: 7, border: `1px solid ${d.sent ? "rgba(26,102,80,0.4)" : "rgba(255,255,255,0.07)"}`, background: d.sent ? "rgba(26,102,80,0.14)" : "rgba(255,255,255,0.04)", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 10, transition: "all 0.14s", textAlign: "left" }}
                onMouseEnter={e => { if (!d.sent) e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                onMouseLeave={e => { if (!d.sent) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}>
                <span style={{ fontSize: 16 }}>{d.icon}</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: d.sent ? "#5BCCA0" : "rgba(255,255,255,0.75)" }}>{d.sent ? "✓ Sent!" : d.label}</div>
                  <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>{d.sub}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Receipt preview */}
          {showReceipt && (
            <div style={{ animation: "fadeUp 0.22s ease" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.6px", marginBottom: 10 }}>RECEIPT PREVIEW</div>
              <pre style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: T.radiusSm, padding: "13px", fontSize: 9.5, color: "rgba(255,255,255,0.65)", fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.8, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 260, overflowY: "auto" }}>{receipt}</pre>
            </div>
          )}

          {/* Billing stats */}
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.6px", marginBottom: 12 }}>BILLING SUMMARY</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "Items",     value: items.filter(i => i.active).length },
                { label: "Method",    value: PAYMENT_METHODS.find(p => p.id === payMethod)?.label || "—" },
                { label: "Insurance", value: isIns ? fmt(totals.nhisCover) : "—", color: isIns ? "#7BBFF5" : undefined },
                { label: "Discount",  value: discountPct > 0 ? `${discountPct}%` : "None", color: discountPct > 0 ? "#F0B84A" : undefined },
              ].map(item => (
                <div key={item.label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: T.radiusSm, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.55)", fontFamily: "'JetBrains Mono',monospace", marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: item.color || "#fff" }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Category bars */}
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.6px", marginBottom: 12 }}>BY CATEGORY</div>
            {Object.entries(CATEGORY_META).map(([key, meta]) => {
              const cat = items.filter(i => i.active && i.category === key).reduce((s, i) => s + i.unitPrice * i.qty, 0);
              if (!cat) return null;
              const pct = Math.round(cat / totals.subtotal * 100);
              return (
                <div key={key} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{meta.label}</span>
                    <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: "rgba(255,255,255,0.55)" }}>{fmt(cat)}</span>
                  </div>
                  <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: meta.color, borderRadius: 2, transition: "width 0.4s ease", opacity: 0.75 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
