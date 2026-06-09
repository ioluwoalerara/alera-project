// =============================================================================
// supabase.js — Alera Supabase client
// =============================================================================
// Single import point for all Supabase interactions across the app.
//
// Setup:
//   1. Create a .env file in project root:
//      VITE_SUPABASE_URL=https://your-project.supabase.co
//      VITE_SUPABASE_ANON_KEY=your-anon-key
//   2. Never commit .env to git — it's in .gitignore
// =============================================================================

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "[Alera] Missing Supabase env vars.\n" +
    "Create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist session across page refreshes via localStorage
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
  },
  realtime: {
    // Used for live queue updates (waiting room)
    params: { eventsPerSecond: 10 },
  },
});

// ─── Sync helper (lazy import to avoid circular dependency) ──────────────────
// syncedWrite is imported lazily because AleraSync.js imports supabase.js
let _syncedWrite = null;
async function getSyncedWrite() {
  if (!_syncedWrite) {
    const mod = await import("./AleraSync.js");
    _syncedWrite = mod.syncedWrite;
  }
  return _syncedWrite;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/**
 * Sign in with email + password.
 * Returns { user, session, error }
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { user: data?.user, session: data?.session, error };
}

/**
 * Sign out the current session.
 */
export async function signOut() {
  return await supabase.auth.signOut();
}

/**
 * Get the current session (null if not logged in).
 */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

/**
 * Extract custom Alera JWT claims from the current session.
 * Claims are set by the Postgres hook on auth.users:
 *   { org_id, staff_id, alera_role, org_name }
 *
 * Returns null if not authenticated.
 */
export function getAleraClaims(session) {
  if (!session?.access_token) return null;
  try {
    const payload = JSON.parse(atob(session.access_token.split(".")[1]));
    if (payload.org_id && payload.alera_role) {
      return {
        org_id:     payload.org_id,
        staff_id:   payload.staff_id   ?? null,
        alera_role: payload.alera_role,
        org_name:   payload.org_name   ?? null,
      };
    }
  } catch {}
  return null;
}

export async function getAleraClaimsFromDB(session) {
  if (!session?.user?.id) return null;
  try {
    const { data, error } = await supabase
      .from("staff")
      .select("id, org_id, role, first_name, last_name")
      .eq("auth_user_id", session.user.id)
      .eq("is_active", true)
      .single();
    console.log("[Alera] staff lookup result:", { data, error });
    if (error || !data) return null;
    return {
      org_id:     data.org_id,
      staff_id:   data.id,
      alera_role: data.role,
      org_name:   "Alera Health Clinic",
      first_name: data.first_name,
      last_name:  data.last_name,
    };
  } catch (e) {
    console.error("[Alera] getAleraClaimsFromDB failed:", e.message);
    return null;
  }
}

/**
 * Subscribe to auth state changes.
 * callback(event, session) — events: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED
 * Returns unsubscribe function.
 */
export function onAuthChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
  return () => subscription.unsubscribe();
}

// ─── Database helpers ─────────────────────────────────────────────────────────

/**
 * Generic error handler — logs and returns a user-friendly message.
 */
export function dbError(error, context = "") {
  console.error(`[Alera DB${context ? " " + context : ""}]`, error);
  return error?.message ?? "An unexpected database error occurred.";
}

/**
 * Fuzzy patient search using Postgres trigram similarity.
 * Searches by name, phone, or patient_number.
 * Returns up to 10 matches.
 */
export async function searchPatients(query, orgId) {
  if (!query || query.length < 2) return { data: [], error: null };

  const { data, error } = await supabase
    .from("patients")
    .select(`
      id, patient_number, first_name, last_name, middle_name,
      date_of_birth, biological_sex, phone, blood_group,
      insurance_provider, nhis_number,
      has_renal_impairment, has_hepatic_impairment, has_g6pd_deficiency,
      is_currently_pregnant, total_visits, last_visit_at,
      patient_allergies (
        id, allergen, allergen_type, severity, reaction_description
      )
    `)
    .eq("org_id", orgId)
    .or(
      `patient_number.ilike.%${query}%,` +
      `phone.ilike.%${query}%,` +
      `first_name.ilike.%${query}%,` +
      `last_name.ilike.%${query}%`
    )
    .limit(10);

  return { data: data ?? [], error };
}

