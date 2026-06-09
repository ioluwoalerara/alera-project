import { useState, useEffect, useRef } from "react";
import { getPatientPortalChart, getPatientAppointments, getPatientMessages, sendPatientMessage, searchAleraClinics } from "./supabase.js";

async function callClaude(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || "ANON_KEY_PLACEHOLDER";
  const res = await fetch("https://zrstwfjnkpfobsboprzs.supabase.co/functions/v1/claude-proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpyc3R3Zmpua3Bmb2JzYm9wcnpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjAwNjgsImV4cCI6MjA4ODQzNjA2OH0.K7C2_ScRsysaemOsDyaF67Y--ONEJREAMJNFXtvBmVc",
    },
    body: JSON.stringify(body),
  });
  return res.json();
}
import { supabase } from "./supabase.js";

// ─── Design Tokens (mobile-first) ─────────────────────────────────────────────
const T = {
  ink: "#0D1117", inkSub: "#6E7891", inkMid: "#3D4558",
  paper: "#F7F5F1", paperDim: "#EFECE7", white: "#FFFFFF",
  sage: "#1A6650", sageMid: "#237A5F", sageLight: "#E6F3EE", sageBorder: "rgba(26,102,80,0.2)",
  blue: "#1854A8", blueLight: "#E8F0FB",
  amber: "#C97A10", amberLight: "#FEF5E7",
  rose: "#B83232", roseLight: "#FDECEA",
  purple: "#5E3FAE", purpleLight: "#F0EBFF",
  border: "#E8E4DE",
  radius: 16, radiusSm: 10,
};

const fmt = v => "₦" + Math.round(v || 0).toLocaleString("en-NG");

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function fmtTime(h) {
  return `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "PM" : "AM"}`;
}

function age(dob) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob)) / 31557600000);
}

// ─── AI Health Summary ────────────────────────────────────────────────────────
function AISummaryCard({ patient, lastEncounter }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!lastEncounter) return;
    setLoading(true);
    const note = lastEncounter.clinical_notes?.[0];
    const diagnoses = lastEncounter.diagnoses?.map(d => d.name).join(", ") || "Not recorded";
    const drugs = lastEncounter.prescriptions?.map(p => p.drug_name).join(", ") || "None";

    const prompt = `You are a friendly health assistant. Write a brief, warm, patient-friendly summary of their most recent clinic visit. Use simple language, no medical jargon. Keep it to 2-3 sentences.

Visit date: ${fmtDate(lastEncounter.registered_at)}
Diagnosis: ${diagnoses}
Medications prescribed: ${drugs}
Doctor's plan: ${note?.plan || "Not recorded"}

Write directly to the patient as "you". Be reassuring and positive.`;

    (async () => {
      const { data: { session: _cs } } = await supabase.auth.getSession();
      const claudeToken = _cs?.access_token || "";
      fetch("https://zrstwfjnkpfobsboprzs.supabase.co/functions/v1/claude-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpyc3R3Zmpua3Bmb2JzYm9wcnpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjAwNjgsImV4cCI6MjA4ODQzNjA2OH0.K7C2_ScRsysaemOsDyaF67Y--ONEJREAMJNFXtvBmVc" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 200,
          messages: [{ role: "user", content: prompt }],
        }),
      })
        .then(r => r.json())
        .then(d => {
          setSummary(d.content?.find(c => c.type === "text")?.text || null);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    })();
  }, [lastEncounter?.id]);

  if (!lastEncounter) return null;

  return (
    <div style={{
      background: "linear-gradient(135deg, #0D1117 0%, #1A2636 100%)",
      borderRadius: T.radius, padding: "20px", marginBottom: 16,
      border: "1px solid rgba(26,102,80,0.3)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>✨</span>
        <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12, color: "#4ADE80", textTransform: "uppercase", letterSpacing: 0.8 }}>
          Your Last Visit Summary
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{fmtDate(lastEncounter.registered_at)}</span>
      </div>
      {loading && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, fontStyle: "italic" }}>Loading your health summary…</div>}
      {summary && <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 1.6 }}>{summary}</div>}
      {!loading && !summary && (
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
          Diagnosis: {lastEncounter.diagnoses?.[0]?.name || "—"} · {fmtDate(lastEncounter.registered_at)}
        </div>
      )}
    </div>
  );
}

