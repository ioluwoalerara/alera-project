import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./AleraAuth.jsx";
import { getOrgStaff, inviteStaffMember, updateStaffMember, deactivateStaff } from "./supabase.js";

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

const ROLES = [
  { value: "doctor",       label: "Doctor",       icon: "🩺", desc: "Clinical notes, prescriptions, sign-off" },
  { value: "nurse",        label: "Nurse",         icon: "💉", desc: "Triage, vitals, patient assessment" },
  { value: "receptionist", label: "Receptionist",  icon: "🖥️", desc: "Registration, queue, appointments" },
  { value: "cashier",      label: "Cashier",       icon: "💰", desc: "Billing, payment collection" },
  { value: "pharmacist",   label: "Pharmacist",    icon: "💊", desc: "Drug dispensing, pharmacy" },
  { value: "admin",        label: "Admin",         icon: "⚙️", desc: "Full access, staff management" },
];

const ROLE_COLORS = {
  doctor:       { color: T.sage,   bg: T.sageLight },
  nurse:        { color: T.blue,   bg: T.blueLight },
  receptionist: { color: T.purple, bg: T.purpleLight },
  cashier:      { color: T.amber,  bg: T.amberLight },
  pharmacist:   { color: T.purple, bg: T.purpleLight },
  admin:        { color: T.ink,    bg: T.paperDim },
};