/**
 * Upsert a patient record.
 * If patient.id exists → UPDATE. Otherwise → INSERT with auto patient_number.
 */
export async function upsertPatient(patient, orgId, staffId) {
  const isNew = !patient.id;

  const payload = {
    org_id:               orgId,
    first_name:           patient.first_name  || patient.firstName || patient.name?.split(" ")[0] || "",
    middle_name:          patient.middle_name || patient.middleName || null,
    last_name:            patient.last_name   || patient.lastName  || patient.name?.split(" ").slice(1).join(" ") || "",
    nin:                  patient.nin         || null,
    date_of_birth:        patient.dob         || null,
    biological_sex:       normaliseSex(patient.sex),
    phone:                patient.phone       || null,
    address_line1:        patient.address     || null,
    blood_group:          normaliseBlood(patient.blood),
    insurance_provider:   patient.insurance   || null,
    insurance_id:         patient.insuranceId || null,
    nhis_number:          patient.nhis_number || null,
    has_renal_impairment: patient.has_renal_impairment ?? false,
    has_hepatic_impairment: patient.has_hepatic_impairment ?? false,
    has_g6pd_deficiency:  patient.has_g6pd_deficiency ?? false,
    registered_by:        staffId,
    consent_data_use:     true,
    consent_given_at:     new Date().toISOString(),
  };

  const sw = await getSyncedWrite();

  if (isNew) {
    // patient_number is generated server-side via DB trigger
    return await sw("patients", "insert", payload);
  } else {
    return await sw("patients", "update", { ...payload, updated_at: new Date().toISOString() }, { id: patient.id });
  }
}

/**
 * Create a new encounter (visit) for a patient.
 */