// ─── AI Health Assistant ──────────────────────────────────────────────────────
function AIHealthAssistant({ patient, chartData }) {
  const [messages, setMessages] = useState([
    { role: "assistant", text: `Hi ${patient.first_name}! 👋 I'm your Alera AI health assistant. I can answer health questions and help you understand your medical history. What would you like to know?` }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(m => [...m, { role: "user", text: userMsg }]);
    setLoading(true);

    // Build context from chart
    const recentDx = chartData.slice(0, 3).flatMap(e => e.diagnoses?.map(d => d.name) || []).join(", ");
    const currentMeds = chartData[0]?.prescriptions?.map(p => p.drug_name).join(", ") || "None";
    const allergies = patient.patient_allergies?.map(a => a.allergen).join(", ") || "None";

    const systemPrompt = `You are a friendly, helpful health assistant for ${patient.first_name} ${patient.last_name}. 
You have access to their medical history. Always be warm, clear, and use simple language.
Never diagnose or replace a doctor — always recommend seeing a doctor for serious concerns.

Patient context:
- Age: ${age(patient.date_of_birth) || "Unknown"}
- Blood group: ${patient.blood_group || "Unknown"}  
- Allergies: ${allergies}
- Recent diagnoses: ${recentDx || "None recorded"}
- Recent medications: ${currentMeds}

Keep responses concise and helpful. If asked about something serious, recommend booking an appointment.`;

    const history = messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }));

    fetch("https://zrstwfjnkpfobsboprzs.supabase.co/functions/v1/claude-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpyc3R3Zmpua3Bmb2JzYm9wcnpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjAwNjgsImV4cCI6MjA4ODQzNjA2OH0.K7C2_ScRsysaemOsDyaF67Y--ONEJREAMJNFXtvBmVc" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        system: systemPrompt,
        messages: [...history, { role: "user", content: userMsg }],
      }),
    })
      .then(r => r.json())
      .then(d => {
        const text = d.content?.find(c => c.type === "text")?.text || "Sorry, I couldn't process that. Please try again.";
        setMessages(m => [...m, { role: "assistant", text }]);
        setLoading(false);
      })
      .catch(() => {
        setMessages(m => [...m, { role: "assistant", text: "Sorry, I'm having trouble connecting. Please try again." }]);
        setLoading(false);
      });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start",
          }}>
            <div style={{
              maxWidth: "80%", padding: "12px 16px", borderRadius: 16,
              borderBottomRightRadius: m.role === "user" ? 4 : 16,
              borderBottomLeftRadius: m.role === "assistant" ? 4 : 16,
              background: m.role === "user" ? T.sage : T.white,
              color: m.role === "user" ? "#fff" : T.ink,
              fontSize: 14, lineHeight: 1.5,
              border: m.role === "assistant" ? `1px solid ${T.border}` : "none",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "12px 16px", background: T.white, borderRadius: 16, borderBottomLeftRadius: 4, border: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: T.inkSub, animation: `bounce 1.2s ease infinite ${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendMessage()}
          placeholder="Ask me anything about your health…"
          style={{
            flex: 1, padding: "12px 16px", border: `1px solid ${T.border}`,
            borderRadius: 24, fontSize: 14, outline: "none",
            fontFamily: "'DM Sans',sans-serif",
          }}
        />
        <button onClick={sendMessage} disabled={!input.trim() || loading} style={{
          width: 44, height: 44, borderRadius: "50%", border: "none",
          background: input.trim() ? T.sage : T.paperDim, color: input.trim() ? "#fff" : T.inkSub,
          fontSize: 18, cursor: input.trim() ? "pointer" : "default",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s", flexShrink: 0,
        }}>↑</button>
      </div>
    </div>
  );
}

// ─── Clinic Discovery ─────────────────────────────────────────────────────────
function ClinicDiscovery({ patientId }) {
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const SPECIALTIES = ["General Practice", "Pediatrics", "Obstetrics & Gynaecology", "Cardiology", "Ophthalmology", "Dentistry", "Dermatology", "Orthopaedics", "ENT", "Psychiatry"];

  async function handleSearch() {
    setLoading(true);
    setSearched(true);
    const { data } = await searchAleraClinics(query, specialty);
    setResults(data);
    setLoading(false);
  }

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ marginBottom: 16 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          placeholder="Search clinics by name or location…"
          style={{
            width: "100%", padding: "12px 16px", border: `1px solid ${T.border}`,
            borderRadius: 24, fontSize: 14, outline: "none", marginBottom: 10,
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {SPECIALTIES.map(s => (
            <button key={s} onClick={() => setSpecialty(specialty === s ? "" : s)} style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: `1px solid ${specialty === s ? T.sage : T.border}`,
              background: specialty === s ? T.sageLight : T.white,
              color: specialty === s ? T.sage : T.inkSub, cursor: "pointer",
            }}>{s}</button>
          ))}
        </div>
        <button onClick={handleSearch} style={{
          width: "100%", padding: "12px", background: T.sage, color: "#fff",
          border: "none", borderRadius: 24, fontSize: 14, fontWeight: 700,
          cursor: "pointer", fontFamily: "'Syne',sans-serif",
        }}>🔍 Search Clinics</button>
      </div>

      {loading && <div style={{ textAlign: "center", color: T.inkSub, padding: 20 }}>Searching…</div>}

      {!loading && searched && results.length === 0 && (
        <div style={{ textAlign: "center", color: T.inkSub, padding: 20 }}>No clinics found. Try a different search.</div>
      )}

      {results.map(clinic => (
        <div key={clinic.id} style={{
          background: T.white, borderRadius: T.radius, padding: "16px",
          border: `1px solid ${T.border}`, marginBottom: 12,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, background: T.sageLight,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, flexShrink: 0,
            }}>🏥</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 3 }}>{clinic.name}</div>
              <div style={{ fontSize: 12, color: T.inkSub }}>{clinic.address || "Address not listed"}</div>
              {clinic.specialties?.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                  {clinic.specialties.slice(0, 3).map(s => (
                    <span key={s} style={{ fontSize: 10, padding: "2px 8px", background: T.blueLight, color: T.blue, borderRadius: 10, fontWeight: 600 }}>{s}</span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ fontSize: 10, padding: "3px 8px", background: T.sageLight, color: T.sage, borderRadius: 10, fontWeight: 700, flexShrink: 0 }}>
              On Alera ✓
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{
              flex: 1, padding: "10px", background: T.sage, color: "#fff",
              border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "'Syne',sans-serif",
            }}>📅 Book Appointment</button>
            {clinic.phone && (
              <a href={`tel:${clinic.phone}`} style={{
                padding: "10px 16px", background: T.white, color: T.sage,
                border: `1px solid ${T.sageBorder}`, borderRadius: 10,
                fontSize: 13, fontWeight: 700, textDecoration: "none",
                display: "flex", alignItems: "center",
              }}>📞 Call</a>
            )}
          </div>
        </div>
      ))}

      {!searched && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: T.inkSub }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏥</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: T.ink, marginBottom: 8 }}>Find a Clinic</div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>Search for clinics near you or filter by specialty</div>
        </div>
      )}
    </div>
  );
}

// ─── Main Patient Portal ──────────────────────────────────────────────────────
export default function AleraPatientPortal({ patient, onLogout }) {
  const [activeTab, setActiveTab] = useState("home");
  const [chartData, setChartData] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const name = [patient.first_name, patient.last_name].filter(Boolean).join(" ");
  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  useEffect(() => {
    if (!patient.id) return;
    Promise.all([
      getPatientPortalChart(patient.id),
      getPatientAppointments(patient.id),
    ]).then(([chart, appts]) => {
      setChartData(chart.data);
      setAppointments(appts.data);
      setLoading(false);
    });
  }, [patient.id]);

  // Load messages when tab is active
  useEffect(() => {
    if (activeTab === "messages" && patient.id && patient.org_id) {
      getPatientMessages(patient.id, patient.org_id).then(({ data }) => setMessages(data));
    }
  }, [activeTab, patient.id]);

  const lastEncounter = chartData[0] || null;
  const nextAppointment = appointments[0] || null;

  const TABS = [
    { key: "home",      icon: "🏠", label: "Home" },
    { key: "chart",     icon: "📋", label: "My Chart" },
    { key: "find",      icon: "🔍", label: "Find Care" },
    { key: "appts",     icon: "📅", label: "Appointments" },
    { key: "messages",  icon: "💬", label: "Messages" },
    { key: "ai",        icon: "✨", label: "AI Assistant" },
  ];

  return (
    <div style={{
      minHeight: "100vh", background: T.paper,
      fontFamily: "'DM Sans',sans-serif", color: T.ink,
      maxWidth: 480, margin: "0 auto", position: "relative",
      display: "flex", flexDirection: "column",
    }}>

      {/* Header */}
      <div style={{
        background: T.white, borderBottom: `1px solid ${T.border}`,
        padding: "16px 20px", position: "sticky", top: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: T.ink, letterSpacing: -0.5 }}>
          al<span style={{ color: T.sage }}>era</span>
          <span style={{ fontSize: 11, color: T.inkSub, fontWeight: 400, fontFamily: "'DM Sans',sans-serif", marginLeft: 6 }}>Patient</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, color: T.inkSub }}>{name}</div>
          <button onClick={onLogout} style={{ background: "none", border: "none", color: T.inkSub, cursor: "pointer", fontSize: 13 }}>Sign out</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 80 }}>

        {/* ── Home ── */}
        {activeTab === "home" && (
          <div style={{ padding: "20px 16px" }}>
            {/* Greeting */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 24, color: T.ink, marginBottom: 4 }}>
                {greeting()}, {patient.first_name} 👋
              </div>
              <div style={{ fontSize: 13, color: T.inkSub }}>
                {new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" })}
              </div>
            </div>

            {/* APID card */}
            <div style={{
              background: T.white, borderRadius: T.radius, padding: "14px 16px",
              border: `1px solid ${T.border}`, marginBottom: 16,
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: T.inkSub, marginBottom: 3 }}>Your Alera Patient ID</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 18, color: T.sage, letterSpacing: 1 }}>
                  {patient.global_patient_id || "—"}
                </div>
                <div style={{ fontSize: 11, color: T.inkSub, marginTop: 2 }}>Show this at any Alera clinic</div>
              </div>
              <button onClick={() => navigator.clipboard?.writeText(patient.global_patient_id)} style={{
                padding: "6px 12px", background: T.sageLight, color: T.sage,
                border: `1px solid ${T.sageBorder}`, borderRadius: 8,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>Copy</button>
            </div>

            {/* AI Summary */}
            <AISummaryCard patient={patient} lastEncounter={lastEncounter} />

            {/* Next appointment */}
            {nextAppointment && (
              <div style={{
                background: T.blueLight, borderRadius: T.radius, padding: "14px 16px",
                border: `1px solid ${T.blue}22`, marginBottom: 16,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.blue, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                  📅 Next Appointment
                </div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 3 }}>
                  {nextAppointment.appointment_type}
                </div>
                <div style={{ fontSize: 13, color: T.inkSub }}>
                  {fmtDate(nextAppointment.appointment_date)} at {fmtTime(nextAppointment.hour)}
                  {nextAppointment.doctor_name && ` · ${nextAppointment.doctor_name}`}
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { icon: "📋", label: "My Chart", tab: "chart", color: T.sage, bg: T.sageLight },
                { icon: "📅", label: "Book Appointment", tab: "find", color: T.blue, bg: T.blueLight },
                { icon: "💬", label: "Message Clinic", tab: "messages", color: T.purple, bg: T.purpleLight },
                { icon: "✨", label: "Ask AI", tab: "ai", color: T.amber, bg: T.amberLight },
              ].map(({ icon, label, tab, color, bg }) => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  padding: "16px", background: bg, border: `1px solid ${color}22`,
                  borderRadius: T.radius, cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s",
                }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'Syne',sans-serif" }}>{label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── My Chart ── */}
        {activeTab === "chart" && (
          <div style={{ padding: "16px" }}>
            {/* Patient info */}
            <div style={{ background: T.white, borderRadius: T.radius, padding: "16px", border: `1px solid ${T.border}`, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: "50%", background: T.sage,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: "#fff",
                }}>
                  {name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: T.ink }}>{name}</div>
                  <div style={{ fontSize: 12, color: T.inkSub }}>
                    {age(patient.date_of_birth) ? `${age(patient.date_of_birth)} years` : ""} {patient.biological_sex && `· ${patient.biological_sex}`}
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { label: "Blood Type", value: patient.blood_group || "—" },
                  { label: "Allergies", value: patient.patient_allergies?.length ? `${patient.patient_allergies.length} recorded` : "None" },
                  { label: "PCP", value: patient.pcp_name || "Not set" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: T.paperDim, borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 9, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Allergies */}
            {patient.patient_allergies?.length > 0 && (
              <div style={{ background: T.roseLight, borderRadius: T.radiusSm, padding: "12px 14px", border: `1px solid rgba(184,50,50,0.2)`, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.rose, marginBottom: 6 }}>⚠ Allergies</div>
                {patient.patient_allergies.map((a, i) => (
                  <div key={i} style={{ fontSize: 13, color: T.ink }}>{a.allergen}</div>
                ))}
              </div>
            )}

            {/* Visit history */}
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 10 }}>
              Visit History
            </div>
            {loading ? (
              <div style={{ textAlign: "center", color: T.inkSub, padding: 20 }}>Loading your records…</div>
            ) : chartData.length === 0 ? (
              <div style={{ textAlign: "center", color: T.inkSub, padding: 30, background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                No visits recorded yet
              </div>
            ) : (
              chartData.map((enc, i) => (
                <div key={enc.id} style={{
                  background: T.white, borderRadius: T.radius, padding: "14px 16px",
                  border: `1px solid ${T.border}`, marginBottom: 10,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: T.ink }}>
                      {fmtDate(enc.registered_at)}
                    </div>
                    {i === 0 && <span style={{ fontSize: 10, padding: "2px 8px", background: T.sageLight, color: T.sage, borderRadius: 10, fontWeight: 700 }}>Most Recent</span>}
                  </div>
                  {enc.chief_complaint && <div style={{ fontSize: 13, color: T.inkSub, marginBottom: 4 }}>📋 {enc.chief_complaint}</div>}
                  {enc.diagnoses?.[0] && <div style={{ fontSize: 13, color: T.ink, marginBottom: 4 }}>🔍 {enc.diagnoses[0].name}</div>}
                  {enc.prescriptions?.length > 0 && (
                    <div style={{ fontSize: 12, color: T.purple }}>💊 {enc.prescriptions.map(p => p.drug_name).join(", ")}</div>
                  )}
                  {enc.assigned_doctor && (
                    <div style={{ fontSize: 12, color: T.inkSub, marginTop: 4 }}>Dr. {enc.assigned_doctor.last_name}</div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Find Care ── */}
        {activeTab === "find" && <ClinicDiscovery patientId={patient.id} />}

        {/* ── Appointments ── */}
        {activeTab === "appts" && (
          <div style={{ padding: "16px" }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: T.ink, marginBottom: 14 }}>Your Appointments</div>
            {appointments.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 4 }}>No upcoming appointments</div>
                <div style={{ fontSize: 13, color: T.inkSub, marginBottom: 16 }}>Find a clinic to book your first appointment</div>
                <button onClick={() => setActiveTab("find")} style={{
                  padding: "10px 20px", background: T.sage, color: "#fff", border: "none",
                  borderRadius: 24, fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}>Find a Clinic</button>
              </div>
            ) : (
              appointments.map(appt => (
                <div key={appt.id} style={{
                  background: T.white, borderRadius: T.radius, padding: "16px",
                  border: `1px solid ${T.border}`, marginBottom: 12,
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 3 }}>
                        {appt.appointment_type}
                      </div>
                      <div style={{ fontSize: 13, color: T.inkSub }}>
                        📅 {fmtDate(appt.appointment_date)} at {fmtTime(appt.hour)}
                      </div>
                      {appt.doctor_name && <div style={{ fontSize: 12, color: T.inkSub, marginTop: 2 }}>👨‍⚕️ {appt.doctor_name}</div>}
                      {appt.notes && <div style={{ fontSize: 12, color: T.inkSub, marginTop: 2, fontStyle: "italic" }}>{appt.notes}</div>}
                    </div>
                    <span style={{
                      fontSize: 10, padding: "3px 8px", borderRadius: 10, fontWeight: 700,
                      background: appt.status === "scheduled" ? T.sageLight : T.roseLight,
                      color: appt.status === "scheduled" ? T.sage : T.rose,
                    }}>{appt.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Messages ── */}
        {activeTab === "messages" && (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 140px)" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: T.inkSub }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 4 }}>No messages yet</div>
                  <div style={{ fontSize: 13 }}>Send a message to your clinic below</div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: msg.sender === "patient" ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth: "75%", padding: "10px 14px", borderRadius: 14,
                      borderBottomRightRadius: msg.sender === "patient" ? 4 : 14,
                      borderBottomLeftRadius: msg.sender === "staff" ? 4 : 14,
                      background: msg.sender === "patient" ? T.sage : T.white,
                      color: msg.sender === "patient" ? "#fff" : T.ink,
                      border: msg.sender === "staff" ? `1px solid ${T.border}` : "none",
                      fontSize: 14, lineHeight: 1.5,
                    }}>
                      {msg.sender === "staff" && msg.sender_name && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.inkSub, marginBottom: 4 }}>{msg.sender_name}</div>
                      )}
                      {msg.message}
                      <div style={{ fontSize: 10, color: msg.sender === "patient" ? "rgba(255,255,255,0.6)" : T.inkSub, marginTop: 4, textAlign: "right" }}>
                        {new Date(msg.created_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
              <input
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === "Enter" && newMessage.trim()) {
                    await sendPatientMessage(patient.id, patient.org_id, newMessage.trim());
                    setNewMessage("");
                    const { data } = await getPatientMessages(patient.id, patient.org_id);
                    setMessages(data);
                  }
                }}
                placeholder="Message your clinic…"
                style={{
                  flex: 1, padding: "12px 16px", border: `1px solid ${T.border}`,
                  borderRadius: 24, fontSize: 14, outline: "none",
                  fontFamily: "'DM Sans',sans-serif",
                }}
              />
              <button onClick={async () => {
                if (!newMessage.trim()) return;
                await sendPatientMessage(patient.id, patient.org_id, newMessage.trim());
                setNewMessage("");
                const { data } = await getPatientMessages(patient.id, patient.org_id);
                setMessages(data);
              }} style={{
                width: 44, height: 44, borderRadius: "50%", border: "none",
                background: newMessage.trim() ? T.sage : T.paperDim,
                color: newMessage.trim() ? "#fff" : T.inkSub,
                fontSize: 18, cursor: "pointer", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>↑</button>
            </div>
          </div>
        )}

        {/* ── AI Assistant ── */}
        {activeTab === "ai" && (
          <div style={{ height: "calc(100vh - 140px)", display: "flex", flexDirection: "column" }}>
            <AIHealthAssistant patient={patient} chartData={chartData} />
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 480, background: T.white,
        borderTop: `1px solid ${T.border}`, padding: "8px 0",
        display: "flex", justifyContent: "space-around",
        zIndex: 50,
      }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            padding: "6px 12px", border: "none", background: "transparent",
            cursor: "pointer", flex: 1,
          }}>
            <span style={{ fontSize: 20 }}>{tab.icon}</span>
            <span style={{
              fontSize: 9, fontWeight: activeTab === tab.key ? 700 : 400,
              color: activeTab === tab.key ? T.sage : T.inkSub,
              fontFamily: "'DM Sans',sans-serif",
            }}>{tab.label}</span>
            {activeTab === tab.key && (
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.sage }} />
            )}
          </button>
        ))}
      </div>

      <style>{`
        @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
      `}</style>
    </div>
  );
}
