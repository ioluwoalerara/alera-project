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
  border: "#E8E4DE",
  shadow: "0 1px 3px rgba(13,17,23,0.06), 0 4px 16px rgba(13,17,23,0.04)",
  radius: 12, radiusSm: 8,
};

const fmt = v => "₦" + Math.round(v || 0).toLocaleString("en-NG");
const fmtK = v => v >= 1000 ? `₦${(v / 1000).toFixed(1)}k` : fmt(v);

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getLast30Days() {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });
}

function getLast7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

function trend(current, previous) {
  if (!previous) return null;
  const pct = ((current - previous) / previous) * 100;
  return { pct: Math.round(pct), up: pct >= 0 };
}

// ─── Sub Components ───────────────────────────────────────────────────────────
function KPICard({ icon, label, value, sub, trend, color = T.ink, bg = T.white, onClick, active }) {
  return (
    <div onClick={onClick} style={{
      background: active ? T.sageLight : bg,
      borderRadius: T.radius, padding: "18px 20px",
      border: `1.5px solid ${active ? T.sageBorder : T.border}`,
      boxShadow: T.shadow, cursor: onClick ? "pointer" : "default",
      transition: "all 0.15s",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        {trend && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
            color: trend.up ? T.sage : T.rose,
            background: trend.up ? T.sageLight : T.roseLight,
          }}>
            {trend.up ? "↑" : "↓"} {Math.abs(trend.pct)}%
          </span>
        )}
      </div>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 26, color, marginBottom: 3 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.inkMid }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: T.inkSub, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children, icon, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, color: T.ink }}>{children}</span>
      </div>
      {action}
    </div>
  );
}