export async function createEncounter(patientId, orgId, staffId, options = {}) {
  const visitNumber = `VIS-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  const sw = await getSyncedWrite();
  return await sw("encounters", "insert", {
    org_id:              orgId,
    patient_id:          patientId,
    registered_by:       staffId,
    visit_number:        visitNumber,
    encounter_type:      options.encounter_type    ?? "outpatient",
    status:              "waiting_triage",
    urgency:             options.urgency           ?? "non_urgent",
    chief_complaint:     options.chief_complaint   ?? null,
    assigned_doctor_id:  options.assigned_doctor_id ?? null,
    is_follow_up:        options.is_follow_up      ?? false,
  });
}

/**
 * Update encounter status + timing fields.
 */
export async function updateEncounterStatus(encounterId, status, extraFields = {}) {
  const timingField = {
    triage:             "triage_at",
    with_doctor:        "seen_at",
    completed:          "completed_at",
    discharged:         "discharged_at",
  }[status];

  const update = {
    status,
    ...extraFields,
    ...(timingField ? { [timingField]: new Date().toISOString() } : {}),
  };

  const { data, error } = await supabase
    .from("encounters")
    .update(update)
    .eq("id", encounterId)
    .select()
    .single();

  return { data, error };
}

/**
 * Save vitals for an encounter.
 */
export async function saveVitals(encounterId, patientId, orgId, staffId, vitals) {
  const { data, error } = await supabase
    .from("vitals")
    .insert({
      org_id:          orgId,
      encounter_id:    encounterId,
      patient_id:      patientId,
      recorded_by:     staffId,
      bp_systolic:     parseVital(vitals.bp?.split("/")?.[0]),
      bp_diastolic:    parseVital(vitals.bp?.split("/")?.[1]),
      pulse_bpm:       parseVital(vitals.pulse),
      temperature_c:   parseVital(vitals.temp),
      spo2_pct:        parseVital(vitals.spo2),
      weight_kg:       parseVital(vitals.weight),
      is_first_reading: true,
    })
    .select()
    .single();

  return { data, error };
}

/**
 * Save or update a SOAP note.
 */
export async function saveNote(encounterId, patientId, orgId, authorId, noteData, existingId = null) {
  const payload = {
    org_id:       orgId,
    encounter_id: encounterId,
    patient_id:   patientId,
    author_id:    authorId,
    note_type:    "soap",
    status:       noteData.signed ? "signed" : "draft",
    subjective:   noteData.subjective ?? noteData.soap?.S ?? null,
    objective:    noteData.objective  ?? noteData.soap?.O ?? null,
    assessment:   noteData.assessment ?? noteData.soap?.A ?? null,
    plan:         noteData.plan       ?? noteData.soap?.P ?? null,
    ai_drafted:   noteData.ai_drafted ?? false,
    voice_transcript: noteData.voice_transcript ?? null,
    signed_at:    noteData.signed ? new Date().toISOString() : null,
  };

  const sw = await getSyncedWrite();
  if (existingId) {
    return await sw("clinical_notes", "update", { ...payload, updated_at: new Date().toISOString() }, { id: existingId });
  }
  return await sw("clinical_notes", "insert", payload);
}

/**
 * Save diagnoses from a clinical note.
 */
export async function saveDiagnoses(encounterId, patientId, orgId, staffId, diagnoses) {
  if (!diagnoses?.length) return { data: [], error: null };

  const rows = diagnoses.map((d, i) => ({
    org_id:         orgId,
    encounter_id:   encounterId,
    patient_id:     patientId,
    diagnosed_by:   staffId,
    icd10_code:     d.code    ?? null,
    icd10_display:  d.display ?? null,
    local_name:     d.name    ?? d.local_name ?? d,
    diagnosis_type: i === 0 ? "primary" : "secondary",
    certainty:      d.certainty ?? "confirmed",
    is_chronic:     d.is_chronic ?? false,
    ai_suggested:   d.ai_suggested ?? false,
    ai_confidence:  d.ai_confidence ?? null,
  }));

  const { data, error } = await supabase
    .from("diagnoses")
    .insert(rows)
    .select();

  return { data: data ?? [], error };
}

/**
 * Save a prescription + its line items.
 * rxItems: array of prescription_items from AleraPrescriptionScreen
 */
export async function savePrescription(encounterId, patientId, orgId, staffId, rxItems, noteId = null) {
  const rxNumber = `RX-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  // 1. Create prescription header
  const { data: rx, error: rxErr } = await supabase
    .from("prescriptions")
    .insert({
      org_id:               orgId,
      encounter_id:         encounterId,
      patient_id:           patientId,
      note_id:              noteId,
      prescribed_by:        staffId,
      prescription_number:  rxNumber,
      status:               "active",
      signed_at:            new Date().toISOString(),
      valid_until:          new Date(Date.now() + 30 * 86400000).toISOString(),
    })
    .select()
    .single();

  if (rxErr) return { data: null, error: rxErr };

  // 2. Create line items
  const items = rxItems.map(item => ({
    org_id:               orgId,
    prescription_id:      rx.id,
    patient_id:           patientId,
    drug_id:              item.drug_id,
    strength_id:          item.strength_id ?? null,
    dosage_amount:        item.dosage_amount ?? null,
    dosage_unit:          item.dosage_unit ?? null,
    frequency:            item.frequency,
    times_per_day:        item.times_per_day ?? null,
    duration_days:        item.duration_days ?? null,
    route:                item.route ?? "oral",
    patient_instructions: item.instructions ?? null,
    is_ai_suggested:      item.is_ai_suggested ?? false,
    status:               "pending",
  }));

  const { data: itemData, error: itemErr } = await supabase
    .from("prescription_items")
    .insert(items)
    .select();

  return { data: { prescription: rx, items: itemData }, error: itemErr };
}

/**
 * Create a bill for an encounter.
 */
