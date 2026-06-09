import { useState, useEffect } from "react";
import { getWaitingQueue } from "./supabase.js";

const T = {
  ink: "#0D1117", inkSub: "#6E7891", inkMid: "#3D4558",
  paper: "#F7F5F1", paperDim: "#EFECE7", white: "#FFFFFF",
  sage: "#1A6650", sageMid: "#237A5F", sageLight: "#E6F3EE", sageBorder: "rgba(26,102,80,0.2)",
  blue: "#1854A8", blueLight: "#E8F0FB",
  amber: "#C97A10", amberLight: "#FEF5E7",
  rose: "#B83232", roseLight: "#FDECEA",
  purple: "#5E3FAE", purpleLight: "#F0EBFF",
  border: "#E8E4DE",
  shadow: "0 1px 3px rgba(13,17,23,0.06), 0 4px 16px rgba(13,17,23,0.04)",
  radius: 12, radiusSm: 8,
};

const ROLE_GREETINGS = {
  doctor:       { title: "Ready to see patients?", icon: "🩺", color: T.sage },
  nurse:        { title: "Triage queue is live.",   icon: "💉", color: T.blue },
  receptionist: { title: "Front desk is open.",     icon: "🖥️", color: T.purple },
  cashier:      { title: "Billing desk is ready.",  icon: "💰", color: T.amber },
  pharmacist:   { title: "Dispensing queue awaits.", icon: "💊", color: T.purple },
  admin:        { title: "Clinic overview.",         icon: "📊", color: T.ink },
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function fmtTime(d) {
  return new Date(d).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABELS = {
  waiting_triage:   { label: "Waiting for Triage",  color: T.amber,  bg: T.amberLight  },
  in_triage:        { label: "In Triage",            color: T.blue,   bg: T.blueLight   },
  waiting_doctor:   { label: "Waiting for Doctor",   color: T.purple, bg: T.purpleLight },
  with_doctor:      { label: "With Doctor",          color: T.sage,   bg: T.sageLight   },
  waiting_pharmacy: { label: "Waiting for Pharmacy", color: T.blue,   bg: T.blueLight   },
  waiting_billing:  { label: "Waiting for Billing",  color: T.amber,  bg: T.amberLight  },
  completed:        { label: "Completed",            color: T.sage,   bg: T.sageLight   },
};

export default function AleraHome({ role, staffName, orgId, onGoToQueue, onRegister, onAnalytics, onAppointments }) {
  const [queue, setQueue]   = useState([]);
  const [loading, setLoading] = useState(true);

  const rg = ROLE_GREETINGS[role] || ROLE_GREETINGS.admin;
  const today = new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }
    getWaitingQueue(orgId).then(({ data }) => {
      setQueue(data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [orgId]);

  // Stats from queue
  const stats = {
    waitingTriage:   queue.filter(e => e.status === "waiting_triage").length,
    inTriage:        queue.filter(e => e.status === "in_triage").length,
    waitingDoctor:   queue.filter(e => e.status === "waiting_doctor").length,
    withDoctor:      queue.filter(e => e.status === "with_doctor").length,
    waitingPharmacy: queue.filter(e => e.status === "waiting_pharmacy").length,
    waitingBilling:  queue.filter(e => e.status === "waiting_billing").length,
    total:           queue.filter(e => e.status !== "completed").length,
    completed:       queue.filter(e => e.status === "completed").length,
  };

  // Role-specific alert
  const roleAlert = () => {
    if (role === "nurse"  && stats.waitingTriage > 0)   return { msg: `${stats.waitingTriage} patient${stats.waitingTriage > 1 ? "s" : ""} waiting for triage`, color: T.amber };
    if (role === "doctor" && stats.waitingDoctor > 0)   return { msg: `${stats.waitingDoctor} patient${stats.waitingDoctor > 1 ? "s" : ""} ready for you`, color: T.sage };
    if (role === "pharmacist" && stats.waitingPharmacy > 0) return { msg: `${stats.waitingPharmacy} prescription${stats.waitingPharmacy > 1 ? "s" : ""} to dispense`, color: T.blue };
    if (role === "cashier" && stats.waitingBilling > 0) return { msg: `${stats.waitingBilling} patient${stats.waitingBilling > 1 ? "s" : ""} waiting for billing`, color: T.amber };
    if (stats.total === 0) return { msg: "No patients in queue right now", color: T.inkSub };
    return null;
  };

  const alert = roleAlert();

  // Recent activity — last 6 encounters
  const recent = [...queue]
    .sort((a, b) => new Date(b.registered_at) - new Date(a.registered_at))
    .slice(0, 6);

  const canRegister = ["admin", "receptionist"].includes(role);
  const canSeeAnalytics = ["admin", "doctor", "nurse", "receptionist", "cashier", "pharmacist"].includes(role);

  return (
    <div style={{ minHeight: "100vh", background: T.paper, fontFamily: "'DM Sans',sans-serif", color: T.ink }}>

      {/* ── Hero Header ── */}
      <div style={{
        background: "linear-gradient(135deg, #0D1117 0%, #1A2636 100%)",
        padding: "36px 28px 32px",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {/* Greeting */}
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 6, fontFamily: "'JetBrains Mono',monospace" }}>
            {today}
          </div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 28, color: "#fff", marginBottom: 4 }}>
            {greeting()}{staffName ? `, ${staffName.split(" ")[0]}` : ""} {rg.icon}
          </div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>
            {rg.title}
          </div>

          {/* Alert banner */}
          {alert && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "8px 16px", borderRadius: 20,
              background: `${alert.color}22`, border: `1px solid ${alert.color}44`,
              color: alert.color === T.inkSub ? "rgba(255,255,255,0.4)" : alert.color,
              fontSize: 13, fontWeight: 600, marginBottom: 24,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
              {alert.msg}
            </div>
          )}

          {/* Quick stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
            {[
              { label: "Active Patients", value: stats.total, color: "#fff" },
              { label: "For Triage",      value: stats.waitingTriage + stats.inTriage, color: "#FCD34D" },
              { label: "For Doctor",      value: stats.waitingDoctor + stats.withDoctor, color: "#4ADE80" },
              { label: "For Pharmacy",    value: stats.waitingPharmacy, color: "#818CF8" },
              { label: "For Billing",     value: stats.waitingBilling, color: "#FB923C" },
              { label: "Completed Today", value: stats.completed, color: "#34D399" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.05)", borderRadius: T.radiusSm,
                padding: "12px 14px", border: "1px solid rgba(255,255,255,0.08)",
              }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color, marginBottom: 2 }}>
                  {loading ? "—" : value}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 28px" }}>

        {/* ── Quick Actions ── */}
        <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
          <button
            onClick={onGoToQueue}
            style={{
              padding: "12px 24px", borderRadius: T.radius, border: "none",
              background: T.sage, color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer",
              fontFamily: "'Syne',sans-serif", display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 4px 12px rgba(26,102,80,0.3)", transition: "all 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = T.sageMid}
            onMouseLeave={e => e.currentTarget.style.background = T.sage}
          >
            👥 Go to Queue {stats.total > 0 && `(${stats.total})`}
          </button>

          {canRegister && (
            <button
              onClick={onRegister}
              style={{
                padding: "12px 24px", borderRadius: T.radius,
                border: `1px solid ${T.border}`, background: T.white,
                color: T.ink, fontSize: 14, fontWeight: 600, cursor: "pointer",
                fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 8,
                transition: "all 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.paperDim}
              onMouseLeave={e => e.currentTarget.style.background = T.white}
            >
              ➕ Register New Patient
            </button>
          )}

          <button
              onClick={onAppointments}
              style={{
                padding: "12px 24px", borderRadius: T.radius,
                border: `1px solid ${T.border}`, background: T.white,
                color: T.ink, fontSize: 14, fontWeight: 600, cursor: "pointer",
                fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 8,
                transition: "all 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.paperDim}
              onMouseLeave={e => e.currentTarget.style.background = T.white}
            >
              📅 Appointments
            </button>

          {canSeeAnalytics && (
            <button
              onClick={onAnalytics}
              style={{
                padding: "12px 24px", borderRadius: T.radius,
                border: `1px solid ${T.border}`, background: T.white,
                color: T.ink, fontSize: 14, fontWeight: 600, cursor: "pointer",
                fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 8,
                transition: "all 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.paperDim}
              onMouseLeave={e => e.currentTarget.style.background = T.white}
            >
              📊 View Analytics
            </button>
          )}
        </div>

        {/* ── Queue Status Overview ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13,
            color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12,
          }}>
            Today's Queue Status
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {Object.entries({
              waiting_triage:   stats.waitingTriage,
              in_triage:        stats.inTriage,
              waiting_doctor:   stats.waitingDoctor,
              with_doctor:      stats.withDoctor,
              waiting_pharmacy: stats.waitingPharmacy,
              waiting_billing:  stats.waitingBilling,
            }).map(([status, count]) => {
              const s = STATUS_LABELS[status];
              return (
                <div key={status} style={{
                  background: count > 0 ? s.bg : T.white,
                  border: `1px solid ${count > 0 ? s.color + "33" : T.border}`,
                  borderRadius: T.radiusSm, padding: "12px 14px",
                  opacity: count === 0 ? 0.5 : 1,
                }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: count > 0 ? s.color : T.inkSub, marginBottom: 2 }}>
                    {loading ? "—" : count}
                  </div>
                  <div style={{ fontSize: 11, color: T.inkSub }}>{s.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Recent Activity ── */}
        <div>
          <div style={{
            fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13,
            color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12,
          }}>
            Recent Activity
          </div>

          {loading ? (
            <div style={{ color: T.inkSub, fontSize: 13 }}>Loading…</div>
          ) : recent.length === 0 ? (
            <div style={{
              background: T.white, borderRadius: T.radius, padding: "24px",
              border: `1px solid ${T.border}`, textAlign: "center",
              color: T.inkSub, fontSize: 13,
            }}>
              No patients registered today yet
            </div>
          ) : (
            <div style={{ background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, overflow: "hidden" }}>
              {recent.map((enc, i) => {
                const pat = enc.patient || {};
                const name = [pat.first_name, pat.last_name].filter(Boolean).join(" ") || "Unknown Patient";
                const s = STATUS_LABELS[enc.status] || STATUS_LABELS.waiting_triage;
                return (
                  <div key={enc.id} style={{
                    padding: "12px 18px",
                    borderBottom: i < recent.length - 1 ? `1px solid ${T.border}` : "none",
                    display: "flex", alignItems: "center", gap: 14,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                      background: T.paperDim, display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 12, color: T.inkSub,
                    }}>
                      {name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: T.ink, marginBottom: 2 }}>{name}</div>
                      <div style={{ fontSize: 11, color: T.inkSub }}>
                        {pat.patient_number || "—"} · Registered {fmtTime(enc.registered_at)}
                      </div>
                    </div>
                    <div style={{
                      padding: "3px 10px", borderRadius: 20,
                      background: s.bg, color: s.color,
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
                      fontFamily: "'Syne',sans-serif",
                    }}>
                      {s.label}
                    </div>
                  </div>
                );
              })}
              <div
                onClick={onGoToQueue}
                style={{
                  padding: "10px 18px", textAlign: "center", fontSize: 12,
                  color: T.sage, fontWeight: 600, cursor: "pointer",
                  borderTop: `1px solid ${T.border}`, background: T.paperDim,
                }}
              >
                View full queue →
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