function BarChart({ data, color = T.sage, height = 80, showValues = false }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: height + 20 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          {showValues && d.value > 0 && (
            <div style={{ fontSize: 8, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace" }}>
              {d.value > 999 ? fmtK(d.value) : d.value}
            </div>
          )}
          <div style={{
            width: "100%",
            height: Math.max((d.value / max) * height, d.value > 0 ? 3 : 0),
            background: d.highlight ? T.amber : color,
            borderRadius: "3px 3px 0 0",
            opacity: i === data.length - 1 ? 1 : 0.65,
            transition: "height 0.4s ease",
            position: "relative",
          }} />
          <div style={{ fontSize: 8, color: T.inkSub, textAlign: "center", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>
            {d.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── AI Insights Component ─────────────────────────────────────────────────────
function AIInsights({ stats, range }) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const prompt = `You are a healthcare business analyst for a Nigerian clinic. Analyze this data and provide 4-5 specific, actionable business insights.

Data (last ${range} days):
- Total patients: ${stats.totalPatients}
- Total revenue: ₦${Math.round(stats.totalRevenue).toLocaleString()}
- Average revenue per patient: ₦${Math.round(stats.revenuePerPatient).toLocaleString()}
- Completion rate: ${stats.completionRate}%
- Busiest day: ${stats.busiestDay}
- Slowest day: ${stats.slowestDay}
- Busiest hour: ${stats.busiestHour}
- Top diagnosis: ${stats.topDiagnosis}
- Revenue trend: ${stats.revenueTrend > 0 ? "+" : ""}${stats.revenueTrend}% vs previous period
- Patient volume trend: ${stats.patientTrend > 0 ? "+" : ""}${stats.patientTrend}% vs previous period

Return ONLY a JSON array of insights, no markdown:
[
  {
    "type": "opportunity|warning|win|recommendation",
    "title": "Short insight title",
    "detail": "1-2 sentences with specific action",
    "impact": "High|Medium|Low"
  }
]`;

      const res = await fetch("https://zrstwfjnkpfobsboprzs.supabase.co/functions/v1/claude-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 800,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const text = data.content?.find(c => c.type === "text")?.text || "[]";
      const clean = text.replace(/```json|```/g, "").trim();
      setInsights(JSON.parse(clean));
      setGenerated(true);
    } catch (e) {
      console.error("[AleraAI] Revenue insights error:", e);
      setInsights([]);
    }
    setLoading(false);
  }

  const typeConfig = {
    opportunity: { icon: "🚀", color: T.sage, bg: T.sageLight },
    warning:     { icon: "⚠️", color: T.amber, bg: T.amberLight },
    win:         { icon: "🎉", color: T.blue, bg: T.blueLight },
    recommendation: { icon: "💡", color: T.purple, bg: T.purpleLight },
  };

  return (
    <div style={{ background: "linear-gradient(135deg, #0D1117 0%, #1A2636 100%)", borderRadius: T.radius, padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#1E6B55,#27856A)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        }}>✦</div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, color: "#fff" }}>
          Alera AI · Revenue Intelligence
        </div>
        {!generated && (
          <button onClick={generate} disabled={loading} style={{
            marginLeft: "auto", padding: "6px 16px", borderRadius: 8,
            background: loading ? "rgba(255,255,255,0.1)" : "rgba(30,107,85,0.4)",
            border: "1px solid rgba(30,107,85,0.5)", color: "#4ADE80",
            fontSize: 12, fontWeight: 700, cursor: loading ? "default" : "pointer",
            fontFamily: "'Syne',sans-serif",
          }}>
            {loading ? "Analyzing…" : "✦ Generate Insights"}
          </button>
        )}
      </div>

      {!generated && !loading && (
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, fontStyle: "italic" }}>
          Click "Generate Insights" to get AI-powered business recommendations based on your clinic data.
        </div>
      )}

      {loading && (
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, fontStyle: "italic" }}>
          Claude is analyzing your clinic's performance data…
        </div>
      )}

      {insights && insights.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {insights.map((insight, i) => {
            const tc = typeConfig[insight.type] || typeConfig.recommendation;
            return (
              <div key={i} style={{
                background: "rgba(255,255,255,0.05)", borderRadius: T.radiusSm,
                padding: "12px 14px", border: "1px solid rgba(255,255,255,0.07)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 14 }}>{tc.icon}</span>
                  <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: "#fff" }}>
                    {insight.title}
                  </span>
                  <span style={{
                    marginLeft: "auto", fontSize: 9, padding: "2px 7px", borderRadius: 10,
                    background: insight.impact === "High" ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.1)",
                    color: insight.impact === "High" ? "#4ADE80" : "rgba(255,255,255,0.4)",
                    fontWeight: 700,
                  }}>{insight.impact} Impact</span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
                  {insight.detail}
                </div>
              </div>
            );
          })}
          <button onClick={() => { setGenerated(false); setInsights(null); }} style={{
            marginTop: 4, background: "none", border: "none", color: "rgba(255,255,255,0.3)",
            fontSize: 11, cursor: "pointer", textAlign: "left",
          }}>↺ Regenerate insights</button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AleraRevenueIntelligence() {
  const { role } = useRole?.() || { role: "admin" };
  const { orgId } = useAuth?.() || {};

  const isAdmin  = role === "admin";
  const isDoctor = role === "doctor";

  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange]   = useState(30);
  const [activeView, setActiveView] = useState("overview");

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    getAnalytics(orgId, 60).then(d => { // load 60 days for comparison
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [orgId]);

  const stats = useMemo(() => {
    if (!data) return null;
    const days = range === 7 ? getLast7Days() : getLast30Days();
    const prevDays = Array.from({ length: range }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (range * 2 - 1 - i));
      return d.toISOString().slice(0, 10);
    });

    const since = new Date(days[0]);
    const prevSince = new Date(prevDays[0]);
    const prevUntil = new Date(days[0]);

    const enc = data.encounters.filter(e => new Date(e.registered_at) >= since);
    const prevEnc = data.encounters.filter(e => {
      const d = new Date(e.registered_at);
      return d >= prevSince && d < prevUntil;
    });

    const bills = data.bills.filter(b => new Date(b.created_at) >= since);
    const prevBills = data.bills.filter(b => {
      const d = new Date(b.created_at);
      return d >= prevSince && d < prevUntil;
    });

    const getRevenue = (billArr) => billArr.reduce((s, b) =>
      s + (b.bill_payments?.reduce((ps, p) => ps + (p.amount || 0), 0) || 0), 0);

    const totalRevenue = getRevenue(bills);
    const prevRevenue = getRevenue(prevBills);
    const totalPatients = enc.length;
    const prevPatients = prevEnc.length;
    const completed = enc.filter(e => e.status === "completed").length;

    // Revenue by day
    const revByDay = {};
    bills.forEach(b => {
      const day = b.created_at?.slice(0, 10);
      if (day) revByDay[day] = (revByDay[day] || 0) + (b.bill_payments?.reduce((s, p) => s + (p.amount || 0), 0) || 0);
    });
    const revChart = days.map(d => ({
      label: new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short" }).slice(0, 5),
      value: Math.round(revByDay[d] || 0),
    }));

    // Patients by day
    const encByDay = {};
    enc.forEach(e => {
      const day = e.registered_at?.slice(0, 10);
      if (day) encByDay[day] = (encByDay[day] || 0) + 1;
    });
    const patChart = days.map(d => ({
      label: new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short" }).slice(0, 5),
      value: encByDay[d] || 0,
    }));

    // Revenue by day of week
    const revByDow = Array(7).fill(0);
    const countByDow = Array(7).fill(0);
    bills.forEach(b => {
      const dow = new Date(b.created_at).getDay();
      revByDow[dow] += (b.bill_payments?.reduce((s, p) => s + (p.amount || 0), 0) || 0);
      countByDow[dow]++;
    });
    const dowChart = DAYS.map((label, i) => ({
      label,
      value: Math.round(revByDow[i]),
      avg: countByDow[i] ? Math.round(revByDow[i] / countByDow[i]) : 0,
    }));
    const busiestDow = dowChart.reduce((a, b) => b.value > a.value ? b : a, dowChart[0]);
    const slowestDow = dowChart.filter(d => d.value > 0).reduce((a, b) => b.value < a.value ? b : a, dowChart[1]);

    // Revenue by hour
    const revByHour = Array(24).fill(0);
    enc.forEach(e => {
      const h = new Date(e.registered_at).getHours();
      revByHour[h]++;
    });
    const hourChart = Array.from({ length: 12 }, (_, i) => {
      const h = i + 7;
      return { label: `${h > 12 ? h - 12 : h}${h >= 12 ? "p" : "a"}`, value: revByHour[h] || 0 };
    });
    const busiestHourIdx = revByHour.indexOf(Math.max(...revByHour.slice(7, 19)));

    // Top diagnoses
    const dxCount = {};
    data.diagnoses.filter(d => new Date(d.created_at) >= since).forEach(d => {
      dxCount[d.name] = (dxCount[d.name] || 0) + 1;
    });
    const topDx = Object.entries(dxCount).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Doctor performance
    const doctorStats = {};
    enc.forEach(e => {
      const doc = e.assigned_doctor;
      if (!doc) return;
      const name = `Dr. ${doc.last_name}`;
      if (!doctorStats[name]) doctorStats[name] = { patients: 0, revenue: 0, completed: 0 };
      doctorStats[name].patients++;
      if (e.status === "completed") doctorStats[name].completed++;
    });
    bills.forEach(b => {
      // Try to match bill to doctor via encounter
      const enc_match = enc.find(e => e.id === b.encounter_id);
      if (enc_match?.assigned_doctor) {
        const name = `Dr. ${enc_match.assigned_doctor.last_name}`;
        if (doctorStats[name]) {
          doctorStats[name].revenue += (b.bill_payments?.reduce((s, p) => s + (p.amount || 0), 0) || 0);
        }
      }
    });
    const doctorPerf = Object.entries(doctorStats)
      .map(([name, s]) => ({ name, ...s, avgRevenue: s.patients ? Math.round(s.revenue / s.patients) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    // Wait time analysis
    const waitTimes = enc
      .filter(e => e.registered_at && e.seen_at)
      .map(e => (new Date(e.seen_at) - new Date(e.registered_at)) / 60000);
    const avgWait = waitTimes.length ? Math.round(waitTimes.reduce((s, v) => s + v, 0) / waitTimes.length) : 0;

    return {
      totalRevenue, prevRevenue, totalPatients, prevPatients, completed,
      completionRate: totalPatients ? Math.round((completed / totalPatients) * 100) : 0,
      revenuePerPatient: totalPatients ? Math.round(totalRevenue / totalPatients) : 0,
      avgWait,
      revChart, patChart, dowChart, hourChart, topDx, doctorPerf,
      busiestDay: busiestDow.label,
      slowestDay: slowestDow?.label || "—",
      busiestHour: busiestHourIdx >= 0 ? `${busiestHourIdx > 12 ? busiestHourIdx - 12 : busiestHourIdx}${busiestHourIdx >= 12 ? "PM" : "AM"}` : "—",
      topDiagnosis: topDx[0]?.[0] || "—",
      revenueTrend: trend(totalRevenue, prevRevenue)?.pct || 0,
      patientTrend: trend(totalPatients, prevPatients)?.pct || 0,
    };
  }, [data, range]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: T.paper, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif", color: T.inkSub }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
        Loading revenue intelligence…
      </div>
    </div>
  );

  if (!stats) return null;

  const views = [
    { key: "overview",     label: "Overview" },
    { key: "revenue",      label: "Revenue" },
    { key: "patients",     label: "Patients" },
    { key: "doctors",      label: "Doctors", show: isAdmin },
    { key: "diagnoses",    label: "Diagnoses" },
  ].filter(v => v.show !== false);

  return (
    <div style={{ minHeight: "100vh", background: T.paper, fontFamily: "'DM Sans',sans-serif", color: T.ink }}>

      {/* Header */}
      <div style={{
        background: T.white, borderBottom: `1px solid ${T.border}`,
        padding: "16px 28px", position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: T.ink }}>Revenue Intelligence</div>
            <div style={{ fontSize: 12, color: T.inkSub }}>
              {stats.busiestDay} is your most profitable day · {stats.busiestHour} is peak hour
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {[7, 30].map(d => (
              <button key={d} onClick={() => setRange(d)} style={{
                padding: "6px 14px", borderRadius: T.radiusSm,
                border: `1px solid ${range === d ? T.sage : T.border}`,
                background: range === d ? T.sageLight : T.white,
                color: range === d ? T.sage : T.inkSub,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>Last {d}d</button>
            ))}
          </div>
        </div>

        {/* View tabs */}
        <div style={{ display: "flex", gap: 2 }}>
          {views.map(v => (
            <button key={v.key} onClick={() => setActiveView(v.key)} style={{
              padding: "6px 14px", border: "none", borderRadius: T.radiusSm,
              background: activeView === v.key ? T.ink : "transparent",
              color: activeView === v.key ? "#fff" : T.inkSub,
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif",
            }}>{v.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto" }}>

        {/* ── Overview ── */}
        {activeView === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              <KPICard
                icon="💰" label="Total Revenue"
                value={fmtK(stats.totalRevenue)}
                sub={`${range}-day period`}
                trend={trend(stats.totalRevenue, stats.prevRevenue)}
                color={T.sage}
              />
              <KPICard
                icon="👥" label="Total Patients"
                value={stats.totalPatients}
                sub={`${stats.completionRate}% completion`}
                trend={trend(stats.totalPatients, stats.prevPatients)}
              />
              <KPICard
                icon="💵" label="Revenue/Patient"
                value={fmtK(stats.revenuePerPatient)}
                sub="Average per visit"
                color={T.blue}
              />
              <KPICard
                icon="⏱" label="Avg Wait Time"
                value={`${stats.avgWait}m`}
                sub="Registration to doctor"
                color={stats.avgWait > 45 ? T.rose : T.ink}
              />
              <KPICard
                icon="✅" label="Completed"
                value={stats.completed}
                sub="Fully discharged"
                color={T.sage}
              />
            </div>

            {/* AI Insights */}
            {isAdmin && <AIInsights stats={stats} range={range} />}

            {/* Quick charts */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: T.white, borderRadius: T.radius, padding: "18px 20px", border: `1px solid ${T.border}` }}>
                <SectionTitle icon="💰">Revenue Trend</SectionTitle>
                <BarChart data={stats.revChart} color={T.sage} height={80} showValues />
              </div>
              <div style={{ background: T.white, borderRadius: T.radius, padding: "18px 20px", border: `1px solid ${T.border}` }}>
                <SectionTitle icon="👥">Patient Volume</SectionTitle>
                <BarChart data={stats.patChart} color={T.blue} height={80} />
              </div>
            </div>
          </div>
        )}

        {/* ── Revenue ── */}
        {activeView === "revenue" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: T.white, borderRadius: T.radius, padding: "18px 20px", border: `1px solid ${T.border}` }}>
                <SectionTitle icon="📅">Revenue by Day</SectionTitle>
                <BarChart data={stats.revChart} color={T.sage} height={100} showValues />
              </div>
              <div style={{ background: T.white, borderRadius: T.radius, padding: "18px 20px", border: `1px solid ${T.border}` }}>
                <SectionTitle icon="📊">Revenue by Day of Week</SectionTitle>
                <BarChart
                  data={stats.dowChart.map(d => ({ ...d, highlight: d.label === stats.slowestDay }))}
                  color={T.sage} height={100} showValues
                />
                <div style={{ fontSize: 11, color: T.inkSub, marginTop: 8 }}>
                  🟠 Highlighted = slowest day ({stats.slowestDay}) — opportunity to grow
                </div>
              </div>
            </div>
            <div style={{ background: T.white, borderRadius: T.radius, padding: "18px 20px", border: `1px solid ${T.border}` }}>
              <SectionTitle icon="⏰">Busiest Hours (Patient Volume)</SectionTitle>
              <BarChart data={stats.hourChart} color={T.amber} height={80} />
              <div style={{ fontSize: 11, color: T.inkSub, marginTop: 8 }}>
                Peak hour: {stats.busiestHour} · 7AM – 7PM shown
              </div>
            </div>
          </div>
        )}

        {/* ── Patients ── */}
        {activeView === "patients" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              <KPICard icon="👥" label="Total Patients" value={stats.totalPatients} color={T.blue} />
              <KPICard icon="✅" label="Completed" value={stats.completed} color={T.sage} />
              <KPICard icon="📊" label="Completion Rate" value={`${stats.completionRate}%`} color={stats.completionRate > 80 ? T.sage : T.amber} />
              <KPICard icon="⏱" label="Avg Wait" value={`${stats.avgWait}m`} color={stats.avgWait > 45 ? T.rose : T.ink} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: T.white, borderRadius: T.radius, padding: "18px 20px", border: `1px solid ${T.border}` }}>
                <SectionTitle icon="📅">Patient Volume by Day</SectionTitle>
                <BarChart data={stats.patChart} color={T.blue} height={100} />
              </div>
              <div style={{ background: T.white, borderRadius: T.radius, padding: "18px 20px", border: `1px solid ${T.border}` }}>
                <SectionTitle icon="📊">Volume by Day of Week</SectionTitle>
                <BarChart
                  data={stats.dowChart.map(d => ({ label: d.label, value: d.avg }))}
                  color={T.blue} height={100}
                />
                <div style={{ fontSize: 11, color: T.inkSub, marginTop: 8 }}>Average patients per day</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Doctors ── */}
        {activeView === "doctors" && isAdmin && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {stats.doctorPerf.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: T.inkSub }}>No doctor data available yet</div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                  {stats.doctorPerf.slice(0, 3).map((d, i) => (
                    <KPICard
                      key={d.name}
                      icon={["🥇", "🥈", "🥉"][i]}
                      label={d.name}
                      value={fmtK(d.revenue)}
                      sub={`${d.patients} patients · ${d.avgRevenue > 0 ? fmtK(d.avgRevenue) + "/pt" : "—"}`}
                      color={T.sage}
                    />
                  ))}
                </div>
                <div style={{ background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                  <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13 }}>
                    Doctor Performance Breakdown
                  </div>
                  <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                    {stats.doctorPerf.map(d => {
                      const maxRev = stats.doctorPerf[0].revenue || 1;
                      return (
                        <div key={d.name}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{d.name}</div>
                              <div style={{ fontSize: 11, color: T.inkSub }}>
                                {d.patients} patients · {Math.round((d.completed / (d.patients || 1)) * 100)}% completion
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, color: T.sage }}>{fmtK(d.revenue)}</div>
                              <div style={{ fontSize: 11, color: T.inkSub }}>{fmtK(d.avgRevenue)}/patient</div>
                            </div>
                          </div>
                          <div style={{ background: T.paperDim, borderRadius: 4, height: 6, overflow: "hidden" }}>
                            <div style={{
                              width: `${(d.revenue / maxRev) * 100}%`, height: "100%",
                              background: T.sage, borderRadius: 4, transition: "width 0.4s ease",
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Diagnoses ── */}
        {activeView === "diagnoses" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13 }}>
                Top Diagnoses — Last {range} Days
              </div>
              {stats.topDx.length === 0 ? (
                <div style={{ padding: 30, textAlign: "center", color: T.inkSub, fontSize: 13 }}>No diagnoses recorded yet</div>
              ) : (
                <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {stats.topDx.map(([name, count], i) => {
                    const maxCount = stats.topDx[0][1];
                    return (
                      <div key={i}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{
                              width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                              background: i === 0 ? T.sage : T.paperDim,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10, fontWeight: 800,
                              color: i === 0 ? "#fff" : T.inkSub,
                            }}>{i + 1}</div>
                            <span style={{ fontSize: 13, fontWeight: i === 0 ? 700 : 400, color: T.ink }}>{name}</span>
                          </div>
                          <span style={{
                            fontSize: 12, fontWeight: 700, padding: "2px 10px",
                            background: T.blueLight, color: T.blue, borderRadius: 10,
                            fontFamily: "'JetBrains Mono',monospace",
                          }}>{count} cases</span>
                        </div>
                        <div style={{ background: T.paperDim, borderRadius: 4, height: 5, overflow: "hidden" }}>
                          <div style={{
                            width: `${(count / maxCount) * 100}%`, height: "100%",
                            background: i === 0 ? T.sage : T.blue, borderRadius: 4,
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {isAdmin && (
              <div style={{ background: T.amberLight, border: `1px solid ${T.amber}33`, borderRadius: T.radius, padding: "16px 18px" }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: T.amber, marginBottom: 6 }}>
                  💡 Clinic Insight
                </div>
                <div style={{ fontSize: 13, color: T.inkMid }}>
                  {stats.topDx[0] ? (
                    <>
                      <strong>{stats.topDx[0][0]}</strong> is your most common diagnosis with {stats.topDx[0][1]} cases.
                      Consider stocking adequate medications and ensuring your team is well-trained in its management.
                      {stats.topDx[0][0].toLowerCase().includes("malaria") &&
                        " Ensure RDT kits and ACT drugs are always available."}
                    </>
                  ) : "Record more diagnoses to unlock insights."}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