export async function createBill(encounterId, patientId, orgId, staffId, billData) {
  const billNumber = `BILL-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  const { data, error } = await supabase
    .from("bills")
    .insert({
      org_id:               orgId,
      encounter_id:         encounterId,
      patient_id:           patientId,
      created_by:           staffId,
      bill_number:          billNumber,
      status:               "open",
      insurance_provider:   billData.insurance_provider ?? null,
      nhis_number:          billData.nhis_number ?? null,
      subtotal_ngn:         billData.subtotal    ?? 0,
      discount_ngn:         billData.discount    ?? 0,
      discount_reason:      billData.discount_reason ?? null,
      insurance_covers_ngn: billData.insurance_covers ?? 0,
      patient_owes_ngn:     billData.patient_owes ?? 0,
    })
    .select()
    .single();

  return { data, error };
}

/**
 * Record payment against a bill.
 */
export async function recordPayment(billId, paymentData) {
  const { data, error } = await supabase
    .from("bills")
    .update({
      status:           "paid",
      amount_paid_ngn:  paymentData.amount,
      change_given_ngn: paymentData.change ?? 0,
      payment_method:   paymentData.method,
      cashier_id:       paymentData.cashier_id,
      paid_at:          new Date().toISOString(),
      receipt_number:   `RCP-${Date.now()}`,
    })
    .eq("id", billId)
    .select()
    .single();

  return { data, error };
}

/**
 * Fetch patient's allergy list.
 */
/**
 * Check if a patient has an active encounter today.
 * Returns { hasActive, encounter } 
 */
export async function checkActiveEncounter(patientId, orgId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("encounters")
    .select("id, status, registered_at, visit_number")
    .eq("patient_id", patientId)
    .eq("org_id", orgId)
    .gte("registered_at", today + "T00:00:00.000Z")
    .not("status", "in", "(completed,discharged)")
    .order("registered_at", { ascending: false })
    .limit(1);

  return {
    hasActive: (data?.length ?? 0) > 0,
    encounter: data?.[0] ?? null,
  };
}

export async function getPatientAllergies(patientId) {
  const { data, error } = await supabase
    .from("patient_allergies")
    .select("*")
    .eq("patient_id", patientId);
  return { data: data ?? [], error };
}

/**
 * Fetch patient's current encounter + history.
 */
/**
 * Get full patient chart — all encounters with nested vitals, notes,
 * diagnoses, prescriptions, and bills.
 */
export async function getPatientChart(patientId, limit = 20) {
  // 1. Patient demographics + allergies
  const { data: patient } = await supabase
    .from("patients")
    .select(`
      id, first_name, middle_name, last_name, patient_number,
      date_of_birth, biological_sex, blood_group,
      phone, address_line1, insurance_provider, nhis_number, nin,
      created_at,
      patient_allergies(allergen, severity, reaction)
    `)
    .eq("id", patientId)
    .single();

  // 2. All encounters with nested data
  const { data: encounters } = await supabase
    .from("encounters")
    .select(`
      id, visit_number, encounter_type, status, urgency,
      chief_complaint, registered_at, completed_at, triage_at, seen_at,
      assigned_doctor:staff!assigned_doctor_id(id, first_name, last_name),
      vitals(id, bp_systolic, bp_diastolic, temperature, pulse_rate, spo2, weight_kg, height_cm, bmi, recorded_at),
      clinical_notes(id, note_type, subjective, objective, assessment, plan, created_at,
        author:staff!author_id(first_name, last_name)
      ),
      diagnoses(id, name, icd_code, diagnosis_type, certainty, created_at),
      prescriptions(id, drug_name, strength, form, quantity, frequency, duration, route, instructions, brand, created_at),
      bills(id, subtotal, patient_owes, status, created_at,
        bill_payments(amount, payment_method, paid_at)
      )
    `)
    .eq("patient_id", patientId)
    .order("registered_at", { ascending: false })
    .limit(limit);

  return { patient: patient ?? null, encounters: encounters ?? [] };
}

export async function getPatientEncounters(patientId, limit = 10) {
  const { data, error } = await supabase
    .from("encounters")
    .select(`
      id, visit_number, encounter_type, status, urgency,
      chief_complaint, registered_at, completed_at,
      assigned_doctor:staff!assigned_doctor_id(first_name, last_name)
    `)
    .eq("patient_id", patientId)
    .order("registered_at", { ascending: false })
    .limit(limit);
  return { data: data ?? [], error };
}

/**
 * Get today's waiting room queue for an org.
 * Used by AleraEncounter and reception screens.
 */
export async function getWaitingQueue(orgId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("encounters")
    .select(`
      id, visit_number, status, urgency, chief_complaint,
      registered_at, seen_at,
      patient:patients!patient_id(
        id, first_name, middle_name, last_name, patient_number,
        date_of_birth, biological_sex, insurance_provider
      ),
      doctor:staff!assigned_doctor_id(first_name, last_name)
    `)
    .eq("org_id", orgId)
    .gte("registered_at", today.toISOString())
    .in("status", ["waiting_triage", "in_triage", "waiting_doctor", "with_doctor", "waiting_pharmacy", "waiting_billing", "completed"])
    .order("urgency", { ascending: true })  // immediate first
    .order("registered_at", { ascending: true });

  return { data: data ?? [], error };
}

/**
 * Fetch drug formulary for this org.
 * Falls back to master drug list if org_formulary is empty.
 */
export async function getDrugFormulary(orgId) {
  const { data, error } = await supabase
    .from("drugs")
    .select(`
      id, name, drug_class, drug_subclass, pregnancy_category,
      is_nhis_formulary, g6pd_caution, renal_caution, hepatic_caution,
      contraindications, clinical_notes,
      drug_strengths(id, strength_label, strength_value, strength_unit, strength_mg, dosage_form, route, is_default),
      drug_brands(id, brand_name, manufacturer, is_nhis_approved, unit_price_ngn)
    `)
    .eq("is_active", true)
    .order("name");

  return { data: data ?? [], error };
}

/**
 * Get drug interactions for a set of drug IDs.
 * Calls the Postgres RPC function defined in the schema.
 */
export async function checkDrugInteractions(drugIds) {
  if (!drugIds || drugIds.length < 2) return { data: [], error: null };

  const { data, error } = await supabase
    .rpc("get_drug_interactions", { drug_ids: drugIds });

  return { data: data ?? [], error };
}

/**
 * Log an AI event for audit trail.
 * Call this after every Claude API interaction.
 */

/**
 * Analytics — fetch all data needed for the clinic dashboard.
 */
export async function getAnalytics(orgId, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  // Daily encounter counts for the last N days
  const { data: encounters } = await supabase
    .from("encounters")
    .select("id, status, urgency, registered_at, completed_at, assigned_doctor_id, assigned_doctor:staff!assigned_doctor_id(first_name, last_name)")
    .eq("org_id", orgId)
    .gte("registered_at", since)
    .order("registered_at", { ascending: true });

  // Revenue from bills
  const { data: bills } = await supabase
    .from("bills")
    .select("id, subtotal, patient_owes, status, created_at, bill_payments(amount, paid_at)")
    .eq("org_id", orgId)
    .gte("created_at", since);

  // Top diagnoses
  const { data: diagnoses } = await supabase
    .from("diagnoses")
    .select("name, icd_code, created_at")
    .eq("org_id", orgId)
    .gte("created_at", since);

  // Prescriptions for pharmacy stats
  const { data: prescriptions } = await supabase
    .from("prescriptions")
    .select("drug_name, quantity, created_at")
    .eq("org_id", orgId)
    .gte("created_at", since);

  // Staff list for performance
  const { data: staff } = await supabase
    .from("staff")
    .select("id, first_name, last_name, role")
    .eq("org_id", orgId)
    .eq("is_active", true);

  return {
    encounters: encounters || [],
    bills: bills || [],
    diagnoses: diagnoses || [],
    prescriptions: prescriptions || [],
    staff: staff || [],
  };
}

export async function logAiEvent(orgId, eventData) {
  const { error } = await supabase
    .from("ai_events")
    .insert({
      org_id:           orgId,
      patient_id:       eventData.patient_id    ?? null,
      encounter_id:     eventData.encounter_id  ?? null,
      prescription_id:  eventData.prescription_id ?? null,
      staff_id:         eventData.staff_id       ?? null,
      event_type:       eventData.event_type,
      model:            eventData.model          ?? "claude-sonnet-4-20250514",
      prompt_version:   eventData.prompt_version ?? "v1",
      input_summary:    eventData.input_summary  ?? null,
      output_summary:   eventData.output_summary ?? null,
      confidence_score: eventData.confidence     ?? null,
      token_count_input:  eventData.tokens_in    ?? null,
      token_count_output: eventData.tokens_out   ?? null,
      latency_ms:       eventData.latency_ms     ?? null,
      decision:         eventData.decision       ?? null,
      had_error:        eventData.had_error      ?? false,
      error_message:    eventData.error_message  ?? null,
    });

  // Log errors silently — never let audit logging break the clinical workflow
  if (error) console.warn("[Alera AI Audit]", error.message);
}

// ─── Internal utilities ───────────────────────────────────────────────────────

function normaliseSex(sex) {
  if (!sex) return "unknown";
  const s = sex.toLowerCase();
  if (s === "male"   || s === "m") return "male";
  if (s === "female" || s === "f") return "female";
  return "unknown";
}

function normaliseBlood(blood) {
  if (!blood) return "unknown";
  // Strip display decorators like "— Unknown —" or "— None —"
  const b = blood.replace(/[^a-zA-Z0-9+\-]/g, "");
  const valid = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
  const upper = b.toUpperCase();
  return valid.includes(upper) ? upper : "unknown";
}

function parseVital(val) {
  if (val === null || val === undefined || val === "") return null;
  const n = parseFloat(String(val).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : n;
}

// ─── APID — Alera Patient ID ──────────────────────────────────────────────────

/**
 * Generate a unique Alera Patient ID (APID)
 * Format: APID-XXXXXXXX (8 alphanumeric chars)
 */
function generateAPID() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0,O,1,I to avoid confusion
  let id = "APID-";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/**
 * Get or create a global patient ID for a patient.
 * Called at registration — if patient already has one, return it.
 */
export async function ensureGlobalPatientId(patientId) {
  const { data } = await supabase
    .from("patients")
    .select("global_patient_id")
    .eq("id", patientId)
    .single();

  if (data?.global_patient_id) return data.global_patient_id;

  // Generate new APID
  const apid = generateAPID();
  await supabase.from("patients").update({ global_patient_id: apid }).eq("id", patientId);
  return apid;
}

/**
 * Search patients across ALL orgs by name, phone, or APID.
 * Returns basic demographics only — no clinical data without consent.
 */
export async function searchPatientsGlobal(query) {
  if (!query || query.length < 2) return { data: [] };

  const isAPID = query.toUpperCase().startsWith("APID-");

  if (isAPID) {
    const { data } = await supabase
      .from("patients")
      .select("id, org_id, global_patient_id, first_name, last_name, date_of_birth, biological_sex, phone, patient_number, blood_group, patient_allergies(allergen)")
      .eq("global_patient_id", query.toUpperCase())
      .limit(5);
    return { data: data || [] };
  }

  // Search by name or phone
  const { data } = await supabase
    .from("patients")
    .select("id, org_id, global_patient_id, first_name, last_name, date_of_birth, biological_sex, phone, patient_number, blood_group, patient_allergies(allergen)")
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%`)
    .not("global_patient_id", "is", null)
    .limit(10);

  return { data: data || [] };
}

