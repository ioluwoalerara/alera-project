import { useState, useCallback } from "react";
import { useAuth } from "./AleraAuth.jsx";
import { searchPatientsGlobal, requestPatientConsent, grantConsentVerbally, checkConsent, getCrossOrgChart, logPatientAccess, setPatientPCP } from "./supabase.js";
import { supabase } from "./supabase.js";

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

function age(dob) {
  if (!dob) return "—";
  return Math.floor((Date.now() - new Date(dob)) / 31557600000) + "y";
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Cross-Org Chart Viewer ───────────────────────────────────────────────────
function CrossOrgChart({ patient, onClose }) {
  const [activeOrg, setActiveOrg] = useState(0);

  const name = [patient.first_name, patient.last_name].filter(Boolean).join(" ");
  const allergies = patient.patient_allergies || [];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(13,17,23,0.7)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: T.white, borderRadius: T.radiusLg, width: "100%", maxWidth: 720,
        maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(13,17,23,0.3)", fontFamily: "'DM Sans',sans-serif",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${T.border}`, background: T.white }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: T.ink }}>{name}</div>
              <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, padding: "2px 8px", background: T.sageLight, color: T.sage, borderRadius: 10, fontWeight: 700 }}>
                  🌐 {patient.global_patient_id}
                </span>
                {patient.blood_group && <span style={{ fontSize: 11, padding: "2px 8px", background: T.roseLight, color: T.rose, borderRadius: 10, fontWeight: 700 }}>🩸 {patient.blood_group}</span>}
                {allergies.length > 0 && <span style={{ fontSize: 11, padding: "2px 8px", background: T.amberLight, color: T.amber, borderRadius: 10, fontWeight: 700 }}>⚠ {allergies.map(a => a.allergen).join(", ")}</span>}
                {patient.pcp_name && <span style={{ fontSize: 11, padding: "2px 8px", background: T.blueLight, color: T.blue, borderRadius: 10, fontWeight: 700 }}>👨‍⚕️ PCP: {patient.pcp_name}</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: T.inkSub }}>✕</button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
            Visit History — Read Only
          </div>
          {(patient.encounters || []).length === 0 ? (
            <div style={{ textAlign: "center", padding: 30, color: T.inkSub }}>No visits recorded</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(patient.encounters || []).map((enc, i) => (
                <div key={enc.id} style={{
                  background: T.paperDim, borderRadius: T.radiusSm,
                  border: `1px solid ${T.border}`, padding: "14px 16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: T.ink }}>
                      {fmtDate(enc.registered_at)}
                    </span>
                    {i === 0 && <span style={{ fontSize: 10, padding: "2px 7px", background: T.sageLight, color: T.sage, borderRadius: 10, fontWeight: 700 }}>Most Recent</span>}
                    {enc.assigned_doctor && (
                      <span style={{ fontSize: 11, color: T.inkSub }}>
                        👨‍⚕️ Dr. {enc.assigned_doctor.last_name}
                      </span>
                    )}
                  </div>
                  {enc.chief_complaint && <div style={{ fontSize: 13, color: T.inkMid, marginBottom: 6 }}>📋 {enc.chief_complaint}</div>}
                  {enc.diagnoses?.length > 0 && (
                    <div style={{ fontSize: 13, color: T.ink, marginBottom: 6 }}>
                      🔍 {enc.diagnoses.map(d => d.name).join(", ")}
                    </div>
                  )}
                  {enc.vitals?.[0] && (
                    <div style={{ fontSize: 12, color: T.inkSub, marginBottom: 6 }}>
                      BP: {enc.vitals[0].bp_systolic}/{enc.vitals[0].bp_diastolic} · Temp: {enc.vitals[0].temperature}°C · Pulse: {enc.vitals[0].pulse_rate}bpm
                    </div>
                  )}
                  {enc.clinical_notes?.[0] && (
                    <div style={{ fontSize: 12, color: T.inkSub, fontStyle: "italic" }}>
                      A: {enc.clinical_notes[0].assessment}
                    </div>
                  )}
                  {enc.prescriptions?.length > 0 && (
                    <div style={{ fontSize: 12, color: T.purple, marginTop: 4 }}>
                      💊 {enc.prescriptions.map(p => p.drug_name).join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AleraPatientConsent({ onSelectPatient }) {
  const { orgId, staffId } = useAuth?.() || {};

  const [query, setQuery]           = useState("");
  const [results, setResults]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [searched, setSearched]     = useState(false);
  const [selected, setSelected]     = useState(null);
  const [consentStatus, setConsentStatus] = useState(null); // null | 'checking' | 'has_consent' | 'no_consent' | 'pending'
  const [consentId, setConsentId]   = useState(null);
  const [chartData, setChartData]   = useState(null);
  const [showChart, setShowChart]   = useState(false);
  const [pcpMode, setPcpMode]       = useState(false);
  const [doctors, setDoctors]       = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState("");

  const handleSearch = useCallback(async (q) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); setSearched(false); return; }
    setLoading(true);
    const { data } = await searchPatientsGlobal(q);
    setResults(data || []);
    setSearched(true);
    setLoading(false);
  }, []);

  async function handleSelect(patient) {
    setSelected(patient);
    setConsentStatus("checking");

    // Check if same org
    if (patient.org_id === orgId) {
      setConsentStatus("same_org");
      return;
    }

    // Check existing consent
    const { hasConsent, consent } = await checkConsent(patient.global_patient_id, orgId);
    if (hasConsent) {
      setConsentStatus("has_consent");
      // Load full chart
      const { data } = await getCrossOrgChart(patient.global_patient_id);
      setChartData(data?.[0] || patient);
      await logPatientAccess(patient.global_patient_id, orgId, staffId, "view");
    } else {
      setConsentStatus("no_consent");
    }
  }

  async function handleRequestConsent() {
    if (!selected) return;
    const { data } = await requestPatientConsent(
      selected.global_patient_id, orgId, selected.org_id, staffId
    );
    if (data) {
      setConsentId(data.id);
      setConsentStatus("pending");
    }
  }

  async function handleGrantConsent() {
    if (!consentId) return;
    await grantConsentVerbally(consentId, staffId);
    setConsentStatus("has_consent");
    const { data } = await getCrossOrgChart(selected.global_patient_id);
    setChartData(data?.[0] || selected);
    await logPatientAccess(selected.global_patient_id, orgId, staffId, "view");
  }

  async function handleLoadDoctors() {
    const { data } = await supabase.from("staff").select("id, first_name, last_name").eq("org_id", orgId).eq("role", "doctor").eq("is_active", true);
    setDoctors(data || []);
    setPcpMode(true);
  }

  async function handleSetPCP() {
    if (!selectedDoctor || !selected) return;
    const doc = doctors.find(d => d.id === selectedDoctor);
    await setPatientPCP(selected.global_patient_id, selectedDoctor, `Dr. ${doc.first_name} ${doc.last_name}`);
    setPcpMode(false);
    alert(`PCP set to Dr. ${doc.first_name} ${doc.last_name}`);
  }

  const name = selected ? [selected.first_name, selected.last_name].filter(Boolean).join(" ") : "";

  return (
    <div style={{ minHeight: "100vh", background: T.paper, fontFamily: "'DM Sans',sans-serif", color: T.ink }}>

      {/* Header */}
      <div style={{
        background: T.white, borderBottom: `1px solid ${T.border}`,
        padding: "16px 28px", position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: T.ink }}>
          Patient Record Access
        </div>
        <div style={{ fontSize: 12, color: T.inkSub, marginTop: 2 }}>
          Search for patients across all Alera clinics
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 28px" }}>

        {/* Search */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: T.inkSub }}>🔍</span>
            <input
              autoFocus
              value={query}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search by name, phone number, or APID (e.g. APID-7X9K2M)..."
              style={{
                width: "100%", padding: "12px 14px 12px 44px",
                border: `1.5px solid ${T.border}`, borderRadius: T.radius,
                fontSize: 14, outline: "none", fontFamily: "'DM Sans',sans-serif",
                boxSizing: "border-box", transition: "border-color 0.15s",
              }}
              onFocus={e => e.target.style.borderColor = T.sage}
              onBlur={e => e.target.style.borderColor = T.border}
            />
          </div>
          <div style={{ fontSize: 11, color: T.inkSub, marginTop: 6 }}>
            Only patients with an Alera Patient ID (APID) will appear in cross-clinic search
          </div>
        </div>

        {/* Search Results */}
        {loading && <div style={{ textAlign: "center", color: T.inkSub, padding: 20 }}>Searching…</div>}

        {!loading && searched && results.length === 0 && (
          <div style={{ textAlign: "center", color: T.inkSub, padding: 20 }}>
            No patients found for "{query}"
          </div>
        )}

        {!loading && results.length > 0 && !selected && (
          <div style={{ background: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: 20 }}>
            {results.map((p, i) => {
              const isOwnClinic = p.org_id === orgId;
              return (
                <button key={p.id} onClick={() => handleSelect(p)} style={{
                  width: "100%", padding: "14px 18px", border: "none", background: "transparent",
                  cursor: "pointer", textAlign: "left", borderBottom: i < results.length - 1 ? `1px solid ${T.border}` : "none",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  transition: "background 0.1s",
                }}
                  onMouseEnter={e => e.currentTarget.style.background = T.paperDim}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 3 }}>
                      {[p.first_name, p.last_name].filter(Boolean).join(" ")}
                    </div>
                    <div style={{ fontSize: 12, color: T.inkSub, display: "flex", gap: 10 }}>
                      <span>{p.patient_number}</span>
                      {p.date_of_birth && <span>{age(p.date_of_birth)}</span>}
                      {p.biological_sex && <span>{p.biological_sex}</span>}
                      {p.phone && <span>{p.phone}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", flex_direction: "column", alignItems: "flex-end", gap: 4 }}>
                    {p.global_patient_id && (
                      <div style={{ fontSize: 10, padding: "2px 8px", background: T.sageLight, color: T.sage, borderRadius: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>
                        {p.global_patient_id}
                      </div>
                    )}
                    {isOwnClinic && (
                      <div style={{ fontSize: 10, color: T.blue, fontWeight: 600 }}>Your clinic</div>
                    )}
                    {!isOwnClinic && (
                      <div style={{ fontSize: 10, color: T.inkSub }}>External clinic</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Selected patient — consent flow */}
        {selected && (
          <div>
            {/* Back button */}
            <button onClick={() => { setSelected(null); setConsentStatus(null); setChartData(null); }} style={{
              background: "none", border: "none", color: T.sage, cursor: "pointer",
              fontSize: 13, fontWeight: 600, marginBottom: 16, padding: 0,
              display: "flex", alignItems: "center", gap: 4,
            }}>← Back to results</button>

            {/* Patient card */}
            <div style={{
              background: T.white, borderRadius: T.radius, padding: "18px 20px",
              border: `1px solid ${T.border}`, marginBottom: 16,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%", background: T.sage,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: "#fff",
                }}>
                  {name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: T.ink }}>{name}</div>
                  <div style={{ fontSize: 12, color: T.inkSub, display: "flex", gap: 10, marginTop: 3 }}>
                    {selected.date_of_birth && <span>{age(selected.date_of_birth)}</span>}
                    {selected.biological_sex && <span>{selected.biological_sex}</span>}
                    {selected.phone && <span>{selected.phone}</span>}
                    {selected.global_patient_id && (
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", color: T.sage, fontWeight: 600 }}>
                        {selected.global_patient_id}
                      </span>
                    )}
                  </div>
                  {/* Emergency info always visible */}
                  {selected.blood_group && (
                    <div style={{ fontSize: 11, color: T.rose, marginTop: 4, fontWeight: 600 }}>
                      🩸 {selected.blood_group}
                      {selected.patient_allergies?.length > 0 && ` · ⚠ Allergies: ${selected.patient_allergies.map(a => a.allergen).join(", ")}`}
                    </div>
                  )}
                  {selected.pcp_name && (
                    <div style={{ fontSize: 11, color: T.blue, marginTop: 2, fontWeight: 600 }}>
                      👨‍⚕️ PCP: {selected.pcp_name}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Consent states */}
            {consentStatus === "checking" && (
              <div style={{ textAlign: "center", padding: 20, color: T.inkSub }}>Checking access permissions…</div>
            )}

            {consentStatus === "same_org" && (
              <div style={{
                padding: "16px 20px", background: T.sageLight,
                border: `1px solid ${T.sageBorder}`, borderRadius: T.radius,
              }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: T.sage, marginBottom: 8 }}>
                  ✅ This patient is registered at your clinic
                </div>
                <div style={{ fontSize: 13, color: T.inkMid, marginBottom: 12 }}>
                  You have full access to their records. No consent required.
                </div>
                {onSelectPatient && (
                  <button onClick={() => onSelectPatient(selected)} style={{
                    padding: "10px 20px", background: T.sage, color: "#fff", border: "none",
                    borderRadius: T.radiusSm, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    fontFamily: "'Syne',sans-serif",
                  }}>Open Patient Record →</button>
                )}
              </div>
            )}

            {consentStatus === "no_consent" && (
              <div style={{
                padding: "20px", background: T.amberLight,
                border: `1px solid ${T.amber}33`, borderRadius: T.radius,
              }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: T.amber, marginBottom: 8 }}>
                  🔒 Access Required
                </div>
                <div style={{ fontSize: 13, color: T.inkMid, marginBottom: 16, lineHeight: 1.6 }}>
                  This patient is registered at another Alera clinic. You need their consent to view their full medical history.
                  <br /><br />
                  <strong>Emergency information above is always visible</strong> — allergies and blood group.
                </div>
                <button onClick={handleRequestConsent} style={{
                  padding: "10px 20px", background: T.amber, color: "#fff", border: "none",
                  borderRadius: T.radiusSm, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'Syne',sans-serif",
                }}>Request Patient Consent</button>
              </div>
            )}

            {consentStatus === "pending" && (
              <div style={{
                padding: "20px", background: T.blueLight,
                border: `1px solid ${T.blue}33`, borderRadius: T.radius,
              }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: T.blue, marginBottom: 8 }}>
                  📋 Consent Required
                </div>
                <div style={{ fontSize: 13, color: T.inkMid, marginBottom: 16, lineHeight: 1.6 }}>
                  Please read the following to the patient:
                  <br /><br />
                  <em style={{ background: T.white, display: "block", padding: "10px 14px", borderRadius: 8, border: `1px solid ${T.border}`, color: T.ink }}>
                    "{name}, we would like to access your medical records from your previous clinic to provide you with better care today. Do you consent to sharing your records with us?"
                  </em>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={handleGrantConsent} style={{
                    padding: "10px 20px", background: T.sage, color: "#fff", border: "none",
                    borderRadius: T.radiusSm, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    fontFamily: "'Syne',sans-serif",
                  }}>✅ Patient Consented — View Records</button>
                  <button onClick={() => setConsentStatus("no_consent")} style={{
                    padding: "10px 20px", background: T.white, color: T.inkSub,
                    border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                    fontSize: 13, cursor: "pointer",
                  }}>Patient Declined</button>
                </div>
              </div>
            )}

            {consentStatus === "has_consent" && chartData && (
              <div>
                <div style={{
                  padding: "12px 16px", background: T.sageLight,
                  border: `1px solid ${T.sageBorder}`, borderRadius: T.radiusSm, marginBottom: 16,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontSize: 13, color: T.sage, fontWeight: 600 }}>
                    ✅ Consent granted — viewing read-only records
                  </span>
                  <span style={{ fontSize: 11, color: T.inkSub }}>Access logged</span>
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                  <button onClick={() => setShowChart(true)} style={{
                    padding: "10px 20px", background: T.sage, color: "#fff", border: "none",
                    borderRadius: T.radiusSm, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    fontFamily: "'Syne',sans-serif",
                  }}>📋 View Full History</button>

                  {onSelectPatient && (
                    <button onClick={() => onSelectPatient(selected)} style={{
                      padding: "10px 20px", background: T.blueLight, color: T.blue,
                      border: `1px solid ${T.blue}33`, borderRadius: T.radiusSm,
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                      fontFamily: "'Syne',sans-serif",
                    }}>➕ Register New Visit</button>
                  )}

                  <button onClick={handleLoadDoctors} style={{
                    padding: "10px 20px", background: T.white, color: T.inkMid,
                    border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}>👨‍⚕️ Set PCP</button>
                </div>

                {/* PCP setter */}
                {pcpMode && (
                  <div style={{
                    padding: "16px", background: T.blueLight,
                    border: `1px solid ${T.blue}22`, borderRadius: T.radiusSm, marginBottom: 16,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.blue, marginBottom: 10 }}>
                      Designate Primary Care Physician
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <select value={selectedDoctor} onChange={e => setSelectedDoctor(e.target.value)} style={{
                        flex: 1, padding: "8px 12px", border: `1px solid ${T.border}`,
                        borderRadius: T.radiusSm, fontSize: 13, background: T.white,
                      }}>
                        <option value="">— Select doctor —</option>
                        {doctors.map(d => (
                          <option key={d.id} value={d.id}>Dr. {d.first_name} {d.last_name}</option>
                        ))}
                      </select>
                      <button onClick={handleSetPCP} disabled={!selectedDoctor} style={{
                        padding: "8px 16px", background: selectedDoctor ? T.blue : T.paperDim,
                        color: selectedDoctor ? "#fff" : T.inkSub, border: "none",
                        borderRadius: T.radiusSm, fontSize: 13, fontWeight: 700,
                        cursor: selectedDoctor ? "pointer" : "default",
                      }}>Set PCP</button>
                      <button onClick={() => setPcpMode(false)} style={{
                        padding: "8px 14px", background: T.white, border: `1px solid ${T.border}`,
                        borderRadius: T.radiusSm, fontSize: 13, cursor: "pointer",
                      }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!selected && !searched && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: T.inkSub }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🌐</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: T.ink, marginBottom: 8 }}>
              Alera Patient Network
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 400, margin: "0 auto" }}>
              Search for any patient registered at an Alera clinic. With patient consent, you can view their full medical history across all clinics.
            </div>
          </div>
        )}
      </div>

      {/* Cross-org chart modal */}
      {showChart && chartData && (
        <CrossOrgChart patient={chartData} onClose={() => setShowChart(false)} />
      )}
    </div>
  );
}
