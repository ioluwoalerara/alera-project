import { useState, useEffect, useMemo } from "react";
import { useRole } from "./AleraShell.jsx";
import { useAuth } from "./AleraAuth.jsx";
import { getAnalytics } from "./supabase.js";

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
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function groupByDay(items, dateField) {
  const map = {};
  items.forEach(item => {
    const day = new Date(item[dateField]).toISOString().slice(0, 10);
    map[day] = (map[day] || 0) + 1;
  });
  return map;
}

function getLast7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

function getLast30Days() {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });
}

function getHour(dateStr) {
  return new Date(dateStr).getHours();
}

// ─── Sub Components ───────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = T.ink, bg = T.white, trend }) {
  return (
    <div style={{
      background: bg, borderRadius: T.radius, padding: "20px 22px",
      border: `1px solid ${T.border}`, boxShadow: T.shadow,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        {trend !== undefined && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
            color: trend >= 0 ? T.sage : T.rose,
            background: trend >= 0 ? T.sageLight : T.roseLight,
          }}>
            {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 28, color, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.inkMid, marginBottom: sub ? 4 : 0 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: T.inkSub }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, icon }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
      paddingBottom: 8, borderBottom: `2px solid ${T.sageBorder}`,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 13, color: T.sage, textTransform: "uppercase", letterSpacing: 0.8 }}>{title}</span>
    </div>
  );
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────
function BarChart({ data, color = T.sage, height = 80, showLabels = true }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: height + (showLabels ? 24 : 0) }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{
            width: "100%", background: color,
            height: Math.max((d.value / max) * height, d.value > 0 ? 3 : 0),
            borderRadius: "3px 3px 0 0", transition: "height 0.3s ease",
            opacity: i === data.length - 1 ? 1 : 0.6,
            position: "relative",
          }}>
            {d.value > 0 && (
              <div style={{
                position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)",
                fontSize: 9, color: T.inkSub, whiteSpace: "nowrap",
                fontFamily: "'JetBrains Mono',monospace",
              }}>{d.value}</div>
            )}
          </div>
          {showLabels && (
            <div style={{ fontSize: 8, color: T.inkSub, textAlign: "center", fontFamily: "'JetBrains Mono',monospace" }}>
              {d.label}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AleraAnalytics() {
  const { role, can, canRead } = useRole?.() || { role: "admin", can: () => true, canRead: () => true };
  const { orgId } = useAuth?.() || {};

  const isAdmin       = role === "admin";
  const isCashier     = role === "cashier";
  const isDoctor      = role === "doctor";
  const isNurse       = role === "nurse";
  const isReceptionist = role === "receptionist";
  const isPharmacist  = role === "pharmacist";

  const canSeeRevenue    = isAdmin || isCashier;
  const canSeeDiagnoses  = isAdmin || isDoctor || isNurse;
  const canSeeBusyHours  = isAdmin || isDoctor || isNurse || isReceptionist;
  const canSeeStaff      = isAdmin;
  const canSeePharmacy   = isAdmin || isPharmacist;

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange]     = useState(7); // days

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    getAnalytics(orgId, 30).then(d => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [orgId]);

  const stats = useMemo(() => {
    if (!data) return null;
    const today = new Date().toISOString().slice(0, 10);
    const days = range === 7 ? getLast7Days() : getLast30Days();
    const since = new Date(days[0]);

    const enc = data.encounters.filter(e => new Date(e.registered_at) >= since);
    const todayEnc = data.encounters.filter(e => e.registered_at?.slice(0, 10) === today);
    const completed = enc.filter(e => e.status === "completed");

    // Revenue
    const bills = data.bills.filter(b => new Date(b.created_at) >= since);
    const todayBills = data.bills.filter(b => b.created_at?.slice(0, 10) === today);
    const totalRevenue = bills.reduce((s, b) => s + (b.bill_payments?.reduce((ps, p) => ps + (p.amount || 0), 0) || 0), 0);
    const todayRevenue = todayBills.reduce((s, b) => s + (b.bill_payments?.reduce((ps, p) => ps + (p.amount || 0), 0) || 0), 0);

    // Daily encounter chart
    const encByDay = groupByDay(enc, "registered_at");
    const encChart = days.map(d => ({ label: fmtDate(d).slice(0, 5), value: encByDay[d] || 0 }));

    // Daily revenue chart
    const revByDay = {};
    bills.forEach(b => {
      const day = b.created_at?.slice(0, 10);
      if (day) revByDay[day] = (revByDay[day] || 0) + (b.bill_payments?.reduce((s, p) => s + (p.amount || 0), 0) || 0);
    });
    const revChart = days.map(d => ({ label: fmtDate(d).slice(0, 5), value: Math.round(revByDay[d] || 0) }));

    // Busiest hours
    const hourCounts = Array(24).fill(0);
    enc.forEach(e => { hourCounts[getHour(e.registered_at)]++; });
    const hourChart = Array.from({ length: 12 }, (_, i) => {
      const h = i + 7; // 7am to 7pm
      return { label: `${h > 12 ? h - 12 : h}${h >= 12 ? "p" : "a"}`, value: hourCounts[h] || 0 };
    });

    // Top diagnoses
    const dxCount = {};
    data.diagnoses.filter(d => new Date(d.created_at) >= since).forEach(d => {
      dxCount[d.name] = (dxCount[d.name] || 0) + 1;
    });
    const topDx = Object.entries(dxCount).sort((a, b) => b[1] - a[1]).slice(0, 8);

    // Staff performance
    const staffMap = {};
    enc.forEach(e => {
      if (e.assigned_doctor_id) {
        const name = e.assigned_doctor ? `Dr. ${e.assigned_doctor.last_name}` : e.assigned_doctor_id;
        staffMap[name] = (staffMap[name] || 0) + 1;
      }
    });
    const staffPerf = Object.entries(staffMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Top drugs
    const drugCount = {};
    data.prescriptions.filter(p => new Date(p.created_at) >= since).forEach(p => {
      drugCount[p.drug_name] = (drugCount[p.drug_name] || 0) + (p.quantity || 1);
    });
    const topDrugs = Object.entries(drugCount).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Completion rate
    const completionRate = enc.length ? Math.round((completed.length / enc.length) * 100) : 0;

    return {
      todayPatients: todayEnc.length,
      totalPatients: enc.length,
      todayRevenue,
      totalRevenue,
      completionRate,
      encChart,
      revChart,
      hourChart,
      topDx,
      staffPerf,
      topDrugs,
      avgPerDay: enc.length ? Math.round(enc.length / days.length) : 0,
    };
  }, [data, range]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: T.paper, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif", color: T.inkSub }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
        Loading analytics…
      </div>
    </div>
  );

  if (!stats) return (
    <div style={{ minHeight: "100vh", background: T.paper, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif", color: T.inkSub }}>
      No data available yet
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: T.paper, fontFamily: "'DM Sans',sans-serif", color: T.ink }}>

      {/* Header */}
      <div style={{
        background: T.white, borderBottom: `1px solid ${T.border}`,
        padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: T.ink }}>
            {isAdmin ? "Clinic Analytics" : "Dashboard"}
          </div>
          <div style={{ fontSize: 12, color: T.inkSub, marginTop: 2 }}>
            {new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
        {isAdmin && (
          <div style={{ display: "flex", gap: 6 }}>
            {[7, 30].map(d => (
              <button key={d} onClick={() => setRange(d)} style={{
                padding: "6px 14px", borderRadius: T.radiusSm,
                border: `1px solid ${range === d ? T.sage : T.border}`,
                background: range === d ? T.sageLight : T.white,
                color: range === d ? T.sage : T.inkSub,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                fontFamily: "'DM Sans',sans-serif",
              }}>Last {d} days</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto" }}>

        {/* ── Stat Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
          <StatCard
            icon="👥" label="Today's Patients"
            value={stats.todayPatients}
            sub={`${stats.avgPerDay} avg/day`}
            color={T.ink}
          />
          <StatCard
            icon="📋" label={`Last ${range} Days`}
            value={stats.totalPatients}
            sub={`${stats.completionRate}% completion rate`}
            color={T.blue}
          />
          {canSeeRevenue && (
            <>
              <StatCard
                icon="💰" label="Today's Revenue"
                value={fmt(stats.todayRevenue)}
                color={T.sage}
                bg={T.sageLight}
              />
              {isAdmin && (
                <StatCard
                  icon="📈" label={`${range}-Day Revenue`}
                  value={fmt(stats.totalRevenue)}
                  sub={`${fmt(Math.round(stats.totalRevenue / range))}/day avg`}
                  color={T.sage}
                />
              )}
            </>
          )}
        </div>

        {/* ── Patient Volume Chart ── */}
        {canSeeBusyHours && (
          <div style={{ background: T.white, borderRadius: T.radius, padding: "20px 22px", border: `1px solid ${T.border}`, marginBottom: 20 }}>
            <SectionHeader title={`Patient Volume — Last ${range} Days`} icon="📅" />
            <BarChart data={stats.encChart} color={T.blue} height={100} />
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>

          {/* ── Revenue Chart ── */}
          {canSeeRevenue && isAdmin && (
            <div style={{ background: T.white, borderRadius: T.radius, padding: "20px 22px", border: `1px solid ${T.border}` }}>
              <SectionHeader title="Revenue Trend" icon="💰" />
              <BarChart data={stats.revChart} color={T.sage} height={80} />
            </div>
          )}

          {/* ── Busiest Hours ── */}
          {canSeeBusyHours && (
            <div style={{ background: T.white, borderRadius: T.radius, padding: "20px 22px", border: `1px solid ${T.border}` }}>
              <SectionHeader title="Busiest Hours" icon="⏰" />
              <BarChart data={stats.hourChart} color={T.amber} height={80} />
              <div style={{ fontSize: 11, color: T.inkSub, marginTop: 8 }}>7am – 7pm</div>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>

          {/* ── Top Diagnoses ── */}
          {canSeeDiagnoses && (
            <div style={{ background: T.white, borderRadius: T.radius, padding: "20px 22px", border: `1px solid ${T.border}` }}>
              <SectionHeader title="Top Diagnoses" icon="🔍" />
              {stats.topDx.length === 0 ? (
                <div style={{ color: T.inkSub, fontSize: 13, fontStyle: "italic" }}>No diagnoses recorded yet</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {stats.topDx.map(([name, count], i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                        background: i === 0 ? T.sage : T.paperDim,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 800,
                        color: i === 0 ? "#fff" : T.inkSub,
                        fontFamily: "'Syne',sans-serif",
                      }}>{i + 1}</div>
                      <div style={{ flex: 1, fontSize: 13, color: T.ink, fontWeight: i === 0 ? 600 : 400 }}>{name}</div>
                      <div style={{
                        fontSize: 11, fontWeight: 700, padding: "2px 8px",
                        background: T.blueLight, color: T.blue, borderRadius: 10,
                        fontFamily: "'JetBrains Mono',monospace",
                      }}>{count}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Staff Performance ── */}
          {canSeeStaff && (
            <div style={{ background: T.white, borderRadius: T.radius, padding: "20px 22px", border: `1px solid ${T.border}` }}>
              <SectionHeader title="Doctor Performance" icon="👨‍⚕️" />
              {stats.staffPerf.length === 0 ? (
                <div style={{ color: T.inkSub, fontSize: 13, fontStyle: "italic" }}>No encounters assigned yet</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {stats.staffPerf.map(([name, count], i) => {
                    const pct = Math.round((count / stats.totalPatients) * 100);
                    return (
                      <div key={i}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>{name}</span>
                          <span style={{ fontSize: 12, color: T.inkSub }}>{count} patients · {pct}%</span>
                        </div>
                        <div style={{ background: T.paperDim, borderRadius: 4, height: 6, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: T.sage, borderRadius: 4, transition: "width 0.4s ease" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Pharmacy Stats ── */}
          {canSeePharmacy && (
            <div style={{ background: T.white, borderRadius: T.radius, padding: "20px 22px", border: `1px solid ${T.border}` }}>
              <SectionHeader title="Most Prescribed Drugs" icon="💊" />
              {stats.topDrugs.length === 0 ? (
                <div style={{ color: T.inkSub, fontSize: 13, fontStyle: "italic" }}>No prescriptions recorded yet</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {stats.topDrugs.map(([name, count], i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                        background: i === 0 ? T.purple : T.paperDim,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 800,
                        color: i === 0 ? "#fff" : T.inkSub,
                        fontFamily: "'Syne',sans-serif",
                      }}>{i + 1}</div>
                      <div style={{ flex: 1, fontSize: 13, color: T.ink }}>{name}</div>
                      <div style={{
                        fontSize: 11, fontWeight: 700, padding: "2px 8px",
                        background: T.purpleLight, color: T.purple, borderRadius: 10,
                        fontFamily: "'JetBrains Mono',monospace",
                      }}>{count} units</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