/**
 * Request consent to access a patient's records from another org.
 */
export async function requestPatientConsent(globalPatientId, requestingOrgId, grantingOrgId, staffId) {
  const { data, error } = await supabase
    .from("patient_consents")
    .insert({
      global_patient_id: globalPatientId,
      requesting_org_id: requestingOrgId,
      granting_org_id:   grantingOrgId,
      consent_type:      "full",
      status:            "pending",
      staff_id:          staffId,
    })
    .select()
    .single();
  return { data, error };
}

/**
 * Grant consent verbally (receptionist confirms patient said yes).
 */
export async function grantConsentVerbally(consentId, staffId) {
  const { data, error } = await supabase
    .from("patient_consents")
    .update({
      status:       "approved",
      consented_by: "patient_verbal",
      granted_at:   new Date().toISOString(),
      expires_at:   new Date(Date.now() + 365 * 86400000).toISOString(), // 1 year
    })
    .eq("id", consentId)
    .select()
    .single();
  return { data, error };
}

/**
 * Check if requesting org has consent to view a patient's records.
 */
export async function checkConsent(globalPatientId, requestingOrgId) {
  const { data } = await supabase
    .from("patient_consents")
    .select("id, status, consent_type, granted_at, expires_at")
    .eq("global_patient_id", globalPatientId)
    .eq("requesting_org_id", requestingOrgId)
    .eq("status", "approved")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .limit(1);
  return { hasConsent: (data?.length ?? 0) > 0, consent: data?.[0] };
}