function fmtDate(d) {
  if (!d) return "Never";
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────
function InviteModal({ orgId, onClose, onSuccess }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", role: "doctor", phone: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  async function handleInvite() {
    if (!form.firstName || !form.lastName || !form.email || !form.role) {
      setError("Please fill in all required fields.");
      return;
    }
    setLoading(true);
    setError(null);

    // Since admin.inviteUserByEmail requires service role key (not available client-side),
    // we use a workaround: create auth user with a temp password and send reset email
    const { supabase } = await import("./supabase.js");

    try {
      // Create auth user via signup with temp password
      const tempPassword = Math.random().toString(36).slice(-12) + "A1!";
      const { data: signupData, error: signupError } = await supabase.auth.signUp({
        email: form.email,
        password: tempPassword,
        options: {
          data: { first_name: form.firstName, last_name: form.lastName },
        },
      });

      if (signupError) { setError(signupError.message); setLoading(false); return; }

      // Create staff record
      const { error: staffError } = await supabase.from("staff").insert({
        org_id:       orgId,
        auth_user_id: signupData.user.id,
        email:        form.email,
        first_name:   form.firstName,
        last_name:    form.lastName,
        role:         form.role,
        phone:        form.phone || null,
        is_active:    true,
      });

      if (staffError) { setError(staffError.message); setLoading(false); return; }

      // Send password reset email so they can set their own password
      await supabase.auth.resetPasswordForEmail(form.email, {
        redirectTo: `${window.location.origin}/?setup=true`,
      });

      setSuccess(true);
      setTimeout(() => { onSuccess(); onClose(); }, 2000);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(13,17,23,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: T.white, borderRadius: T.radiusLg, width: "100%", maxWidth: 500,
        boxShadow: "0 24px 64px rgba(13,17,23,0.2)", fontFamily: "'DM Sans',sans-serif",
      }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: T.ink }}>Invite Staff Member</div>
            <div style={{ fontSize: 12, color: T.inkSub, marginTop: 2 }}>They'll receive an email to set their password</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: T.inkSub }}>✕</button>
        </div>

        {success ? (
          <div style={{ padding: "40px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: T.ink, marginBottom: 4 }}>Invitation Sent</div>
            <div style={{ fontSize: 13, color: T.inkSub }}>{form.email} will receive a setup email shortly</div>
          </div>
        ) : (
          <>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

              {error && (
                <div style={{ padding: "10px 14px", background: T.roseLight, border: `1px solid rgba(184,50,50,0.2)`, borderRadius: T.radiusSm, fontSize: 13, color: T.rose }}>
                  ⚠ {error}
                </div>
              )}

              {/* Name */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>First Name *</div>
                  <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                    placeholder="Chidi" style={{ width: "100%", padding: "10px 14px", border: `1px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Last Name *</div>
                  <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                    placeholder="Okonkwo" style={{ width: "100%", padding: "10px 14px", border: `1px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>

              {/* Email */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Email Address *</div>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="doctor@clinic.ng" style={{ width: "100%", padding: "10px 14px", border: `1px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>

              {/* Phone */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Phone (optional)</div>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+234 803 000 0000" style={{ width: "100%", padding: "10px 14px", border: `1px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>

              {/* Role */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Role *</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {ROLES.map(r => (
                    <button key={r.value} onClick={() => setForm(f => ({ ...f, role: r.value }))} style={{
                      padding: "10px 12px", borderRadius: T.radiusSm, cursor: "pointer", textAlign: "left",
                      border: `1.5px solid ${form.role === r.value ? T.sage : T.border}`,
                      background: form.role === r.value ? T.sageLight : T.white,
                      transition: "all 0.15s",
                    }}>
                      <div style={{ fontSize: 16, marginBottom: 3 }}>{r.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: form.role === r.value ? T.sage : T.ink }}>{r.label}</div>
                      <div style={{ fontSize: 10, color: T.inkSub, marginTop: 1 }}>{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding: "16px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 10 }}>
              <button onClick={handleInvite} disabled={loading} style={{
                flex: 1, padding: "12px", background: T.sage, color: "#fff", border: "none",
                borderRadius: T.radiusSm, fontSize: 14, fontWeight: 700,
                cursor: loading ? "default" : "pointer", fontFamily: "'Syne',sans-serif",
              }}>
                {loading ? "Sending invite…" : "📧 Send Invite"}
              </button>
              <button onClick={onClose} style={{
                padding: "12px 20px", border: `1px solid ${T.border}`, background: T.white,
                color: T.inkSub, borderRadius: T.radiusSm, fontSize: 14, cursor: "pointer",
              }}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Staff Card ───────────────────────────────────────────────────────────────
function StaffCard({ member, onToggleActive, onEditRole }) {
  const [showMenu, setShowMenu] = useState(false);
  const rc = ROLE_COLORS[member.role] || ROLE_COLORS.admin;
  const roleInfo = ROLES.find(r => r.value === member.role);

  return (
    <div style={{
      background: T.white, borderRadius: T.radius, padding: "16px 18px",
      border: `1px solid ${member.is_active ? T.border : T.borderMid}`,
      opacity: member.is_active ? 1 : 0.6, boxShadow: T.shadow,
      display: "flex", alignItems: "center", gap: 14,
    }}>
      {/* Avatar */}
      <div style={{
        width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
        background: member.is_active ? T.sage : T.paperDim,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16,
        color: member.is_active ? "#fff" : T.inkSub,
      }}>
        {[member.first_name?.[0], member.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?"}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: T.ink }}>
            {[member.first_name, member.last_name].filter(Boolean).join(" ") || "—"}
          </span>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700,
            color: rc.color, background: rc.bg, fontFamily: "'Syne',sans-serif",
          }}>{roleInfo?.icon} {roleInfo?.label || member.role}</span>
          {!member.is_active && (
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, color: T.rose, background: T.roseLight, fontWeight: 700 }}>Inactive</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: T.inkSub, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span>{member.email}</span>
          {member.phone && <span>{member.phone}</span>}
          <span>Last login: {fmtDate(member.last_login_at)}</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <button onClick={() => setShowMenu(m => !m)} style={{
          padding: "6px 12px", borderRadius: T.radiusSm, border: `1px solid ${T.border}`,
          background: T.white, color: T.inkSub, fontSize: 13, cursor: "pointer",
        }}>⋯</button>
        {showMenu && (
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 4px)",
            background: T.white, border: `1px solid ${T.border}`,
            borderRadius: T.radiusSm, boxShadow: T.shadow,
            zIndex: 10, minWidth: 160, overflow: "hidden", padding: 4,
          }}>
            {ROLES.filter(r => r.value !== member.role).map(r => (
              <button key={r.value} onClick={() => { onEditRole(member.id, r.value); setShowMenu(false); }} style={{
                width: "100%", padding: "8px 14px", border: "none", background: "transparent",
                cursor: "pointer", textAlign: "left", fontSize: 13, color: T.inkMid,
                display: "flex", alignItems: "center", gap: 8, borderRadius: 6,
              }}
                onMouseEnter={e => e.currentTarget.style.background = T.paperDim}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <span>{r.icon}</span> Change to {r.label}
              </button>
            ))}
            <div style={{ height: 1, background: T.border, margin: "4px 0" }} />
            <button onClick={() => { onToggleActive(member.id, !member.is_active); setShowMenu(false); }} style={{
              width: "100%", padding: "8px 14px", border: "none", background: "transparent",
              cursor: "pointer", textAlign: "left", fontSize: 13,
              color: member.is_active ? T.rose : T.sage, borderRadius: 6,
            }}
              onMouseEnter={e => e.currentTarget.style.background = T.paperDim}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              {member.is_active ? "🚫 Deactivate" : "✅ Reactivate"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AleraAdmin() {
  const { orgId } = useAuth?.() || {};

  const [staff, setStaff]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [search, setSearch]       = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [activeTab, setActiveTab] = useState("staff");

  const loadStaff = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await getOrgStaff(orgId);
    setStaff(data);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  async function handleToggleActive(staffId, active) {
    await updateStaffMember(staffId, { is_active: active });
    loadStaff();
  }

  async function handleEditRole(staffId, newRole) {
    await updateStaffMember(staffId, { role: newRole });
    loadStaff();
  }

  const filtered = staff.filter(s => {
    const name = `${s.first_name || ""} ${s.last_name || ""} ${s.email || ""}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchRole = filterRole === "all" || s.role === filterRole;
    return matchSearch && matchRole;
  });

  const stats = {
    total:    staff.length,
    active:   staff.filter(s => s.is_active).length,
    doctors:  staff.filter(s => s.role === "doctor").length,
    nurses:   staff.filter(s => s.role === "nurse").length,
  };

  return (
    <div style={{ minHeight: "100vh", background: T.paper, fontFamily: "'DM Sans',sans-serif", color: T.ink }}>

      {/* Header */}
      <div style={{
        background: T.white, borderBottom: `1px solid ${T.border}`,
        padding: "16px 28px", position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: T.ink }}>Admin</div>
            <div style={{ fontSize: 12, color: T.inkSub }}>{stats.active} active staff · {stats.doctors} doctors · {stats.nurses} nurses</div>
          </div>
          <button onClick={() => setShowInvite(true)} style={{
            padding: "10px 20px", background: T.sage, color: "#fff", border: "none",
            borderRadius: T.radius, fontSize: 13, fontWeight: 700, cursor: "pointer",
            fontFamily: "'Syne',sans-serif", boxShadow: "0 4px 12px rgba(26,102,80,0.3)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            + Invite Staff
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2 }}>
          {[{ key: "staff", label: "Staff Management" }, { key: "clinic", label: "Clinic Settings" }].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              padding: "6px 14px", borderRadius: T.radiusSm, border: "none",
              background: activeTab === t.key ? T.ink : "transparent",
              color: activeTab === t.key ? "#fff" : T.inkSub,
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px 28px", maxWidth: 900, margin: "0 auto" }}>

        {activeTab === "staff" && (
          <>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Total Staff", value: stats.total, color: T.ink },
                { label: "Active", value: stats.active, color: T.sage },
                { label: "Doctors", value: stats.doctors, color: T.blue },
                { label: "Nurses", value: stats.nurses, color: T.purple },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: T.white, borderRadius: T.radiusSm, padding: "12px 14px", border: `1px solid ${T.border}` }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color, marginBottom: 2 }}>{value}</div>
                  <div style={{ fontSize: 11, color: T.inkSub }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Search and filter */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search staff by name or email..."
                style={{
                  flex: 1, padding: "10px 14px", border: `1px solid ${T.border}`,
                  borderRadius: T.radiusSm, fontSize: 13, outline: "none",
                }}
              />
              <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{
                padding: "10px 14px", border: `1px solid ${T.border}`,
                borderRadius: T.radiusSm, fontSize: 13, background: T.white, outline: "none",
              }}>
                <option value="all">All Roles</option>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.icon} {r.label}</option>)}
              </select>
            </div>

            {/* Staff list */}
            {loading ? (
              <div style={{ textAlign: "center", padding: 40, color: T.inkSub }}>Loading staff…</div>
            ) : filtered.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "48px 20px", background: T.white,
                borderRadius: T.radius, border: `1px solid ${T.border}`,
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: T.ink, marginBottom: 4 }}>
                  {search ? "No staff found" : "No staff yet"}
                </div>
                <div style={{ fontSize: 13, color: T.inkSub, marginBottom: 16 }}>
                  {search ? `No results for "${search}"` : "Invite your first team member to get started"}
                </div>
                {!search && (
                  <button onClick={() => setShowInvite(true)} style={{
                    padding: "10px 20px", background: T.sage, color: "#fff", border: "none",
                    borderRadius: T.radiusSm, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  }}>+ Invite Staff Member</button>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filtered.map(member => (
                  <StaffCard
                    key={member.id}
                    member={member}
                    onToggleActive={handleToggleActive}
                    onEditRole={handleEditRole}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "clinic" && (
          <div style={{ background: T.white, borderRadius: T.radius, padding: "24px", border: `1px solid ${T.border}` }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: T.ink, marginBottom: 4 }}>Clinic Settings</div>
            <div style={{ fontSize: 13, color: T.inkSub }}>Clinic profile, branding, and configuration settings coming soon.</div>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <InviteModal
          orgId={orgId}
          onClose={() => setShowInvite(false)}
          onSuccess={loadStaff}
        />
      )}
    </div>
  );
}
