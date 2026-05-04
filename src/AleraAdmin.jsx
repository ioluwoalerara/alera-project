// =============================================================================
// AleraAdmin.jsx — Admin Dashboard: Staff Management + Org Stats
// =============================================================================
// Two sections:
//   1. Org stats — today's visit count, revenue, queue depth, top diagnoses
//   2. Staff management — list staff, create accounts, deactivate, reset passwords
//
// All writes go through Supabase (service role operations are done via
// Edge Functions — the frontend only does what the anon key permits).
// =============================================================================

import { useState, useEffect } from "react";
import { useAuth } from "./AleraAuth.jsx";
import { supabase } from "./supabase.js";

const T = {
  ink:       "#0D1117", inkSub: "#6E7891", inkMid: "#3D4558",
  paper:     "#F7F5F1", paperDim: "#EFECE7", white: "#FFFFFF",
  sage:      "#1A6650", sageMid: "#237A5F", sageLight: "#E6F3EE", sageBorder: "rgba(26,102,80,0.2)",
  amber:     "#C97A10", amberLight: "#FEF5E7",
  rose:      "#B83232", roseLight: "#FDECEA", roseBorder: "rgba(184,50,50,0.3)",
  blue:      "#1854A8", blueLight: "#E8F0FB",
  border:    "#E8E4DE", borderMid: "#D4D0CA",
  shadow:    "0 1px 3px rgba(13,17,23,0.06), 0 4px 16px rgba(13,17,23,0.04)",
  radius: 12, radiusSm: 8, radiusLg: 16,
};

const ROLE_COLORS = {
  doctor:      { c: T.sage,   bg: T.sageLight  },
  nurse:       { c: T.blue,   bg: T.blueLight  },
  pharmacist:  { c: "#5E3FAE",bg: "#F0EBFF"    },
  receptionist:{ c: T.amber,  bg: T.amberLight },
  cashier:     { c: "#6B7080",bg: T.paperDim   },
  admin:       { c: T.rose,   bg: T.roseLight  },
  super_admin: { c: T.rose,   bg: T.roseLight  },
};

const ALL_ROLES = ["doctor","nurse","pharmacist","receptionist","cashier","admin"];