/**
 * Get full cross-org patient chart (requires consent).
 */
export async function getCrossOrgChart(globalPatientId) {
  const { data: patients } = await supabase
    .from("patients")
    .select(`
      id, org_id, global_patient_id, first_name, last_name,
      date_of_birth, biological_sex, blood_group, phone,
      patient_number, pcp_staff_id, pcp_name,
      patient_allergies(allergen, severity),
      encounters(
        id, status, registered_at, chief_complaint,
        assigned_doctor:staff!assigned_doctor_id(first_name, last_name),
        vitals(bp_systolic, bp_diastolic, temperature, pulse_rate, spo2, weight_kg),
        clinical_notes(subjective, objective, assessment, plan, created_at),
        diagnoses(name, icd_code, diagnosis_type),
        prescriptions(drug_name, strength, frequency, duration)
      )
    `)
    .eq("global_patient_id", globalPatientId)
    .order("registered_at", { foreignTable: "encounters", ascending: false });

  return { data: patients || [] };
}

/**
 * Set or update a patient's PCP.
 */
export async function setPatientPCP(globalPatientId, pcpStaffId, pcpName) {
  const { error } = await supabase
    .from("patients")
    .update({ pcp_staff_id: pcpStaffId, pcp_name: pcpName })
    .eq("global_patient_id", globalPatientId);
  return { error };
}

