import { useState, useCallback } from "react";
import { useAuth } from "./AleraAuth.jsx";
import { searchPatients } from "./supabase.js";

const T = {
  ink: "#0D1117", inkSub: "#6E7891", inkMid: "#3D4558",
  paper: "#F7F5F1", paperDim: "#EFECE7", white: "#FFFFFF",
  sage: "#1A6650", sageLight: "#E6F3EE", sageBorder: "rgba(26,102,80,0.2)",
  border: "#E8E4DE", borderMid: "#D4D0CA",
  amber: "#C97A10", amberLight: "#FEF5E7",
  shadow: "0 1px 3px rgba(13,17,23,0.06), 0 4px 16px rgba(13,17,23,0.04)",
  radius: 12, radiusSm: 8,
};

function age(dob) {
  if (!dob) return "—";
  return Math.floor((Date.now() - new Date(dob)) / 31557600000) + "y";
}

/**
 * AleraPatientLookup
 * Shown when a clinical screen is opened with no active patient.
 * Lets the user search for a patient and select them to load their chart.
 *
 * Props:
 *   screenName  — e.g. "Billing", "Notes", "Prescription"
 *   onSelect    — called with patient data when user picks a patient
 *   screenIcon  — emoji icon for the screen
 */
export default function AleraPatientLookup({ screenName = "Chart", screenIcon = "📋", onSelect }) {
  const auth = useAuth?.() || {};
  const orgId = auth.orgId ?? null;
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async (q) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); setSearched(false); return; }
    setLoading(true);
    try {
      const { data } = await searchPatients(q, orgId);
      setResults(data || []);
    } catch(e) {
      console.error("[AleraPatientLookup] search error:", e);
      setResults([]);
    }
    setSearched(true);
    setLoading(false);
  }, [orgId]);

  const handleSelect = (p) => {
    // Build a patient object compatible with what AleraApp expects
    onSelect?.({
      _db_id:        p.id,
      patientNumber: p.patient_number,
      name:          [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" "),
      firstName:     p.first_name,
      lastName:      p.last_name,
      age:           age(p.date_of_birth),
      sex:           p.biological_sex,
      phone:         p.phone,
      blood_group:   p.blood_group,
      insurance:     p.insurance_provider,
      insuranceId:   p.nhis_number,
      allergies:     p.patient_allergies?.map(a => a.allergen).join(", ") || "None",
      totalVisits:   p.total_visits,
      lastVisit:     p.last_visit_at,
    });
  };

  return (
    <div style={{
      minHeight: "100vh", background: T.paper,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans',sans-serif", padding: 24,
    }}>
      <div style={{ width: "100%", maxWidth: 560 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{screenIcon}</div>
          <div style={{
            fontFamily: "'Syne',sans-serif", fontWeight: 800,
            fontSize: 24, color: T.ink, marginBottom: 8,
          }}>
            {screenName}
          </div>
          <div style={{ fontSize: 14, color: T.inkSub }}>
            No active patient. Search to load a patient chart.
          </div>
        </div>

        {/* Search box */}
        <div style={{
          background: T.white, borderRadius: T.radius,
          border: `1px solid ${T.border}`, boxShadow: T.shadow,
          overflow: "hidden",
        }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ position: "relative" }}>
              <span style={{
                position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                fontSize: 16, color: T.inkSub, pointerEvents: "none",
              }}>🔍</span>
              <input
                autoFocus
                type="text"
                value={query}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Search by name, phone, or patient number..."
                style={{
                  width: "100%", padding: "10px 12px 10px 40px",
                  border: `1.5px solid ${T.border}`, borderRadius: T.radiusSm,
                  fontSize: 14, color: T.ink, outline: "none",
                  fontFamily: "'DM Sans',sans-serif", boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
                onFocus={e => e.target.style.borderColor = T.sage}
                onBlur={e => e.target.style.borderColor = T.border}
              />
            </div>
          </div>

          {/* Results */}
          <div>
            {loading && (
              <div style={{ padding: "20px", textAlign: "center", color: T.inkSub, fontSize: 13 }}>
                Searching…
              </div>
            )}

            {!loading && searched && results.length === 0 && (
              <div style={{ padding: "20px", textAlign: "center", color: T.inkSub, fontSize: 13 }}>
                No patients found for "{query}"
              </div>
            )}

            {!loading && results.map((p, i) => (
              <button
                key={p.id}
                onClick={() => handleSelect(p)}
                style={{
                  width: "100%", padding: "14px 20px",
                  borderBottom: i < results.length - 1 ? `1px solid ${T.border}` : "none",
                  border: "none", background: "transparent",
                  cursor: "pointer", textAlign: "left",
                  transition: "background 0.1s",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                }}
                onMouseEnter={e => e.currentTarget.style.background = T.paperDim}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div>
                  <div style={{
                    fontFamily: "'Syne',sans-serif", fontWeight: 700,
                    fontSize: 14, color: T.ink, marginBottom: 3,
                  }}>
                    {[p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" ")}
                  </div>
                  <div style={{ fontSize: 12, color: T.inkSub, display: "flex", gap: 12 }}>
                    <span>{p.patient_number}</span>
                    {p.date_of_birth && <span>{age(p.date_of_birth)}</span>}
                    {p.biological_sex && <span>{p.biological_sex}</span>}
                    {p.phone && <span>{p.phone}</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {p.total_visits > 0 && (
                    <div style={{
                      fontSize: 11, color: T.sage, fontWeight: 600,
                      background: T.sageLight, padding: "2px 8px",
                      borderRadius: 10, marginBottom: 3,
                    }}>
                      {p.total_visits} visit{p.total_visits !== 1 ? "s" : ""}
                    </div>
                  )}
                  {p.last_visit_at && (
                    <div style={{ fontSize: 11, color: T.inkSub }}>
                      Last: {new Date(p.last_visit_at).toLocaleDateString("en-NG")}
                    </div>
                  )}
                </div>
              </button>
            ))}

            {!loading && !searched && (
              <div style={{ padding: "20px", textAlign: "center", color: T.inkSub, fontSize: 13 }}>
                Start typing to search patients
              </div>
            )}
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: T.inkSub }}>
          Or go to the <strong>Queue</strong> and click "See Patient" to load a patient directly
        </div>
      </div>
    </div>
  );
}
