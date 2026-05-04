/**
 * AleraApp.jsx — Root application entry point
 *
 * Wires together:
 *   AleraShell               → nav chrome + AI Guide + RoleContext
 *   AleraLogin               → role picker
 *   AleraPatientRegistration → registration screen
 *   AleraEncounter           → vitals + check-in screen
 *   AleraClinicalNoteEditor  → SOAP notes screen
 *   AleraPrescriptionScreen  → Rx screen
 *   AleraBillingDashboard    → billing + cash drawer
 *   AleraVisitExit           → end-of-visit summary
 *
 * Patient state flows top-down:
 *   registration  onComplete(form)
 *     → encounter onComplete({ patient, vitals, assignedDoctor, … })
 *       → notes   onComplete({ soap, diagnosis })
 *         → prescription onComplete({ rxList })
 *           → billing     onComplete()
 *             → exit
 */

import { useState, useCallback } from "react";
import AleraShell                from "./AleraShell.jsx";
import AleraLogin                from "./AleraLogin.jsx";
import AleraPatientRegistration  from "./AleraPatientRegistration.jsx";
import AleraEncounter            from "./AleraEncounter.jsx";
import AleraClinicalNoteEditor   from "./AleraClinicalNoteEditor.jsx";
import AleraPrescriptionScreen   from "./AleraPrescriptionScreen.jsx";
import AleraBillingDashboard     from "./AleraBillingDashboard.jsx";
import AleraVisitExit            from "./AleraVisitExit.jsx";
import AleraQueue               from "./AleraQueue.jsx";
import AleraAdmin               from "./AleraAdmin.jsx";
import AleraNHIS                from "./AleraNHIS.jsx";
import AleraDispensing          from "./AleraDispensing.jsx";
import AleraDispensingScreen    from "./AleraDispensingScreen.jsx";
import { SCREEN_ACCESS }         from "./AleraRoles.js";
import { useAuth }               from "./AleraAuth.jsx";
import { upsertPatient, createEncounter, saveVitals, saveNote, saveDiagnoses, savePrescription, createBill, recordPayment, updateEncounterStatus } from "./supabase.js";

// ─── Demo patient seed ────────────────────────────────────────────────────────
// Used before a real patient is registered; downstream screens fill in the gaps.
const BLANK_PATIENT = {
  _db_id:         null,
  patientNumber:  null,
  name:           null,
  firstName:      null,
  lastName:       null,
  age:            null,
  sex:            null,
  phone:          null,
  insurance:      null,
  insuranceId:    null,
  visitReason:    null,
  allergies:      [],
  blood:          null,
  visits:         0,
  vitals:         null,
  assignedDoctor: null,
  diagnosis:      null,
  soap:           null,
  rxList:         [],
};