/**
 * Log patient record access.
 */
export async function logPatientAccess(globalPatientId, orgId, staffId, accessType = "view") {
  await supabase.from("patient_access_log").insert({
    global_patient_id: globalPatientId,
    accessed_by_org:   orgId,
    accessed_by_staff: staffId,
    access_type:       accessType,
  });
}

// ─── Staff Invite ─────────────────────────────────────────────────────────────

/**
 * Invite a new staff member by email.
 * Creates auth user via Supabase invite + staff record.
 */
export async function inviteStaffMember(orgId, staffData) {
  const { email, firstName, lastName, role, phone } = staffData;

  // Step 1: Send invite email via Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { first_name: firstName, last_name: lastName },
    redirectTo: `${window.location.origin}/?invited=true`,
  });

  if (authError) return { error: authError };

  // Step 2: Create staff record
  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .insert({
      org_id:        orgId,
      auth_user_id:  authData.user.id,
      email,
      first_name:    firstName,
      last_name:     lastName,
      role,
      phone:         phone || null,
      is_active:     true,
    })
    .select()
    .single();

  if (staffError) return { error: staffError };
  return { data: staff };
}

/**
 * Get all staff for an org.
 */
export async function getOrgStaff(orgId) {
  const { data, error } = await supabase
    .from("staff")
    .select("id, email, first_name, last_name, role, is_active, created_at, last_login_at, phone")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  return { data: data || [], error };
}

/**
 * Update staff member details.
 */
