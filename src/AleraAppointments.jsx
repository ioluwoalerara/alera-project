import { useState, useEffect, useCallback } from "react";
import { useRole } from "./AleraShell.jsx";
import { useAuth } from "./AleraAuth.jsx";
import { supabase, searchPatients } from "./supabase.js";

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

const HOURS = Array.from({ length: 11 }, (_, i) => {
  const h = i + 7; // 7am to 5pm
  return { value: h, label: `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "PM" : "AM"}` };
});

const DURATIONS = [15, 30, 45, 60, 90];

const APPOINTMENT_TYPES = [
  "New Consultation", "Follow-Up", "Routine Check-Up",
  "Ante-Natal", "Post-Natal", "Vaccination",
  "Lab Results Review", "Wound Dressing", "Injection/IV",
  "Specialist Referral",
];

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });
}

function fmtTime(h) {
  return `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "PM" : "AM"}`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

// ─── Appointment Card ─────────────────────────────────────────────────────────
function AppointmentCard({ appt, onCancel, onReschedule }) {
  const typeColors = {
    "New Consultation": { color: T.blue, bg: T.blueLight },
    "Follow-Up": { color: T.sage, bg: T.sageLight },
    "Routine Check-Up": { color: T.purple, bg: T.purpleLight },
    "Ante-Natal": { color: T.rose, bg: T.roseLight },
  };
  const tc = typeColors[appt.appointment_type] || { color: T.inkSub, bg: T.paperDim };

  return (
    <div style={{
      background: T.white, borderRadius: T.radiusSm, padding: "12px 16px",
      border: `1px solid ${T.border}`, display: "flex", gap: 12, alignItems: "flex-start",
    }}>
      <div style={{
        width: 4, borderRadius: 4, alignSelf: "stretch", flexShrink: 0,
        background: tc.color, minHeight: 40,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: T.ink }}>
            {appt.patient_name || "Unknown Patient"}
          </span>
          <span style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 10,
            background: tc.bg, color: tc.color, fontWeight: 700,
            fontFamily: "'Syne',sans-serif",
          }}>{appt.appointment_type}</span>
          {appt.status === "cancelled" && (
            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: T.roseLight, color: T.rose, fontWeight: 700 }}>Cancelled</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: T.inkSub, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span>🕐 {fmtTime(appt.hour)}</span>
          <span>⏱ {appt.duration_minutes} min</span>
          {appt.doctor_name && <span>👨‍⚕️ {appt.doctor_name}</span>}
          {appt.notes && <span>📋 {appt.notes}</span>}
        </div>
      </div>
      {appt.status !== "cancelled" && (
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={() => onCancel(appt)} style={{
            padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`,
            background: T.white, color: T.inkSub, fontSize: 11, cursor: "pointer",
            fontFamily: "'DM Sans',sans-serif",
          }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ─── Book Appointment Modal ───────────────────────────────────────────────────
function BookModal({ onClose, onSave, orgId, prefilledPatient }) {
  const [patient, setPatient] = useState(prefilledPatient || null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    hour: 9,
    duration: 30,
    type: "New Consultation",
    doctor: "",
    notes: "",
  });
  const [doctors, setDoctors] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("staff").select("id, first_name, last_name").eq("org_id", orgId).eq("role", "doctor").eq("is_active", true)
      .then(({ data }) => setDoctors(data || []));
  }, [orgId]);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await searchPatients(query, orgId);
      setResults(data || []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, orgId]);

  async function handleSave() {
    if (!patient) return;
    setSaving(true);
    const { data, error } = await supabase.from("appointments").insert({
      org_id: orgId,
      patient_id: patient.id || patient._db_id,
      patient_name: [patient.first_name, patient.last_name].filter(Boolean).join(" ") || patient.name,
      patient_phone: patient.phone,
      patient_email: patient.email,
      appointment_date: form.date,
      hour: form.hour,
      duration_minutes: form.duration,
      appointment_type: form.type,
      doctor_id: form.doctor || null,
      doctor_name: doctors.find(d => d.id === form.doctor) ? `Dr. ${doctors.find(d => d.id === form.doctor).last_name}` : null,
      notes: form.notes,
      status: "scheduled",
    }).select().single();
    setSaving(false);
    if (!error) onSave(data);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(13,17,23,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: T.white, borderRadius: T.radiusLg, width: "100%", maxWidth: 520,
        maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(13,17,23,0.2)",
        fontFamily: "'DM Sans',sans-serif",
      }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: T.ink }}>Book Appointment</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: T.inkSub }}>✕</button>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Patient search */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Patient *</div>
            {patient ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: T.sageLight, borderRadius: T.radiusSm, border: `1px solid ${T.sageBorder}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: T.ink }}>{[patient.first_name, patient.last_name].filter(Boolean).join(" ") || patient.name}</div>
                  <div style={{ fontSize: 11, color: T.inkSub }}>{patient.patient_number} · {patient.phone}</div>
                </div>
                <button onClick={() => setPatient(null)} style={{ background: "none", border: "none", color: T.sage, cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
            ) : (
              <div>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search patient by name or phone..."
                  style={{
                    width: "100%", padding: "10px 14px", border: `1px solid ${T.border}`,
                    borderRadius: T.radiusSm, fontSize: 13, outline: "none",
                    fontFamily: "'DM Sans',sans-serif", boxSizing: "border-box",
                  }}
                />
                {results.length > 0 && (
                  <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radiusSm, marginTop: 4, overflow: "hidden" }}>
                    {results.slice(0, 5).map(p => (
                      <button key={p.id} onClick={() => { setPatient(p); setQuery(""); setResults([]); }} style={{
                        width: "100%", padding: "8px 14px", border: "none", background: T.white,
                        cursor: "pointer", textAlign: "left", borderBottom: `1px solid ${T.border}`,
                        fontSize: 13,
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = T.paperDim}
                        onMouseLeave={e => e.currentTarget.style.background = T.white}
                      >
                        <div style={{ fontWeight: 600 }}>{[p.first_name, p.last_name].filter(Boolean).join(" ")}</div>
                        <div style={{ fontSize: 11, color: T.inkSub }}>{p.patient_number} · {p.phone}</div>
                      </button>
                    ))}
                  </div>
                )}
                {searching && <div style={{ fontSize: 12, color: T.inkSub, marginTop: 4 }}>Searching…</div>}
              </div>
            )}
          </div>

          {/* Date and time */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Date *</div>
              <input
                type="date"
                value={form.date}
                min={new Date().toISOString().slice(0, 10)}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                style={{ width: "100%", padding: "10px 14px", border: `1px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Time *</div>
              <select
                value={form.hour}
                onChange={e => setForm(f => ({ ...f, hour: Number(e.target.value) }))}
                style={{ width: "100%", padding: "10px 14px", border: `1px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13, outline: "none", background: T.white }}
              >
                {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </div>
          </div>

          {/* Duration and type */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Duration</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {DURATIONS.map(d => (
                  <button key={d} onClick={() => setForm(f => ({ ...f, duration: d }))} style={{
                    padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                    border: `1px solid ${form.duration === d ? T.sage : T.border}`,
                    background: form.duration === d ? T.sageLight : T.white,
                    color: form.duration === d ? T.sage : T.inkSub, cursor: "pointer",
                  }}>{d}m</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Type</div>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                style={{ width: "100%", padding: "10px 14px", border: `1px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 12, outline: "none", background: T.white }}
              >
                {APPOINTMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Doctor */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Assign Doctor (optional)</div>
            <select
              value={form.doctor}
              onChange={e => setForm(f => ({ ...f, doctor: e.target.value }))}
              style={{ width: "100%", padding: "10px 14px", border: `1px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13, outline: "none", background: T.white }}
            >
              <option value="">— Any available doctor —</option>
              {doctors.map(d => <option key={d.id} value={d.id}>Dr. {d.first_name} {d.last_name}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Notes (optional)</div>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Reason for appointment, special instructions..."
              rows={2}
              style={{ width: "100%", padding: "10px 14px", border: `1px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13, resize: "vertical", outline: "none", fontFamily: "'DM Sans',sans-serif", boxSizing: "border-box" }}
            />
          </div>
        </div>

        <div style={{ padding: "16px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 10 }}>
          <button
            onClick={handleSave}
            disabled={!patient || saving}
            style={{
              flex: 1, padding: "12px", background: patient ? T.sage : T.paperDim,
              color: patient ? "#fff" : T.inkSub, border: "none", borderRadius: T.radiusSm,
              fontSize: 14, fontWeight: 700, cursor: patient ? "pointer" : "default",
              fontFamily: "'Syne',sans-serif",
            }}
          >{saving ? "Booking…" : "✓ Book Appointment"}</button>
          <button onClick={onClose} style={{
            padding: "12px 20px", border: `1px solid ${T.border}`, background: T.white,
            color: T.inkSub, borderRadius: T.radiusSm, fontSize: 14, cursor: "pointer",
            fontFamily: "'DM Sans',sans-serif",
          }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Block Time Modal ─────────────────────────────────────────────────────────
function BlockModal({ onClose, onSave, orgId, staffId }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    startHour: 12,
    endHour: 13,
    reason: "Lunch break",
    recurring: false,
    recurringDay: "",
  });
  const [saving, setSaving] = useState(false);

  const BLOCK_REASONS = ["Lunch break", "Team meeting", "Training", "Vacation", "Personal", "Surgery/Procedure", "Off duty", "Other"];

  async function handleSave() {
    setSaving(true);
    const { data, error } = await supabase.from("blocked_times").insert({
      org_id: orgId,
      staff_id: staffId,
      block_date: form.recurring ? null : form.date,
      start_hour: form.startHour,
      end_hour: form.endHour,
      reason: form.reason,
      recurring: form.recurring,
      recurring_day: form.recurring ? form.recurringDay : null,
    }).select().single();
    setSaving(false);
    if (!error) onSave(data);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(13,17,23,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: T.white, borderRadius: T.radiusLg, width: "100%", maxWidth: 440,
        boxShadow: "0 24px 64px rgba(13,17,23,0.2)", fontFamily: "'DM Sans',sans-serif",
      }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: T.ink }}>Block Time</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: T.inkSub }}>✕</button>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Recurring toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setForm(f => ({ ...f, recurring: !f.recurring }))}
              style={{
                width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                background: form.recurring ? T.sage : T.borderMid, position: "relative", transition: "all 0.2s",
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: "50%", background: "#fff",
                position: "absolute", top: 3, left: form.recurring ? 21 : 3, transition: "left 0.2s",
              }} />
            </button>
            <span style={{ fontSize: 13, color: T.ink }}>Recurring block</span>
          </div>

          {form.recurring ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Repeat Every</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(day => (
                  <button key={day} onClick={() => setForm(f => ({ ...f, recurringDay: day }))} style={{
                    padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                    border: `1px solid ${form.recurringDay === day ? T.sage : T.border}`,
                    background: form.recurringDay === day ? T.sageLight : T.white,
                    color: form.recurringDay === day ? T.sage : T.inkSub, cursor: "pointer",
                  }}>{day.slice(0, 3)}</button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Date</div>
              <input
                type="date"
                value={form.date}
                min={new Date().toISOString().slice(0, 10)}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                style={{ width: "100%", padding: "10px 14px", border: `1px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13, outline: "none", boxSizing: "border-box" }}
              />
            </div>
          )}

          {/* Time range */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>From</div>
              <select value={form.startHour} onChange={e => setForm(f => ({ ...f, startHour: Number(e.target.value) }))} style={{ width: "100%", padding: "10px 14px", border: `1px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13, background: T.white }}>
                {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>To</div>
              <select value={form.endHour} onChange={e => setForm(f => ({ ...f, endHour: Number(e.target.value) }))} style={{ width: "100%", padding: "10px 14px", border: `1px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13, background: T.white }}>
                {HOURS.filter(h => h.value > form.startHour).map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </div>
          </div>

          {/* Reason */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Reason</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {BLOCK_REASONS.map(r => (
                <button key={r} onClick={() => setForm(f => ({ ...f, reason: r }))} style={{
                  padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${form.reason === r ? T.amber : T.border}`,
                  background: form.reason === r ? T.amberLight : T.white,
                  color: form.reason === r ? T.amber : T.inkSub, cursor: "pointer",
                }}>{r}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 10 }}>
          <button onClick={handleSave} disabled={saving} style={{
            flex: 1, padding: "12px", background: T.amber, color: "#fff", border: "none",
            borderRadius: T.radiusSm, fontSize: 14, fontWeight: 700, cursor: "pointer",
            fontFamily: "'Syne',sans-serif",
          }}>{saving ? "Blocking…" : "🚫 Block This Time"}</button>
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
export default function AleraAppointments({ prefilledPatient, openBook }) {
  const { role } = useRole?.() || { role: "receptionist" };
  const { orgId, staffId } = useAuth?.() || {};

  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [view, setView] = useState("day"); // "day" | "calendar"
  const [appointments, setAppointments] = useState([]);
  const [blockedTimes, setBlockedTimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBook, setShowBook] = useState(!!openBook);
  const [showBlock, setShowBlock] = useState(false);

  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  // Load appointments and blocked times
  const loadData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const [apptRes, blockRes] = await Promise.all([
      supabase.from("appointments").select("*").eq("org_id", orgId).eq("appointment_date", selectedDate).order("hour"),
      supabase.from("blocked_times").select("*").eq("org_id", orgId),
    ]);
    setAppointments(apptRes.data || []);
    setBlockedTimes(blockRes.data || []);
    setLoading(false);
  }, [orgId, selectedDate]);

  useEffect(() => { loadData(); }, [loadData]);

  // Get blocked hours for selected date
  const blockedHours = blockedTimes.filter(b => {
    if (b.recurring && b.recurring_day) {
      const dayName = new Date(selectedDate).toLocaleDateString("en-US", { weekday: "long" });
      return b.recurring_day === dayName;
    }
    return b.block_date === selectedDate;
  }).flatMap(b => Array.from({ length: b.end_hour - b.start_hour }, (_, i) => b.start_hour + i));

  async function handleCancel(appt) {
    await supabase.from("appointments").update({ status: "cancelled" }).eq("id", appt.id);
    loadData();
  }

  // Calendar helpers
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);
  const monthName = new Date(calYear, calMonth).toLocaleDateString("en-NG", { month: "long", year: "numeric" });

  return (
    <div style={{ minHeight: "100vh", background: T.paper, fontFamily: "'DM Sans',sans-serif", color: T.ink }}>

      {/* Header */}
      <div style={{
        background: T.white, borderBottom: `1px solid ${T.border}`,
        padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: T.ink }}>Appointments</div>
          <div style={{ fontSize: 12, color: T.inkSub }}>{fmtDate(selectedDate)}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 2, background: T.paperDim, borderRadius: T.radiusSm, padding: 3 }}>
            {["day", "calendar"].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: "5px 12px", borderRadius: 6, border: "none",
                background: view === v ? T.white : "transparent",
                color: view === v ? T.ink : T.inkSub, fontSize: 12, fontWeight: 600, cursor: "pointer",
                boxShadow: view === v ? T.shadow : "none",
              }}>{v === "day" ? "Day" : "Calendar"}</button>
            ))}
          </div>
          <button onClick={() => setShowBlock(true)} style={{
            padding: "8px 16px", borderRadius: T.radiusSm, border: `1px solid ${T.amber}`,
            background: T.amberLight, color: T.amber, fontSize: 13, fontWeight: 700, cursor: "pointer",
            fontFamily: "'Syne',sans-serif",
          }}>🚫 Block Time</button>
          <button onClick={() => setShowBook(true)} style={{
            padding: "8px 16px", borderRadius: T.radiusSm, border: "none",
            background: T.sage, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
            fontFamily: "'Syne',sans-serif", boxShadow: "0 4px 12px rgba(26,102,80,0.3)",
          }}>+ Book Appointment</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: view === "calendar" ? "1fr" : "280px 1fr", minHeight: "calc(100vh - 70px)" }}>

        {/* Left: Date nav (day view only) */}
        {view === "day" && (
          <div style={{ borderRight: `1px solid ${T.border}`, padding: "20px 16px", background: T.white }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <button onClick={() => { const d = new Date(calYear, calMonth - 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: T.inkSub }}>‹</button>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: T.ink }}>{monthName}</div>
              <button onClick={() => { const d = new Date(calYear, calMonth + 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: T.inkSub }}>›</button>
            </div>

            {/* Mini calendar */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 16 }}>
              {["S","M","T","W","T","F","S"].map((d, i) => (
                <div key={i} style={{ textAlign: "center", fontSize: 10, color: T.inkSub, fontWeight: 600, padding: "4px 0" }}>{d}</div>
              ))}
              {Array(firstDay).fill(null).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
                const isSelected = dateStr === selectedDate;
                const isToday = dateStr === today;
                return (
                  <button key={i} onClick={() => setSelectedDate(dateStr)} style={{
                    padding: "6px 2px", border: "none", borderRadius: 6, cursor: "pointer",
                    background: isSelected ? T.sage : isToday ? T.sageLight : "transparent",
                    color: isSelected ? "#fff" : isToday ? T.sage : T.ink,
                    fontSize: 12, fontWeight: isSelected || isToday ? 700 : 400,
                    transition: "all 0.1s",
                  }}>{i + 1}</button>
                );
              })}
            </div>

            {/* Quick nav */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Quick Select</div>
              {[
                { label: "Today", date: today },
                { label: "Tomorrow", date: new Date(Date.now() + 86400000).toISOString().slice(0, 10) },
                { label: "This Weekend", date: (() => { const d = new Date(); d.setDate(d.getDate() + (6 - d.getDay())); return d.toISOString().slice(0, 10); })() },
              ].map(({ label, date }) => (
                <button key={label} onClick={() => setSelectedDate(date)} style={{
                  padding: "7px 12px", borderRadius: T.radiusSm, border: `1px solid ${selectedDate === date ? T.sage : T.border}`,
                  background: selectedDate === date ? T.sageLight : T.white,
                  color: selectedDate === date ? T.sage : T.inkSub,
                  fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}>{label}</button>
              ))}
            </div>

            {/* Blocked times today */}
            {blockedHours.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.amber, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>🚫 Blocked Today</div>
                {blockedTimes.filter(b => {
                  if (b.recurring && b.recurring_day) {
                    const dayName = new Date(selectedDate).toLocaleDateString("en-US", { weekday: "long" });
                    return b.recurring_day === dayName;
                  }
                  return b.block_date === selectedDate;
                }).map((b, i) => (
                  <div key={i} style={{ fontSize: 11, color: T.inkSub, marginBottom: 3 }}>
                    {fmtTime(b.start_hour)} – {fmtTime(b.end_hour)}: {b.reason}
                    {b.recurring && <span style={{ color: T.amber, marginLeft: 4 }}>↻</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Right: Schedule */}
        <div style={{ padding: "20px 24px", overflowY: "auto" }}>
          {view === "day" ? (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: T.ink }}>
                  {fmtDate(selectedDate)}
                </div>
                <div style={{ fontSize: 13, color: T.inkSub }}>
                  {appointments.filter(a => a.status !== "cancelled").length} appointment{appointments.filter(a => a.status !== "cancelled").length !== 1 ? "s" : ""}
                </div>
              </div>

              {loading ? (
                <div style={{ textAlign: "center", padding: 40, color: T.inkSub }}>Loading…</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {HOURS.map(h => {
                    const hourAppts = appointments.filter(a => a.hour === h.value);
                    const isBlocked = blockedHours.includes(h.value);
                    return (
                      <div key={h.value} style={{ display: "flex", gap: 12, minHeight: 52, borderBottom: `1px solid ${T.border}` }}>
                        <div style={{
                          width: 60, flexShrink: 0, padding: "12px 0",
                          fontSize: 11, color: T.inkSub, fontFamily: "'JetBrains Mono',monospace",
                          textAlign: "right", paddingRight: 12,
                        }}>{h.label}</div>
                        <div style={{ flex: 1, padding: "8px 0", position: "relative" }}>
                          {isBlocked && (
                            <div style={{
                              padding: "6px 12px", background: T.amberLight,
                              border: `1px dashed ${T.amber}`, borderRadius: 6,
                              fontSize: 11, color: T.amber, marginBottom: 4,
                            }}>
                              🚫 {blockedTimes.find(b => {
                                const matches = b.recurring
                                  ? b.recurring_day === new Date(selectedDate).toLocaleDateString("en-US", { weekday: "long" })
                                  : b.block_date === selectedDate;
                                return matches && h.value >= b.start_hour && h.value < b.end_hour;
                              })?.reason || "Blocked"}
                            </div>
                          )}
                          {hourAppts.map(appt => (
                            <AppointmentCard key={appt.id} appt={appt} onCancel={handleCancel} />
                          ))}
                          {!isBlocked && hourAppts.length === 0 && (
                            <button
                              onClick={() => { setShowBook(true); }}
                              style={{
                                width: "100%", padding: "6px 12px", border: "none",
                                background: "transparent", color: "transparent", cursor: "pointer",
                                fontSize: 11, textAlign: "left", borderRadius: 4,
                                transition: "all 0.1s",
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = T.sageLight; e.currentTarget.style.color = T.sage; e.currentTarget.textContent = "+ Book appointment"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "transparent"; e.currentTarget.textContent = ""; }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* Calendar view */
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <button onClick={() => { const d = new Date(calYear, calMonth - 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }} style={{ padding: "6px 14px", border: `1px solid ${T.border}`, background: T.white, borderRadius: T.radiusSm, cursor: "pointer", fontSize: 16 }}>‹</button>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: T.ink, flex: 1, textAlign: "center" }}>{monthName}</div>
                <button onClick={() => { const d = new Date(calYear, calMonth + 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }} style={{ padding: "6px 14px", border: `1px solid ${T.border}`, background: T.white, borderRadius: T.radiusSm, cursor: "pointer", fontSize: 16 }}>›</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
                  <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: T.inkSub, padding: "8px 0" }}>{d}</div>
                ))}
                {Array(firstDay).fill(null).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
                  const isSelected = dateStr === selectedDate;
                  const isToday = dateStr === today;
                  return (
                    <button key={i} onClick={() => { setSelectedDate(dateStr); setView("day"); }} style={{
                      padding: "10px 6px", border: `1px solid ${isSelected ? T.sage : T.border}`,
                      borderRadius: T.radiusSm, cursor: "pointer", textAlign: "center",
                      background: isSelected ? T.sageLight : isToday ? T.paperDim : T.white,
                      transition: "all 0.1s",
                    }}>
                      <div style={{ fontSize: 14, fontWeight: isToday ? 800 : 400, color: isSelected ? T.sage : T.ink }}>{i + 1}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showBook && (
        <BookModal
          orgId={orgId}
          prefilledPatient={prefilledPatient}
          onClose={() => setShowBook(false)}
          onSave={() => { setShowBook(false); loadData(); }}
        />
      )}
      {showBlock && (
        <BlockModal
          orgId={orgId}
          staffId={staffId}
          onClose={() => setShowBlock(false)}
          onSave={() => { setShowBlock(false); loadData(); }}
        />
      )}
    </div>
  );
}