const fmt = v => "₦" + Math.round(v ?? 0).toLocaleString("en-NG");

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, color = T.sage, bg = T.sageLight }) {
  return (
    <div style={{ padding: "18px 20px", background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 28, color, lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: 12, color: T.inkSub, marginTop: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</div>
          {sub && <div style={{ fontSize: 12, color: T.inkSub, marginTop: 3 }}>{sub}</div>}
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{icon}</div>
      </div>
    </div>
  );
}

// ─── Staff row ────────────────────────────────────────────────────────────────
function StaffRow({ member, onToggleActive }) {
  const [hov, setHov] = useState(false);
  const roleStyle = ROLE_COLORS[member.role] ?? { c: T.inkSub, bg: T.paperDim };

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 110px 140px 120px 100px",
        alignItems: "center", gap: 12,
        padding: "13px 18px",
        background: hov ? "#FAFAF8" : T.white,
        borderBottom: `1px solid ${T.border}`,
        transition: "background 0.12s",
        opacity: member.is_active ? 1 : 0.5,
      }}
    >
      {/* Name + email */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: "50%",
          background: member.is_active ? T.sageLight : T.paperDim,
          border: `1.5px solid ${member.is_active ? T.sageBorder : T.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 12,
          color: member.is_active ? T.sage : T.inkSub, flexShrink: 0,
        }}>
          {`${member.first_name?.[0] ?? ""}${member.last_name?.[0] ?? ""}`.toUpperCase()}
        </div>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13.5, color: T.ink }}>
            {member.first_name} {member.last_name}
          </div>
          <div style={{ fontSize: 11, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace" }}>
            {member.email ?? "No email set"}
          </div>
        </div>
      </div>

      {/* Role badge */}
      <span style={{
        fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
        background: roleStyle.bg, color: roleStyle.c,
        fontFamily: "'JetBrains Mono',monospace", display: "inline-block",
      }}>
        {member.role}
      </span>

      {/* Speciality */}
      <div style={{ fontSize: 12, color: T.inkMid }}>{member.speciality ?? "—"}</div>

      {/* MDCN / PCN */}
      <div style={{ fontSize: 11, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace" }}>
        {member.mdcn_number ?? member.pcn_number ?? "—"}
      </div>

      {/* Active toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => onToggleActive(member)} style={{
          padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
          background: member.is_active ? T.roseLight : T.sageLight,
          color: member.is_active ? T.rose : T.sage,
          border: `1px solid ${member.is_active ? T.roseBorder : T.sageBorder}`,
          cursor: "pointer", transition: "all 0.14s",
          fontFamily: "'DM Sans',sans-serif",
        }}>
          {member.is_active ? "Deactivate" : "Reactivate"}
        </button>
      </div>
    </div>
  );
}

// ─── AddStaffModal ────────────────────────────────────────────────────────────
function AddStaffModal({ orgId, onClose, onAdded }) {
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", role: "doctor", speciality: "", mdcn_number: "", pcn_number: "" });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);
  const [done,   setDone]   = useState(false);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit() {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      setError("First name, last name, and email are required.");
      return;
    }
    setSaving(true);
    setError(null);

    // Insert staff record — auth user must be linked manually by admin
    // (Or via Supabase dashboard: Auth → Users → Add User, then link UUID)
    const { error: insertErr } = await supabase
      .from("staff")
      .insert({
        org_id:       orgId,
        first_name:   form.first_name.trim(),
        last_name:    form.last_name.trim(),
        email:        form.email.trim().toLowerCase(),
        role:         form.role,
        speciality:   form.speciality.trim() || null,
        mdcn_number:  form.mdcn_number.trim() || null,
        pcn_number:   form.pcn_number.trim()  || null,
        is_active:    true,
      });

    setSaving(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    setDone(true);
    onAdded?.();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(13,17,23,0.5)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: T.white, borderRadius: T.radiusLg, width: "100%", maxWidth: 480,
        padding: "28px 28px", boxShadow: "0 20px 60px rgba(13,17,23,0.25)",
        animation: "fadeUp 0.2s ease",
      }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: T.ink, marginBottom: 4 }}>
          Add Staff Member
        </div>
        <div style={{ fontSize: 13, color: T.inkSub, marginBottom: 22 }}>
          Creates a staff record. After saving, go to Supabase Dashboard → Auth → Users to create their login credentials and link the account.
        </div>

        {done ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: T.ink, marginBottom: 6 }}>Staff record created</div>
            <div style={{ fontSize: 13, color: T.inkSub, marginBottom: 20 }}>
              Go to Supabase Dashboard → Authentication → Users → Invite User ({form.email}) to send them a login link.
            </div>
            <button onClick={onClose} style={{ padding: "10px 24px", background: T.sage, color: "#fff", border: "none", borderRadius: T.radiusSm, cursor: "pointer", fontFamily: "'Syne',sans-serif", fontWeight: 700 }}>Done</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="First Name *" value={form.first_name} onChange={v => setF("first_name", v)} placeholder="Chidi" />
              <Field label="Last Name *"  value={form.last_name}  onChange={v => setF("last_name", v)}  placeholder="Okonkwo" />
            </div>
            <Field label="Work Email *" value={form.email} onChange={v => setF("email", v)} placeholder="chidi@clinic.ng" type="email" />
            <div>
              <label style={LABEL}>Role *</label>
              <select value={form.role} onChange={e => setF("role", e.target.value)} style={INPUT}>
                {ALL_ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>
            <Field label="Speciality" value={form.speciality} onChange={v => setF("speciality", v)} placeholder="General Practice" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="MDCN Number" value={form.mdcn_number} onChange={v => setF("mdcn_number", v)} placeholder="MD/2023/12345" />
              <Field label="PCN / NMCN" value={form.pcn_number} onChange={v => setF("pcn_number", v)} placeholder="PCN-12345" />
            </div>

            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: T.roseLight, border: `1px solid ${T.roseBorder}`, color: T.rose, fontSize: 13 }}>
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button onClick={onClose} style={{ flex: 1, padding: "11px 0", borderRadius: T.radiusSm, background: T.white, border: `1.5px solid ${T.border}`, color: T.inkMid, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>Cancel</button>
              <button onClick={handleSubmit} disabled={saving} style={{ flex: 2, padding: "11px 0", borderRadius: T.radiusSm, background: saving ? T.sageMid : T.sage, border: "none", color: "#fff", cursor: saving ? "default" : "pointer", fontFamily: "'Syne',sans-serif", fontWeight: 700 }}>
                {saving ? "Saving…" : "Create Staff Record"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <label style={LABEL}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={INPUT}
        onFocus={e => e.target.style.borderColor = T.sage}
        onBlur={e  => e.target.style.borderColor = T.border}
      />
    </div>
  );
}

const LABEL = { display: "block", fontSize: 11, fontWeight: 700, color: T.inkSub, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.4px" };
const INPUT = { width: "100%", padding: "10px 12px", background: T.white, border: `1.5px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13.5, fontFamily: "'DM Sans',sans-serif", color: T.ink, outline: "none", transition: "border-color 0.14s", boxSizing: "border-box" };

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AleraAdmin() {
  const { orgId, orgName } = useAuth();

  const [tab,         setTab]         = useState("staff");
  const [staff,       setStaff]       = useState([]);
  const [staffLoading,setStaffLoading]= useState(true);
  const [stats,       setStats]       = useState(null);
  const [showAdd,     setShowAdd]     = useState(false);
  const [roleFilter,  setRoleFilter]  = useState("all");

  // ── Load staff ─────────────────────────────────────────────────────────────
  async function loadStaff() {
    if (!orgId) return;
    const { data } = await supabase
      .from("staff")
      .select("id, first_name, last_name, email, role, speciality, mdcn_number, pcn_number, nmcn_number, is_active, created_at")
      .eq("org_id", orgId)
      .order("role")
      .order("last_name");
    setStaff(data ?? []);
    setStaffLoading(false);
  }

  // ── Load today's stats ─────────────────────────────────────────────────────
  async function loadStats() {
    if (!orgId) return;
    const today = new Date(); today.setHours(0,0,0,0);

    const [{ count: totalVisits }, { data: billData }, { data: encData }] = await Promise.all([
      supabase.from("encounters").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("registered_at", today.toISOString()),
      supabase.from("bills").select("amount_paid_ngn, status").eq("org_id", orgId).gte("created_at", today.toISOString()),
      supabase.from("encounters").select("status, urgency").eq("org_id", orgId).gte("registered_at", today.toISOString()),
    ]);

    const revenue = (billData ?? []).filter(b => b.status === "paid").reduce((s, b) => s + (b.amount_paid_ngn ?? 0), 0);
    const pending  = (billData ?? []).filter(b => b.status === "open").length;
    const critical = (encData ?? []).filter(e => ["immediate","emergent"].includes(e.urgency)).length;
    const active   = (encData ?? []).filter(e => !["completed","discharged","did_not_wait"].includes(e.status)).length;

    setStats({ totalVisits: totalVisits ?? 0, revenue, pending, critical, active });
  }

  useEffect(() => { loadStaff(); loadStats(); }, [orgId]);

  async function handleToggleActive(member) {
    await supabase.from("staff").update({ is_active: !member.is_active }).eq("id", member.id);
    loadStaff();
  }

  const filteredStaff = roleFilter === "all" ? staff : staff.filter(s => s.role === roleFilter);

  const roleCounts = ALL_ROLES.reduce((acc, r) => {
    acc[r] = staff.filter(s => s.role === r && s.is_active).length;
    return acc;
  }, {});

  return (
    <div style={{ minHeight: "100vh", background: T.paper, fontFamily: "'DM Sans',sans-serif", padding: "28px 32px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28, animation: "fadeUp 0.3s ease" }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 24, color: T.ink, marginBottom: 4 }}>Admin Dashboard</div>
        <div style={{ fontSize: 13, color: T.inkSub }}>{orgName ?? "Your Organisation"}</div>
      </div>

      {/* Today's stats */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 28, animation: "fadeUp 0.3s ease 0.05s both" }}>
          <StatCard label="Visits Today"  value={stats.totalVisits} icon="🏥" color={T.ink}   bg={T.paperDim}  />
          <StatCard label="Revenue"       value={fmt(stats.revenue)} icon="💰" color={T.sage}  bg={T.sageLight} />
          <StatCard label="Active Now"    value={stats.active}      icon="🩺" color={T.blue}  bg={T.blueLight} />
          <StatCard label="Bills Pending" value={stats.pending}     icon="⏳" color={T.amber} bg={T.amberLight} />
          <StatCard label="Critical"      value={stats.critical}    icon="⚠️" color={T.rose}  bg={T.roseLight} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, animation: "fadeUp 0.3s ease 0.1s both" }}>
        {[
          { key: "staff", label: "👥 Staff", count: staff.filter(s => s.is_active).length },
          { key: "org",   label: "🏥 Organisation" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "8px 18px", borderRadius: T.radiusSm, fontSize: 13, fontWeight: 600,
            background: tab === t.key ? T.sage : T.white,
            color:      tab === t.key ? "#fff"  : T.inkMid,
            border: `1.5px solid ${tab === t.key ? T.sage : T.border}`,
            cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {t.label}
            {t.count != null && (
              <span style={{ padding: "1px 6px", borderRadius: 9, fontSize: 11, background: tab === t.key ? "rgba(255,255,255,0.25)" : T.paperDim, color: tab === t.key ? "#fff" : T.inkSub }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Staff tab */}
      {tab === "staff" && (
        <div style={{ animation: "fadeUp 0.3s ease 0.12s both" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            {/* Role filter */}
            <div style={{ display: "flex", gap: 6 }}>
              {["all", ...ALL_ROLES].map(r => (
                <button key={r} onClick={() => setRoleFilter(r)} style={{
                  padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: roleFilter === r ? T.sage : T.white,
                  color:      roleFilter === r ? "#fff"  : T.inkMid,
                  border: `1px solid ${roleFilter === r ? T.sage : T.border}`,
                  cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                }}>
                  {r === "all" ? `All (${staff.length})` : `${r} (${roleCounts[r] ?? 0})`}
                </button>
              ))}
            </div>

            <button onClick={() => setShowAdd(true)} style={{
              padding: "9px 18px", borderRadius: T.radiusSm, background: T.sage, border: "none",
              color: "#fff", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>
              + Add Staff
            </button>
          </div>

          <div style={{ background: T.white, borderRadius: T.radiusLg, border: `1px solid ${T.border}`, boxShadow: T.shadow, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 140px 120px 100px", gap: 12, padding: "10px 18px", background: T.paper, borderBottom: `1px solid ${T.border}` }}>
              {["Staff Member", "Role", "Speciality", "Licence No.", ""].map((h, i) => (
                <div key={i} style={{ fontSize: 11, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</div>
              ))}
            </div>

            {staffLoading ? (
              <div style={{ padding: "40px 0", textAlign: "center", color: T.inkSub, fontSize: 13 }}>Loading staff…</div>
            ) : filteredStaff.length === 0 ? (
              <div style={{ padding: "48px 0", textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>👤</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, color: T.ink, marginBottom: 6 }}>No staff in this category</div>
                <div style={{ fontSize: 13, color: T.inkSub }}>Add staff using the button above.</div>
              </div>
            ) : (
              filteredStaff.map(member => (
                <StaffRow key={member.id} member={member} onToggleActive={handleToggleActive} />
              ))
            )}
          </div>

          <div style={{ marginTop: 14, fontSize: 12, color: T.inkSub, padding: "0 4px" }}>
            💡 To give staff login access: Supabase Dashboard → Authentication → Users → Invite User with their work email. Once they sign in, their account auto-links via the JWT hook.
          </div>
        </div>
      )}

      {/* Org tab */}
      {tab === "org" && (
        <div style={{ background: T.white, borderRadius: T.radiusLg, border: `1px solid ${T.border}`, boxShadow: T.shadow, padding: "24px 28px", animation: "fadeUp 0.3s ease 0.12s both" }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 17, color: T.ink, marginBottom: 18 }}>Organisation Settings</div>
          <div style={{ color: T.inkSub, fontSize: 13, lineHeight: 1.7 }}>
            <p>Organisation name, NHIS provider code, NAFDAC number, branch management, and plan settings are managed in the <strong>Supabase database</strong> directly via the <code style={{ background: T.paperDim, padding: "1px 6px", borderRadius: 4 }}>organisations</code> table.</p>
            <br />
            <p>Planned for next release: in-app org settings editor, branch management, logo upload, and Paystack business account linking.</p>
          </div>
        </div>
      )}

      {showAdd && <AddStaffModal orgId={orgId} onClose={() => setShowAdd(false)} onAdded={loadStaff} />}
    </div>
  );
}