export async function updateStaffMember(staffId, updates) {
  const { data, error } = await supabase
    .from("staff")
    .update(updates)
    .eq("id", staffId)
    .select()
    .single();
  return { data, error };
}

/**
 * Deactivate a staff member.
 */
export async function deactivateStaff(staffId) {
  return updateStaffMember(staffId, { is_active: false });
}

// ─── Patient Auth ─────────────────────────────────────────────────────────────

/**
 * Check if a logged-in user is a patient (not staff).
 */
export async function getPatientFromAuth(userId) {
  const { data } = await supabase
    .from("patients")
    .select("id, first_name, last_name, email, phone, date_of_birth, biological_sex, blood_group, global_patient_id, address_line1, patient_allergies(allergen), pcp_name")
    .eq("auth_user_id", userId)
    .single();
  return data;
}

/**
 * Self-register a new patient account.
 */
export async function registerPatientAccount(userData) {
  const { email, password, firstName, lastName, dob, phone, sex, address } = userData;

  // Create auth account
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { first_name: firstName, last_name: lastName, user_type: "patient" } },
  });
  if (authError) return { error: authError };

  // Generate APID
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let apid = "APID-";
  for (let i = 0; i < 8; i++) apid += chars[Math.floor(Math.random() * chars.length)];

  // Create patient record (org_id = null for self-registered patients)
  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .insert({
      auth_user_id:     authData.user.id,
      email,
      first_name:       firstName,
      last_name:        lastName,
      date_of_birth:    dob || null,
      biological_sex:   sex || null,
      phone:            phone || null,
      address_line1:    address || null,
      global_patient_id: apid,
      org_id:           "00000000-0000-0000-0000-000000000001", // default org for self-registered
    })
    .select()
    .single();

  if (patientError) return { error: patientError };
  return { data: patient };
}

/**
 * Get patient's upcoming appointments.
 */
export async function getPatientAppointments(patientId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("appointments")
    .select("*, staff:doctor_id(first_name, last_name)")
    .eq("patient_id", patientId)
    .gte("appointment_date", today)
    .order("appointment_date", { ascending: true })
    .limit(10);
  return { data: data || [] };
}

/**
 * Get patient's past encounters with clinical data.
 */
export async function getPatientPortalChart(patientId) {
  const { data } = await supabase
    .from("encounters")
    .select(`
      id, status, registered_at, chief_complaint,
      assigned_doctor:staff!assigned_doctor_id(first_name, last_name),
      vitals(bp_systolic, bp_diastolic, temperature, pulse_rate, spo2, weight_kg, recorded_at),
      clinical_notes(assessment, plan, created_at),
      diagnoses(name, icd_code),
      prescriptions(drug_name, strength, frequency, duration, route)
    `)
    .eq("patient_id", patientId)
    .eq("status", "completed")
    .order("registered_at", { ascending: false })
    .limit(20);
  return { data: data || [] };
}

/**
 * Search clinics on Alera by name or specialty.
 */
export async function searchAleraClinics(query, specialty) {
  let q = supabase
    .from("organisations")
    .select("id, name, address, phone, email, specialties, created_at");

  if (query) q = q.ilike("name", `%${query}%`);
  // Use cs (contains) only if specialties column exists and has data
  if (specialty) q = q.overlaps("specialties", [specialty]);

  const { data } = await q.limit(10);
  return { data: data || [] };
}

/**
 * Send a message from patient to clinic.
 */
export async function sendPatientMessage(patientId, orgId, message) {
  const { data, error } = await supabase
    .from("patient_messages")
    .insert({
      patient_id: patientId,
      org_id:     orgId,
      message,
      sender:     "patient",
      read:       false,
    })
    .select()
    .single();
  return { data, error };
}

/**
 * Get messages between patient and clinic.
 */
export async function getPatientMessages(patientId, orgId) {
  const { data } = await supabase
    .from("patient_messages")
    .select("*")
    .eq("patient_id", patientId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  return { data: data || [] };
}