export default function AleraApp() {
  // ── Auth (real Supabase session) ──────────────────────────────────────────
  const { isAuthenticated, loading: authLoading, signOut, orgId, staffId } = useAuth();
  const [role,         setRole]         = useState(null);
  const [activeScreen, setActiveScreen] = useState(null);

  // ── DB record IDs — populated as each screen persists to Supabase ─────────
  const [encounterId, setEncounterId] = useState(null);
  const [noteId,      setNoteId]      = useState(null);
  const [billId,      setBillId]      = useState(null);

  // ── Shared encounter state — built up as each screen completes ────────────
  const [patient, setPatient] = useState(BLANK_PATIENT);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function mergePatient(updates) {
    setPatient(prev => ({ ...prev, ...updates }));
  }

  function advanceScreen(currentRole, currentScreen) {
    const screens = SCREEN_ACCESS[currentRole] || [];
    const idx     = screens.indexOf(currentScreen);
    if (idx !== -1 && idx < screens.length - 1) {
      setActiveScreen(screens[idx + 1]);
    } else {
      setActiveScreen("exit");
    }
  }

  // ── Login / logout ────────────────────────────────────────────────────────
  function handleLogin(selectedRole, session) {
    setRole(selectedRole);
    setActiveScreen(SCREEN_ACCESS[selectedRole]?.[0] || "queue");
    setPatient(BLANK_PATIENT);
    setEncounterId(null);
    setNoteId(null);
    setBillId(null);
  }

  async function handleSeePatient(patientData) {
    setPatient(patientData);
    const eid = patientData._encounter_id || null;
    setEncounterId(eid);
    // Mark encounter as in-progress and route to correct screen
    if (role === "nurse") {
      if (eid) await updateEncounterStatus(eid, "in_triage");
      setActiveScreen("encounter");
    } else if (role === "doctor") {
      if (eid) await updateEncounterStatus(eid, "with_doctor");
      setActiveScreen("encounter");
    } else if (role === "pharmacist") {
      setActiveScreen("prescription");
    } else if (role === "cashier") {
      setActiveScreen("billing");
    } else if (role === "receptionist") {
      setActiveScreen("queue"); // receptionist just views completed visits
    } else {
      setActiveScreen("encounter");
    }
  }

  async function handleLogout() {
    await signOut();
    setRole(null);
    setActiveScreen(null);
    setPatient(BLANK_PATIENT);
    setEncounterId(null);
    setNoteId(null);
    setBillId(null);
  }

  // ── Per-screen completion handlers — each saves to Supabase then advances ──

  async function handleRegistrationComplete(form) {
    if (!orgId) return;

    const { data: saved, error: patientErr } = await upsertPatient(form, orgId, staffId);

    if (patientErr || !saved?.id) {
      console.error("[Alera] Patient save failed:", patientErr?.message);
      alert(`Registration failed: ${patientErr?.message || "Unknown error"}\n\nPlease check the form and try again.`);
      return; // stay on registration screen
    }

    // Only create encounter if patient has a real DB UUID (not a local_ id)
    if (!saved.id.startsWith("local_")) {
      await createEncounter(
        saved.id, orgId, staffId,
        { chief_complaint: form.visitReason, encounter_type: "outpatient" }
      );
    }

    // Reset and go to queue — encounter starts only when "See Patient" is clicked
    setPatient(BLANK_PATIENT);
    setEncounterId(null);
    setActiveScreen("queue");
  }

  async function handleEncounterComplete(data) {
    if (data?._lookup) { setPatient(prev => ({ ...prev, ...data.patient })); return; }
    console.log("[Alera] handleEncounterComplete role:", role);
    // data shape from AleraEncounter: { patient, vitals, assignedDoctor, chiefComplaint, urgency, visitId, startTime, bmi }
    // Persist vitals to Supabase
    if (orgId && encounterId && patient._db_id && data.vitals) {
      await saveVitals(encounterId, patient._db_id, orgId, staffId, data.vitals);
    }
    // Nurse completing triage → waiting_doctor so doctor can see patient
    // Doctor sign-off is handled separately via handleDoctorSignOff
    if (encounterId && role === "nurse") {
      await updateEncounterStatus(encounterId, "waiting_doctor", {
        ...(data.assignedDoctor?.id ? { assigned_doctor_id: data.assignedDoctor.id } : {}),
      });
    }
    if (encounterId && role === "doctor") {
      await updateEncounterStatus(encounterId, "with_doctor");
    }
    mergePatient({
      assignedDoctor: data.assignedDoctor || patient.assignedDoctor,
      visitReason:    data.chiefComplaint  || patient.visitReason,
      urgency:        data.urgency,
      visitId:        data.visitId,
      startTime:      data.startTime,
      bmi:            data.bmi,
      // Normalise vitals into the shape AleraClinicalNoteEditor expects
      vitals: data.vitals ? {
        temp:   `${data.vitals.temp   || "—"}°C`,
        bp:     `${data.vitals.bp     || "—"} mmHg`,
        pulse:  `${data.vitals.pulse  || "—"} bpm`,
        spo2:   `${data.vitals.spo2   || "—"}%`,
        weight: `${data.vitals.weight || "—"} kg`,
      } : patient.vitals,
    });
    // Nurse goes back to queue after triage, doctor proceeds to clinical notes
    if (role === "nurse") {
      setPatient(BLANK_PATIENT);
      setEncounterId(null);
      setActiveScreen("queue");
    } else {
      advanceScreen(role, activeScreen);
    }
  }

  async function handleNotesComplete(data) {
    if (data?._lookup) { setPatient(prev => ({ ...prev, ...data.patient })); return; }
    // data shape from AleraClinicalNoteEditor: { soap, diagnosis, icdCodes, discharge }
    if (data) {
      // Persist SOAP note + diagnoses
      if (orgId && encounterId && patient._db_id) {
        const { data: note } = await saveNote(encounterId, patient._db_id, orgId, staffId, data);
        if (note) {
          setNoteId(note.id);
          mergePatient({ _note_id: note.id });
        }
        if (data.diagnosis) {
          const diagArr = Array.isArray(data.diagnosis) ? data.diagnosis : [{ name: data.diagnosis }];
          await saveDiagnoses(encounterId, patient._db_id, orgId, staffId, diagArr);
        }
      }
      mergePatient({
        soap:      data.soap      || patient.soap,
        diagnosis: data.diagnosis || patient.diagnosis,
        icdCodes:  data.icdCodes  || patient.icdCodes,
      });

      // Doctor sign-off: update encounter status and auto-generate bill
      if (encounterId && data.discharge) {
        const nextStatus = data.discharge === "pharmacy" ? "waiting_pharmacy" : "waiting_billing";
        await updateEncounterStatus(encounterId, nextStatus);

        // Auto-generate bill with consultation fee
        // Drug costs will be added when pharmacist dispenses
        const CONSULTATION_FEE = 2000; // ₦2,000 — configurable per org later
        if (patient._db_id) {
          const { data: bill } = await createBill(
            encounterId, patient._db_id, orgId, staffId,
            {
              subtotal:    CONSULTATION_FEE,
              patient_owes: CONSULTATION_FEE,
              insurance_provider: patient.insurance  ?? null,
              nhis_number:        patient.insuranceId ?? null,
            }
          );
          if (bill) setBillId(bill.id);
        }
      }

      // Doctor's job is done — return to queue for next patient
      if (data.discharge) {
        setPatient(BLANK_PATIENT);
        setEncounterId(null);
        setActiveScreen("queue");
        return;
      }
    }
    advanceScreen(role, activeScreen);
  }

  async function handlePrescriptionComplete(data) {
    if (data?._lookup) { setPatient(prev => ({ ...prev, ...data.patient })); return; }
    // data shape from AleraPrescriptionScreen: { rxList } — or undefined
    if (data) {
      mergePatient({ rxList: data.rxList || patient.rxList });
      // Persist prescription to Supabase
      if (orgId && encounterId && patient._db_id && data.rxList?.length) {
        await savePrescription(encounterId, patient._db_id, orgId, staffId, data.rxList, noteId);
      }
      // Move to waiting_billing after prescription
      if (encounterId) await updateEncounterStatus(encounterId, "waiting_billing");
    }
    setActiveScreen("billing");
  }

  async function handleDispensingComplete(data) {
    // Patient lookup — user selected a patient from the lookup screen
    if (data?._lookup) { setPatient(prev => ({ ...prev, ...data.patient })); return; }
    // Pharmacist confirmed dispensing — move to waiting_billing
    if (encounterId) await updateEncounterStatus(encounterId, "waiting_billing");
    // Return pharmacist to queue
    setPatient(BLANK_PATIENT);
    setEncounterId(null);
    setActiveScreen("queue");
  }

  async function handleBillingComplete(data) {
    // Patient lookup — user selected a patient from the lookup screen
    if (data?._lookup) { setPatient(prev => ({ ...prev, ...data.patient })); return; }
    // Doctor mode — charges confirmed, return to queue
    if (data?.chargesConfirmed) {
      if (encounterId) await updateEncounterStatus(encounterId, "waiting_billing");
      setPatient(BLANK_PATIENT);
      setEncounterId(null);
      setActiveScreen("queue");
      return;
    }

    // Cashier mode — payment collected, close visit
    mergePatient({
      amountPaid:    data?.amountPaid    ?? 0,
      paymentMethod: data?.paymentMethod ?? "Cash",
      endTime:       Date.now(),
    });
    if (orgId && patient._db_id) {
      const { data: bill } = await createBill(
        encounterId, patient._db_id, orgId, staffId,
        { subtotal: data?.amountPaid ?? 0, patient_owes: data?.amountPaid ?? 0 }
      );
      if (bill) {
        setBillId(bill.id);
        await recordPayment(bill.id, {
          amount: data?.amountPaid ?? 0,
          method: data?.paymentMethod ?? "cash",
          cashier_id: staffId,
        });
      }
    }
    if (encounterId) await updateEncounterStatus(encounterId, "completed");
    advanceScreen(role, activeScreen);
  }

  function handleNewPatient() {
    setPatient(BLANK_PATIENT);
    setActiveScreen(SCREEN_ACCESS[role]?.[0] || "encounter");
  }

  // ── Screen renderer ───────────────────────────────────────────────────────
  function renderScreen() {
    switch (activeScreen) {
      case "registration":
        return (
          <AleraPatientRegistration
            onComplete={handleRegistrationComplete}
          />
        );

      case "encounter":
        return (
          <AleraEncounter
            patient={patient}
            onComplete={handleEncounterComplete}
          />
        );

      case "notes":
        return (
          <AleraClinicalNoteEditor
            patient={patient}
            onComplete={handleNotesComplete}
          />
        );

      case "prescription":
        return (
          <AleraPrescriptionScreen
            patient={patient}
            diagnosis={patient.diagnosis || ""}
            onComplete={handlePrescriptionComplete}
          />
        );

      case "queue":
        return (
          <AleraQueue
            onStartEncounter={() => setActiveScreen("registration")}
            onSeePatient={["doctor", "nurse", "admin", "pharmacist", "cashier", "receptionist"].includes(role) ? handleSeePatient : undefined}
          />
        );

      case "admin":
        return <AleraAdmin />;

      case "nhis":
        return <AleraNHIS />;

      case "dispensing":
        return (
          <AleraDispensingScreen
            patient={patient}
            onComplete={handleDispensingComplete}
          />
        );

      case "billing":
        return (
          <AleraBillingDashboard
            patient={patient}
            onComplete={handleBillingComplete}
          />
        );

      case "exit": {
        // AleraVisitExit expects a nested encounter shape — build it from our flat patient state
        const rawVitals = patient.vitals || {};
        const encounter = {
          // nested patient sub-object
          patient: {
            id:          patient.id,
            name:        patient.name,
            age:         patient.age,
            sex:         patient.sex,
            phone:       patient.phone,
            email:       patient.email || "",
            insurance:   patient.insurance,
            insuranceId: patient.insuranceId,
          },
          // top-level encounter fields
          visitId:        patient.visitId        || `VIS-${Date.now()}`,
          provider:       patient.assignedDoctor?.name || patient.assignedDoctor || "—",
          diagnosis:      patient.diagnosis      || patient.soap?.assessment || "—",
          icdCode:        patient.icdCodes?.[0]?.code || "—",
          chiefComplaint: patient.visitReason    || "—",
          amountPaid:     patient.amountPaid     ?? 0,
          paymentMethod:  patient.paymentMethod  || "Cash",
          startTime:      patient.startTime      || Date.now(),
          endTime:        patient.endTime        || Date.now(),
          // vitals — strip units so exit can parse numbers
          vitals: {
            bp:     (rawVitals.bp     || "—").replace(" mmHg", ""),
            temp:   (rawVitals.temp   || "—").replace("°C", ""),
            pulse:  (rawVitals.pulse  || "—").replace(" bpm", ""),
            spo2:   (rawVitals.spo2   || "—").replace("%", ""),
            weight: (rawVitals.weight || "—").replace(" kg", ""),
            height: (rawVitals.height || "—").replace(" cm", ""),
          },
          // SOAP note
          soap: patient.soap || {
            subjective: "", objective: "", assessment: "", plan: "",
          },
          // prescriptions — map rxList to the shape exit expects
          prescriptions: (patient.rxList || []).map(rx => ({
            name:         rx.name         || rx.drugName || "—",
            dose:         rx.dose         || `${rx.strength || ""} ${rx.frequency || ""}`.trim() || "—",
            duration:     rx.duration || (rx.duration_days ? `${rx.duration_days} days` : "—"),
            instructions: rx.instructions || rx.notes || "",
          })),
        };
        return (
          <AleraVisitExit
            encounter={encounter}
            onNewPatient={handleNewPatient}
            onDone={handleLogout}
          />
        );
      }

      default:
        return (
          <div style={{
            padding: 48, textAlign: "center",
            fontFamily: "'DM Sans',sans-serif", color: "#6E7891", fontSize: 14,
          }}>
            Screen not found: <strong>{activeScreen}</strong>
          </div>
        );
    }
  }

  // ── Pre-login: real Supabase auth check ──────────────────────────────────
  // Show loading spinner while Supabase checks for an existing session
  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0D1117", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontFamily: "'DM Sans',sans-serif" }}>
          <div style={{ fontSize: 32, fontFamily: "'Syne',sans-serif", fontWeight: 800, color: "#fff", marginBottom: 12 }}>
            al<span style={{ color: "#27856A" }}>era</span>
          </div>
          <div style={{ fontSize: 13 }}>Loading…</div>
        </div>
      </div>
    );
  }

  // Show login if not authenticated OR if authenticated but role not yet selected
  if (!isAuthenticated || !role) {
    return <AleraLogin onLogin={handleLogin} />;
  }

  // ── Post-login: shell wraps whichever screen is active ────────────────────
  return (
    <AleraShell
      role={role}
      onLogout={handleLogout}
      activeScreen={activeScreen}
      onScreenChange={setActiveScreen}
      encounterState={patient}
      hasActivePatient={!!(patient._db_id && encounterId)}
    >
      {renderScreen()}
    </AleraShell>
  );
}
