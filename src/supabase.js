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
      .select("id, org_id, role")
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
