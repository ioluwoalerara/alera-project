// ─────────────────────────────────────────────────────────────────────────────
// AleraDrugSchema.js
// In-memory drug database — mirrors 7-table relational schema.
// Swap to Postgres/Supabase by replacing the store objects with DB queries.
// No interaction rules seeded — add via addInteraction() or bulk import.
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuid } from "uuid";

// ─── Enums & Constants ────────────────────────────────────────────────────────

export const PREGNANCY_CATEGORY = {
  A:  "A",   // Adequate studies show no risk
  B:  "B",   // Animal studies show no risk; no adequate human studies
  C:  "C",   // Animal studies show adverse effects; benefit may outweigh risk
  D:  "D",   // Evidence of human fetal risk; benefit may outweigh risk
  X:  "X",   // Contraindicated in pregnancy
  NA: "N/A", // Not applicable / not classified
};

export const DRUG_FORM = {
  TABLET:     "tablet",
  CAPSULE:    "capsule",
  SUSPENSION: "suspension",
  INJECTION:  "injection",
  SYRUP:      "syrup",
  CREAM:      "cream",
  DROPS:      "drops",
  INHALER:    "inhaler",
  SUPPOSITORY:"suppository",
  SACHET:     "sachet",
};

export const ROUTE = {
  ORAL:        "oral",
  INTRAVENOUS: "intravenous",
  INTRAMUSCULAR:"intramuscular",
  TOPICAL:     "topical",
  SUBLINGUAL:  "sublingual",
  RECTAL:      "rectal",
  INHALATION:  "inhalation",
  SUBCUTANEOUS:"subcutaneous",
  OPHTHALMIC:  "ophthalmic",
  OTIC:        "otic",
};

export const FREQUENCY = {
  OD:   { label: "OD",   full: "Once daily",          timesPerDay: 1  },
  BD:   { label: "BD",   full: "Twice daily",          timesPerDay: 2  },
  TDS:  { label: "TDS",  full: "Three times daily",    timesPerDay: 3  },
  QID:  { label: "QID",  full: "Four times daily",     timesPerDay: 4  },
  PRN:  { label: "PRN",  full: "As needed",            timesPerDay: null },
  STAT: { label: "STAT", full: "Immediately (once)",   timesPerDay: 1  },
  NOCTE:{ label: "NOCTE",full: "At night",             timesPerDay: 1  },
  MANE: { label: "MANE", full: "In the morning",       timesPerDay: 1  },
  Q4H:  { label: "Q4H",  full: "Every 4 hours",        timesPerDay: 6  },
  Q6H:  { label: "Q6H",  full: "Every 6 hours",        timesPerDay: 4  },
  Q8H:  { label: "Q8H",  full: "Every 8 hours",        timesPerDay: 3  },
  Q12H: { label: "Q12H", full: "Every 12 hours",       timesPerDay: 2  },
  WEEKLY:{ label: "Weekly", full: "Once weekly",       timesPerDay: null },
};

export const INTERACTION_SEVERITY = {
  MILD:     "mild",     // Informational — no alert needed
  MODERATE: "moderate", // Yellow warning — doctor can proceed
  SEVERE:   "severe",   // Red alert — doctor must override with reason
  CRITICAL: "critical", // Blocked — cannot override (e.g. known fatal allergy)
};

export const ALLERGY_SEVERITY = {
  MILD:         "mild",
  MODERATE:     "moderate",
  SEVERE:       "severe",
  ANAPHYLACTIC: "anaphylactic",
};

export const THERAPEUTIC_CLASS = {
  ANTIMALARIAL:         "Antimalarial",
  ANTIBIOTIC:           "Antibiotic",
  ANALGESIC:            "Analgesic",
  ANTIPYRETIC:          "Antipyretic",
  NSAID:                "NSAID",
  ANTIHYPERTENSIVE:     "Antihypertensive",
  ANTIDIABETIC:         "Antidiabetic",
  ANTIRETROVIRAL:       "Antiretroviral",
  ANTIFUNGAL:           "Antifungal",
  ANTIPARASITIC:        "Antiparasitic",
  ANTIEMETIC:           "Antiemetic",
  ANTACID:              "Antacid",
  PROTON_PUMP_INHIBITOR:"Proton Pump Inhibitor",
  ANTIHISTAMINE:        "Antihistamine",
  CORTICOSTEROID:       "Corticosteroid",
  BRONCHODILATOR:       "Bronchodilator",
  VITAMIN_SUPPLEMENT:   "Vitamin/Supplement",
  FLUID_ELECTROLYTE:    "Fluid & Electrolyte",
  ANTICOAGULANT:        "Anticoagulant",
  DIURETIC:             "Diuretic",
  ACE_INHIBITOR:        "ACE Inhibitor",
  ARB:                  "ARB",
  BETA_BLOCKER:         "Beta Blocker",
  CALCIUM_CHANNEL_BLOCKER: "Calcium Channel Blocker",
  STATIN:               "Statin",
  ANTIEPILEPTIC:        "Antiepileptic",
  ANTIDEPRESSANT:       "Antidepressant",
  ANTIPSYCHOTIC:        "Antipsychotic",
  OXYTOCIC:             "Oxytocic",
  ANTHELMINTIC:         "Anthelmintic",
  TYPHOID:              "Typhoid Treatment",
};

// ─── Store ────────────────────────────────────────────────────────────────────
// These are the in-memory "tables". Each is a Map keyed by id.

const store = {
  drugs:           new Map(),
  drug_brands:     new Map(),
  drug_strengths:  new Map(),
  dosage_ranges:   new Map(),
  drug_interactions: new Map(),
  prescriptions:   new Map(),
  patient_allergies: new Map(),
};

// ─── Schema Helpers ───────────────────────────────────────────────────────────

function now() { return new Date().toISOString(); }

function insert(table, record) {
  const id = record.id || uuid();
  const row = { ...record, id, created_at: now(), updated_at: now() };
  store[table].set(id, row);
  return row;
}

function findAll(table) {
  return Array.from(store[table].values());
}

function findById(table, id) {
  return store[table].get(id) || null;
}

function findWhere(table, predicate) {
  return findAll(table).filter(predicate);
}

function updateById(table, id, fields) {
  const existing = store[table].get(id);
  if (!existing) return null;
  const updated = { ...existing, ...fields, updated_at: now() };
  store[table].set(id, updated);
  return updated;
}

function deleteById(table, id) {
  return store[table].delete(id);
}

// ─── Table: drugs ─────────────────────────────────────────────────────────────
// Core drug entity. One row per generic drug.

export const DrugTable = {
  insert: (drug) => insert("drugs", {
    generic_name:         drug.generic_name,
    therapeutic_class:    drug.therapeutic_class,
    sub_class:            drug.sub_class        || null,
    pregnancy_category:   drug.pregnancy_category || PREGNANCY_CATEGORY.C,
    is_antibiotic:        drug.is_antibiotic     || false,
    is_controlled:        drug.is_controlled     || false,        // Controlled substance
    requires_prescription:drug.requires_prescription !== false,   // Default true
    is_on_nhis_formulary: drug.is_on_nhis_formulary || false,     // NHIS coverage
    is_on_nlem:           drug.is_on_nlem        || false,        // Nigeria Essential Medicines List
    common_indications:   drug.common_indications || [],          // Array of strings
    contraindications:    drug.contraindications  || [],
    notes:                drug.notes             || null,
  }),

  findAll:    ()     => findAll("drugs"),
  findById:   (id)   => findById("drugs", id),
  findByName: (name) => findWhere("drugs", d =>
    d.generic_name.toLowerCase().includes(name.toLowerCase())
  ),
  findByClass: (cls) => findWhere("drugs", d => d.therapeutic_class === cls),
  update:     (id, fields) => updateById("drugs", id, fields),
  delete:     (id)         => deleteById("drugs", id),
};

// ─── Table: drug_brands ───────────────────────────────────────────────────────
// Nigerian brand names for each generic drug.

export const DrugBrandTable = {
  insert: (brand) => insert("drug_brands", {
    drug_id:                brand.drug_id,
    brand_name:             brand.brand_name,
    manufacturer:           brand.manufacturer           || null,
    country_of_manufacture: brand.country_of_manufacture || "Nigeria",
    is_common_in_nigeria:   brand.is_common_in_nigeria   !== false,
    is_available_nhis:      brand.is_available_nhis       || false,
    approximate_price_ngn:  brand.approximate_price_ngn  || null,  // Approximate retail price ₦
  }),

  findAll:          ()        => findAll("drug_brands"),
  findById:         (id)      => findById("drug_brands", id),
  findByDrugId:     (drug_id) => findWhere("drug_brands", b => b.drug_id === drug_id),
  findByBrandName:  (name)    => findWhere("drug_brands", b =>
    b.brand_name.toLowerCase().includes(name.toLowerCase())
  ),
  update: (id, fields) => updateById("drug_brands", id, fields),
  delete: (id)         => deleteById("drug_brands", id),
};

// ─── Table: drug_strengths ────────────────────────────────────────────────────
// Each available formulation/strength for a drug.

export const DrugStrengthTable = {
  insert: (s) => insert("drug_strengths", {
    drug_id:         s.drug_id,
    strength_value:  s.strength_value,   // e.g. 500
    strength_unit:   s.strength_unit,    // e.g. "mg"
    strength_label:  s.strength_label || `${s.strength_value}${s.strength_unit}`, // e.g. "500mg"
    form:            s.form,             // tablet, capsule, etc.
    route:           s.route || ROUTE.ORAL,
    is_default:      s.is_default || false,
    pack_size:       s.pack_size  || null,  // e.g. "Blister of 10"
    notes:           s.notes      || null,
  }),

  findAll:         ()        => findAll("drug_strengths"),
  findById:        (id)      => findById("drug_strengths", id),
  findByDrugId:    (drug_id) => findWhere("drug_strengths", s => s.drug_id === drug_id),
  findDefault:     (drug_id) => findWhere("drug_strengths", s => s.drug_id === drug_id && s.is_default)[0] || null,
  update: (id, fields) => updateById("drug_strengths", id, fields),
  delete: (id)         => deleteById("drug_strengths", id),
};

// ─── Table: dosage_ranges ─────────────────────────────────────────────────────
// Safety bounds for dosing. Powers pediatric + max dose checks.

export const DosageRangeTable = {
  insert: (r) => insert("dosage_ranges", {
    drug_id:           r.drug_id,
    age_min_years:     r.age_min_years   ?? 0,     // 0 = neonates
    age_max_years:     r.age_max_years   ?? 120,
    weight_min_kg:     r.weight_min_kg   ?? null,
    weight_max_kg:     r.weight_max_kg   ?? null,
    min_dose_mg_per_kg:r.min_dose_mg_per_kg ?? null,
    max_dose_mg_per_kg:r.max_dose_mg_per_kg ?? null,
    min_single_dose_mg:r.min_single_dose_mg ?? null,
    max_single_dose_mg:r.max_single_dose_mg ?? null,
    max_daily_dose_mg: r.max_daily_dose_mg  ?? null,
    frequency:         r.frequency          ?? null,  // Recommended frequency
    renal_adjustment:  r.renal_adjustment   || false, // Needs dose reduction in renal failure
    hepatic_adjustment:r.hepatic_adjustment || false,
    notes:             r.notes              || null,
  }),

  findAll:         ()        => findAll("dosage_ranges"),
  findById:        (id)      => findById("dosage_ranges", id),
  findByDrugId:    (drug_id) => findWhere("dosage_ranges", r => r.drug_id === drug_id),
  findForAge:      (drug_id, age_years) => findWhere("dosage_ranges", r =>
    r.drug_id === drug_id &&
    age_years >= r.age_min_years &&
    age_years <= r.age_max_years
  ),
  update: (id, fields) => updateById("dosage_ranges", id, fields),
  delete: (id)         => deleteById("dosage_ranges", id),
};

// ─── Table: drug_interactions ─────────────────────────────────────────────────
// Bidirectional interaction rules. No rules seeded — add externally.

export const DrugInteractionTable = {
  insert: (i) => insert("drug_interactions", {
    drug_a_id:              i.drug_a_id,
    drug_b_id:              i.drug_b_id,
    severity:               i.severity,                    // mild | moderate | severe | critical
    mechanism:              i.mechanism       || null,      // Pharmacokinetic/pharmacodynamic
    clinical_effect:        i.clinical_effect || null,      // What happens to the patient
    management:             i.management      || null,      // What the doctor should do
    evidence_level:         i.evidence_level  || null,      // A/B/C/D
    can_override:           i.can_override    !== false,    // Default: can override except critical
    requires_monitoring:    i.requires_monitoring || false,
    references:             i.references      || [],
  }),

  findAll:           ()      => findAll("drug_interactions"),
  findById:          (id)    => findById("drug_interactions", id),

  // Bidirectional lookup — A+B = B+A
  findBetween: (drug_a_id, drug_b_id) => findWhere("drug_interactions", i =>
    (i.drug_a_id === drug_a_id && i.drug_b_id === drug_b_id) ||
    (i.drug_a_id === drug_b_id && i.drug_b_id === drug_a_id)
  ),

  // All interactions involving a given drug
  findForDrug: (drug_id) => findWhere("drug_interactions", i =>
    i.drug_a_id === drug_id || i.drug_b_id === drug_id
  ),

  update: (id, fields) => updateById("drug_interactions", id, fields),
  delete: (id)         => deleteById("drug_interactions", id),
};

// ─── Table: prescriptions ────────────────────────────────────────────────────
// Full prescription record with override audit trail.

export const PrescriptionTable = {
  insert: (p) => insert("prescriptions", {
    patient_id:          p.patient_id,
    encounter_id:        p.encounter_id,
    drug_id:             p.drug_id,
    strength_id:         p.strength_id        || null,
    brand_id:            p.brand_id           || null,   // If doctor specified a brand
    dosage_amount:       p.dosage_amount,                // e.g. 1, 2, 0.5
    dosage_unit:         p.dosage_unit,                  // "tablet", "capsule", "ml"
    frequency:           p.frequency,                   // OD, BD, TDS etc.
    duration_days:       p.duration_days      || null,
    route:               p.route              || ROUTE.ORAL,
    instructions:        p.instructions       || null,   // Patient-friendly instructions
    instructions_local:  p.instructions_local || null,   // Local language version
    prescribed_by:       p.prescribed_by,                // Staff ID
    is_ai_suggested:     p.is_ai_suggested    || false,
    ai_suggestion_accepted: p.ai_suggestion_accepted || false,
    override_reason:     p.override_reason    || null,   // Logged if safety check overridden
    safety_checks_run:   p.safety_checks_run  || [],     // Array of check results at time of save
    status:              p.status             || "active", // active | dispensed | cancelled
    dispensed_at:        p.dispensed_at       || null,
    dispensed_by:        p.dispensed_by       || null,
    refill_count:        p.refill_count       || 0,
    max_refills:         p.max_refills        || 0,
  }),

  findAll:             ()             => findAll("prescriptions"),
  findById:            (id)           => findById("prescriptions", id),
  findByPatient:       (patient_id)   => findWhere("prescriptions", p => p.patient_id === patient_id),
  findByEncounter:     (encounter_id) => findWhere("prescriptions", p => p.encounter_id === encounter_id),
  findActive:          (patient_id)   => findWhere("prescriptions", p =>
    p.patient_id === patient_id && p.status === "active"
  ),
  update: (id, fields) => updateById("prescriptions", id, fields),
  cancel: (id, reason) => updateById("prescriptions", id, { status: "cancelled", cancel_reason: reason }),
  markDispensed: (id, dispensed_by) => updateById("prescriptions", id, {
    status: "dispensed",
    dispensed_at: now(),
    dispensed_by,
  }),
};

// ─── Table: patient_allergies ─────────────────────────────────────────────────
// Patient allergy records. Checked by safety engine on every prescription.

export const PatientAllergyTable = {
  insert: (a) => insert("patient_allergies", {
    patient_id:    a.patient_id,
    drug_id:       a.drug_id       || null,   // Specific drug (if known)
    drug_class:    a.drug_class    || null,   // Class allergy e.g. "Penicillin" covers all penicillins
    allergen_name: a.allergen_name || null,   // Free text fallback
    reaction_type: a.reaction_type || null,   // e.g. "rash", "anaphylaxis", "GI upset"
    severity:      a.severity      || ALLERGY_SEVERITY.MODERATE,
    reported_by:   a.reported_by   || "patient",  // patient | staff | chart
    verified:      a.verified      || false,       // Clinically verified allergy
    notes:         a.notes         || null,
  }),

  findAll:          ()           => findAll("patient_allergies"),
  findById:         (id)         => findById("patient_allergies", id),
  findByPatient:    (patient_id) => findWhere("patient_allergies", a => a.patient_id === patient_id),
  findByDrug:       (drug_id)    => findWhere("patient_allergies", a => a.drug_id === drug_id),
  update: (id, fields) => updateById("patient_allergies", id, fields),
  delete: (id)         => deleteById("patient_allergies", id),
};

// ─── Drug Seeds ───────────────────────────────────────────────────────────────
// ~20 drugs covering common Nigerian clinic conditions.
// Brands, strengths, and dosage ranges are seeded alongside each drug.
// Interaction rules: none seeded — add via DrugInteractionTable.insert()

function seedDrugs() {

  // ── Helper to seed a full drug + its brands + its strengths ──────────────
  function seedDrug({ drug, brands = [], strengths = [], dosageRanges = [] }) {
    const d = DrugTable.insert(drug);

    brands.forEach(b => DrugBrandTable.insert({ ...b, drug_id: d.id }));

    const strengthRecords = strengths.map(s =>
      DrugStrengthTable.insert({ ...s, drug_id: d.id })
    );

    dosageRanges.forEach(r =>
      DosageRangeTable.insert({ ...r, drug_id: d.id })
    );

    return { drug: d, strengths: strengthRecords };
  }

  // ── 1. Artemether/Lumefantrine ────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Artemether/Lumefantrine",
      therapeutic_class: THERAPEUTIC_CLASS.ANTIMALARIAL,
      pregnancy_category: PREGNANCY_CATEGORY.C,
      is_antibiotic:     false,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["Uncomplicated malaria", "P. falciparum malaria"],
      contraindications:  ["Severe malaria", "QT prolongation", "Severe hepatic impairment"],
      notes: "First-line for uncomplicated P. falciparum. Take with food or fat-containing drink.",
    },
    brands: [
      { brand_name: "Coartem",    manufacturer: "Novartis",    is_common_in_nigeria: true, approximate_price_ngn: 2000 },
      { brand_name: "Lonart",     manufacturer: "Bliss GVS",   is_common_in_nigeria: true, approximate_price_ngn: 1800 },
      { brand_name: "Artemotil",  manufacturer: "Local",       is_common_in_nigeria: true, approximate_price_ngn: 1600 },
    ],
    strengths: [
      { strength_value: 20,  strength_unit: "mg/120mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: false, notes: "Paediatric (5–14kg)" },
      { strength_value: 80,  strength_unit: "mg/480mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: true,  notes: "Adult (≥35kg)" },
    ],
    dosageRanges: [
      { age_min_years: 0,  age_max_years: 14, weight_min_kg: 5,  weight_max_kg: 14, min_dose_mg_per_kg: null, max_dose_mg_per_kg: null, max_daily_dose_mg: 480,  frequency: "BD", notes: "1 tab 20/120mg BD × 3 days (5–14kg)" },
      { age_min_years: 0,  age_max_years: 14, weight_min_kg: 15, weight_max_kg: 24, min_dose_mg_per_kg: null, max_dose_mg_per_kg: null, max_daily_dose_mg: 960,  frequency: "BD", notes: "2 tabs 20/120mg BD × 3 days (15–24kg)" },
      { age_min_years: 14, age_max_years: 120,weight_min_kg: 35, weight_max_kg: null,min_dose_mg_per_kg: null, max_dose_mg_per_kg: null, max_daily_dose_mg: 1920, frequency: "BD", notes: "4 tabs 20/120mg or 2 tabs 80/480mg BD × 3 days (≥35kg)" },
    ],
  });

  // ── 2. Amoxicillin ────────────────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Amoxicillin",
      therapeutic_class: THERAPEUTIC_CLASS.ANTIBIOTIC,
      sub_class:         "Penicillin",
      pregnancy_category: PREGNANCY_CATEGORY.B,
      is_antibiotic:     true,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["RTI", "UTI", "Otitis media", "Sinusitis", "Typhoid (mild)"],
      contraindications:  ["Penicillin allergy", "Mononucleosis"],
      notes: "Penicillin-class. Always check allergy status before prescribing.",
    },
    brands: [
      { brand_name: "Amoxil",     manufacturer: "GSK",          is_common_in_nigeria: true, approximate_price_ngn: 500  },
      { brand_name: "Tonsicap",   manufacturer: "Local",        is_common_in_nigeria: true, approximate_price_ngn: 400  },
      { brand_name: "Ampiclox",   manufacturer: "Beecham",      is_common_in_nigeria: true, approximate_price_ngn: 450  },
    ],
    strengths: [
      { strength_value: 250,  strength_unit: "mg", form: DRUG_FORM.CAPSULE,     route: ROUTE.ORAL, is_default: false },
      { strength_value: 500,  strength_unit: "mg", form: DRUG_FORM.CAPSULE,     route: ROUTE.ORAL, is_default: true  },
      { strength_value: 125,  strength_unit: "mg/5ml", form: DRUG_FORM.SUSPENSION, route: ROUTE.ORAL, is_default: false, notes: "Paediatric syrup" },
      { strength_value: 250,  strength_unit: "mg/5ml", form: DRUG_FORM.SUSPENSION, route: ROUTE.ORAL, is_default: false, notes: "Paediatric syrup" },
    ],
    dosageRanges: [
      { age_min_years: 0,   age_max_years: 12,  min_dose_mg_per_kg: 25,  max_dose_mg_per_kg: 50,  max_daily_dose_mg: 1500, frequency: "TDS", notes: "Paediatric standard" },
      { age_min_years: 12,  age_max_years: 120, min_single_dose_mg: 250, max_single_dose_mg: 500, max_daily_dose_mg: 3000, frequency: "TDS", notes: "Adult standard dose" },
    ],
  });

  // ── 3. Paracetamol (Acetaminophen) ────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Paracetamol",
      therapeutic_class: THERAPEUTIC_CLASS.ANALGESIC,
      sub_class:         "Antipyretic/Analgesic",
      pregnancy_category: PREGNANCY_CATEGORY.B,
      is_antibiotic:     false,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["Fever", "Mild–moderate pain", "Post-procedure pain"],
      contraindications:  ["Severe hepatic impairment", "Hypersensitivity"],
      notes: "Safest first-line analgesic. Hepatotoxic in overdose — do not exceed max daily dose.",
    },
    brands: [
      { brand_name: "Panadol",    manufacturer: "GSK",   is_common_in_nigeria: true, approximate_price_ngn: 200 },
      { brand_name: "Emzor Para", manufacturer: "Emzor", is_common_in_nigeria: true, approximate_price_ngn: 150 },
      { brand_name: "Tylenol",    manufacturer: "J&J",   is_common_in_nigeria: false, approximate_price_ngn: 600 },
    ],
    strengths: [
      { strength_value: 500,  strength_unit: "mg", form: DRUG_FORM.TABLET,  route: ROUTE.ORAL, is_default: true  },
      { strength_value: 1000, strength_unit: "mg", form: DRUG_FORM.TABLET,  route: ROUTE.ORAL, is_default: false, notes: "Extended relief" },
      { strength_value: 120,  strength_unit: "mg/5ml", form: DRUG_FORM.SYRUP, route: ROUTE.ORAL, is_default: false, notes: "Paediatric syrup" },
    ],
    dosageRanges: [
      { age_min_years: 0,   age_max_years: 12,  min_dose_mg_per_kg: 10, max_dose_mg_per_kg: 15, max_daily_dose_mg: 60, frequency: "Q6H",  notes: "Paediatric: max 60mg/kg/day" },
      { age_min_years: 12,  age_max_years: 120, min_single_dose_mg: 500, max_single_dose_mg: 1000, max_daily_dose_mg: 4000, frequency: "Q6H", notes: "Adult max 4g/day. 2g/day if liver disease." },
    ],
  });

  // ── 4. Metronidazole ──────────────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Metronidazole",
      therapeutic_class: THERAPEUTIC_CLASS.ANTIBIOTIC,
      sub_class:         "Nitroimidazole",
      pregnancy_category: PREGNANCY_CATEGORY.B,
      is_antibiotic:     true,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["Anaerobic infections", "Amoebiasis", "Giardiasis", "BV", "Dental infections", "H. pylori"],
      contraindications:  ["First trimester pregnancy", "Alcohol consumption (disulfiram-like reaction)"],
      notes: "Warn patient to AVOID ALCOHOL during treatment and 48h after. Metallic taste common.",
    },
    brands: [
      { brand_name: "Flagyl",    manufacturer: "Sanofi",  is_common_in_nigeria: true, approximate_price_ngn: 400 },
      { brand_name: "Metrozol",  manufacturer: "Local",   is_common_in_nigeria: true, approximate_price_ngn: 300 },
    ],
    strengths: [
      { strength_value: 200,  strength_unit: "mg", form: DRUG_FORM.TABLET,    route: ROUTE.ORAL, is_default: false },
      { strength_value: 400,  strength_unit: "mg", form: DRUG_FORM.TABLET,    route: ROUTE.ORAL, is_default: true  },
      { strength_value: 500,  strength_unit: "mg", form: DRUG_FORM.INJECTION, route: ROUTE.INTRAVENOUS, is_default: false },
    ],
    dosageRanges: [
      { age_min_years: 0,   age_max_years: 12,  min_dose_mg_per_kg: 7.5, max_dose_mg_per_kg: 10, max_daily_dose_mg: 400,  frequency: "TDS" },
      { age_min_years: 12,  age_max_years: 120, min_single_dose_mg: 400, max_single_dose_mg: 800, max_daily_dose_mg: 2400, frequency: "TDS" },
    ],
  });

  // ── 5. Ciprofloxacin ──────────────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Ciprofloxacin",
      therapeutic_class: THERAPEUTIC_CLASS.ANTIBIOTIC,
      sub_class:         "Fluoroquinolone",
      pregnancy_category: PREGNANCY_CATEGORY.C,
      is_antibiotic:     true,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["UTI", "Typhoid fever", "GI infections", "RTI", "Skin infections"],
      contraindications:  ["Children <18 (cartilage toxicity)", "Pregnancy", "QT prolongation", "Antacids (reduce absorption)"],
      notes: "Avoid co-administration with antacids, iron, zinc — give 2h apart. Tendon rupture risk.",
    },
    brands: [
      { brand_name: "Ciproxin",   manufacturer: "Bayer",   is_common_in_nigeria: true, approximate_price_ngn: 800  },
      { brand_name: "Ciprolet",   manufacturer: "Local",   is_common_in_nigeria: true, approximate_price_ngn: 600  },
    ],
    strengths: [
      { strength_value: 250,  strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: false },
      { strength_value: 500,  strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: true  },
      { strength_value: 200,  strength_unit: "mg/100ml", form: DRUG_FORM.INJECTION, route: ROUTE.INTRAVENOUS, is_default: false },
    ],
    dosageRanges: [
      { age_min_years: 18, age_max_years: 120, min_single_dose_mg: 250, max_single_dose_mg: 750, max_daily_dose_mg: 1500, frequency: "BD", renal_adjustment: true },
    ],
  });

  // ── 6. Amlodipine ─────────────────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Amlodipine",
      therapeutic_class: THERAPEUTIC_CLASS.CALCIUM_CHANNEL_BLOCKER,
      pregnancy_category: PREGNANCY_CATEGORY.C,
      is_antibiotic:     false,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["Hypertension", "Angina"],
      contraindications:  ["Cardiogenic shock", "Severe aortic stenosis"],
      notes: "Long-acting. Dose once daily. Ankle swelling is common side effect.",
    },
    brands: [
      { brand_name: "Norvasc",    manufacturer: "Pfizer",  is_common_in_nigeria: true,  approximate_price_ngn: 1200 },
      { brand_name: "Amlopin",    manufacturer: "Local",   is_common_in_nigeria: true,  approximate_price_ngn: 800  },
    ],
    strengths: [
      { strength_value: 5,   strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: true  },
      { strength_value: 10,  strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: false },
    ],
    dosageRanges: [
      { age_min_years: 18, age_max_years: 120, min_single_dose_mg: 2.5, max_single_dose_mg: 10, max_daily_dose_mg: 10, frequency: "OD", hepatic_adjustment: true },
    ],
  });

  // ── 7. Lisinopril ─────────────────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Lisinopril",
      therapeutic_class: THERAPEUTIC_CLASS.ACE_INHIBITOR,
      pregnancy_category: PREGNANCY_CATEGORY.D,
      is_antibiotic:     false,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["Hypertension", "Heart failure", "Diabetic nephropathy"],
      contraindications:  ["Pregnancy (D)", "Bilateral renal artery stenosis", "Angioedema history", "Hyperkalemia"],
      notes: "Contraindicated in pregnancy (Category D). Dry cough common — consider ARB switch.",
    },
    brands: [
      { brand_name: "Zestril",    manufacturer: "AstraZeneca", is_common_in_nigeria: true,  approximate_price_ngn: 900  },
      { brand_name: "Listril",    manufacturer: "Local",       is_common_in_nigeria: true,  approximate_price_ngn: 600  },
    ],
    strengths: [
      { strength_value: 5,   strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: true  },
      { strength_value: 10,  strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: false },
      { strength_value: 20,  strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: false },
    ],
    dosageRanges: [
      { age_min_years: 18, age_max_years: 120, min_single_dose_mg: 2.5, max_single_dose_mg: 40, max_daily_dose_mg: 40, frequency: "OD", renal_adjustment: true },
    ],
  });

  // ── 8. Metformin ──────────────────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Metformin",
      therapeutic_class: THERAPEUTIC_CLASS.ANTIDIABETIC,
      sub_class:         "Biguanide",
      pregnancy_category: PREGNANCY_CATEGORY.B,
      is_antibiotic:     false,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["Type 2 Diabetes", "PCOS", "Pre-diabetes"],
      contraindications:  ["eGFR <30", "Iodinated contrast (hold 48h)", "Severe hepatic disease", "Alcoholism"],
      notes: "Take with meals to reduce GI side effects. Hold before contrast procedures.",
    },
    brands: [
      { brand_name: "Glucophage",  manufacturer: "Merck",   is_common_in_nigeria: true, approximate_price_ngn: 600  },
      { brand_name: "Metforal",    manufacturer: "Local",   is_common_in_nigeria: true, approximate_price_ngn: 400  },
    ],
    strengths: [
      { strength_value: 500,  strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: true  },
      { strength_value: 850,  strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: false },
      { strength_value: 1000, strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: false, notes: "Extended release" },
    ],
    dosageRanges: [
      { age_min_years: 18, age_max_years: 120, min_single_dose_mg: 500, max_single_dose_mg: 1000, max_daily_dose_mg: 3000, frequency: "BD", renal_adjustment: true },
    ],
  });

  // ── 9. Ibuprofen ─────────────────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Ibuprofen",
      therapeutic_class: THERAPEUTIC_CLASS.NSAID,
      pregnancy_category: PREGNANCY_CATEGORY.D,
      is_antibiotic:     false,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["Pain", "Fever", "Inflammation", "Dysmenorrhoea", "Arthritis"],
      contraindications:  ["Third trimester pregnancy", "Peptic ulcer", "Renal impairment", "Aspirin allergy"],
      notes: "Take with food. Avoid in renal disease, third trimester, and peptic ulcer.",
    },
    brands: [
      { brand_name: "Brufen",    manufacturer: "Abbott",  is_common_in_nigeria: true, approximate_price_ngn: 350 },
      { brand_name: "Emzor Ibu", manufacturer: "Emzor",   is_common_in_nigeria: true, approximate_price_ngn: 250 },
      { brand_name: "Advil",     manufacturer: "Pfizer",  is_common_in_nigeria: false, approximate_price_ngn: 700 },
    ],
    strengths: [
      { strength_value: 200,  strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: false },
      { strength_value: 400,  strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: true  },
      { strength_value: 100,  strength_unit: "mg/5ml", form: DRUG_FORM.SUSPENSION, route: ROUTE.ORAL, is_default: false, notes: "Paediatric" },
    ],
    dosageRanges: [
      { age_min_years: 1,  age_max_years: 12,  min_dose_mg_per_kg: 5,   max_dose_mg_per_kg: 10,  max_daily_dose_mg: 40,   frequency: "TDS" },
      { age_min_years: 12, age_max_years: 120, min_single_dose_mg: 200, max_single_dose_mg: 800, max_daily_dose_mg: 3200, frequency: "TDS", renal_adjustment: true },
    ],
  });

  // ── 10. Azithromycin ──────────────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Azithromycin",
      therapeutic_class: THERAPEUTIC_CLASS.ANTIBIOTIC,
      sub_class:         "Macrolide",
      pregnancy_category: PREGNANCY_CATEGORY.B,
      is_antibiotic:     true,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["RTI", "CAP", "STI (chlamydia)", "Typhoid", "Skin infections"],
      contraindications:  ["QT prolongation", "Hepatic disease (severe)", "Azithromycin hypersensitivity"],
      notes: "Z-pack (3–5 days). QT-prolonging — caution with other QT drugs. Take on empty stomach.",
    },
    brands: [
      { brand_name: "Zithromax",  manufacturer: "Pfizer",  is_common_in_nigeria: true, approximate_price_ngn: 1500 },
      { brand_name: "Azicip",     manufacturer: "Local",   is_common_in_nigeria: true, approximate_price_ngn: 900  },
    ],
    strengths: [
      { strength_value: 250,  strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: false },
      { strength_value: 500,  strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: true  },
    ],
    dosageRanges: [
      { age_min_years: 6,   age_max_years: 18,  min_dose_mg_per_kg: 10, max_dose_mg_per_kg: 12, max_daily_dose_mg: 500,  frequency: "OD", notes: "Paediatric: 10mg/kg OD × 3–5 days" },
      { age_min_years: 18,  age_max_years: 120, min_single_dose_mg: 250, max_single_dose_mg: 500, max_daily_dose_mg: 500, frequency: "OD" },
    ],
  });

  // ── 11. Folic Acid ────────────────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Folic Acid",
      therapeutic_class: THERAPEUTIC_CLASS.VITAMIN_SUPPLEMENT,
      pregnancy_category: PREGNANCY_CATEGORY.A,
      is_antibiotic:     false,
      requires_prescription: false,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["Antenatal care", "Megaloblastic anaemia", "Neural tube defect prevention"],
      notes: "Start before conception and continue through 1st trimester. 5mg if high risk.",
    },
    brands: [
      { brand_name: "Folvite",   manufacturer: "Local",  is_common_in_nigeria: true, approximate_price_ngn: 150 },
    ],
    strengths: [
      { strength_value: 0.4, strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: false, notes: "Prevention dose" },
      { strength_value: 5,   strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: true,  notes: "Treatment / high-risk antenatal" },
    ],
    dosageRanges: [
      { age_min_years: 0, age_max_years: 120, min_single_dose_mg: 0.4, max_single_dose_mg: 5, max_daily_dose_mg: 5, frequency: "OD" },
    ],
  });

  // ── 12. Oral Rehydration Salts ────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Oral Rehydration Salts (ORS)",
      therapeutic_class: THERAPEUTIC_CLASS.FLUID_ELECTROLYTE,
      pregnancy_category: PREGNANCY_CATEGORY.A,
      is_antibiotic:     false,
      requires_prescription: false,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["Diarrhoea", "Dehydration", "Cholera", "Vomiting", "Malaria supportive"],
      notes: "Mix 1 sachet in 200ml clean water. WHO low-osmolarity formula preferred.",
    },
    brands: [
      { brand_name: "Electroral",  manufacturer: "Local",  is_common_in_nigeria: true, approximate_price_ngn: 150 },
      { brand_name: "Dioralyte",   manufacturer: "Sanofi", is_common_in_nigeria: false, approximate_price_ngn: 400 },
    ],
    strengths: [
      { strength_value: 1, strength_unit: "sachet", form: DRUG_FORM.SACHET, route: ROUTE.ORAL, is_default: true },
    ],
    dosageRanges: [
      { age_min_years: 0, age_max_years: 120, max_daily_dose_mg: null, frequency: "PRN", notes: "1 sachet per loose stool or vomiting episode" },
    ],
  });

  // ── 13. Omeprazole ────────────────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Omeprazole",
      therapeutic_class: THERAPEUTIC_CLASS.PROTON_PUMP_INHIBITOR,
      pregnancy_category: PREGNANCY_CATEGORY.C,
      is_antibiotic:     false,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["GERD", "Peptic ulcer", "H. pylori (combination)", "NSAID gastroprotection", "Zollinger-Ellison"],
      notes: "Take 30–60 min before meals. Long-term use: monitor Mg2+, B12, bone density.",
    },
    brands: [
      { brand_name: "Losec",   manufacturer: "AstraZeneca", is_common_in_nigeria: true, approximate_price_ngn: 700 },
      { brand_name: "Meprazol",manufacturer: "Local",       is_common_in_nigeria: true, approximate_price_ngn: 500 },
    ],
    strengths: [
      { strength_value: 20,  strength_unit: "mg", form: DRUG_FORM.CAPSULE, route: ROUTE.ORAL, is_default: true  },
      { strength_value: 40,  strength_unit: "mg", form: DRUG_FORM.CAPSULE, route: ROUTE.ORAL, is_default: false },
    ],
    dosageRanges: [
      { age_min_years: 18, age_max_years: 120, min_single_dose_mg: 20, max_single_dose_mg: 40, max_daily_dose_mg: 40, frequency: "OD", hepatic_adjustment: true },
    ],
  });

  // ── 14. Diclofenac ────────────────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Diclofenac",
      therapeutic_class: THERAPEUTIC_CLASS.NSAID,
      pregnancy_category: PREGNANCY_CATEGORY.D,
      is_antibiotic:     false,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["Pain", "Inflammation", "Post-op pain", "Musculoskeletal", "Dysmenorrhoea"],
      contraindications:  ["Peptic ulcer", "Third trimester", "Renal impairment", "Aspirin allergy"],
      notes: "Higher cardiovascular risk than ibuprofen. Use lowest effective dose for shortest duration.",
    },
    brands: [
      { brand_name: "Voltaren",  manufacturer: "Novartis", is_common_in_nigeria: true, approximate_price_ngn: 500 },
      { brand_name: "Cataflam",  manufacturer: "Novartis", is_common_in_nigeria: true, approximate_price_ngn: 600 },
    ],
    strengths: [
      { strength_value: 50,   strength_unit: "mg", form: DRUG_FORM.TABLET,    route: ROUTE.ORAL,          is_default: true  },
      { strength_value: 75,   strength_unit: "mg", form: DRUG_FORM.INJECTION, route: ROUTE.INTRAMUSCULAR, is_default: false },
    ],
    dosageRanges: [
      { age_min_years: 18, age_max_years: 120, min_single_dose_mg: 25, max_single_dose_mg: 75, max_daily_dose_mg: 150, frequency: "BD", renal_adjustment: true },
    ],
  });

  // ── 15. Chlorphenamine (Chlorpheniramine) ─────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Chlorphenamine",
      therapeutic_class: THERAPEUTIC_CLASS.ANTIHISTAMINE,
      sub_class:         "First-generation antihistamine",
      pregnancy_category: PREGNANCY_CATEGORY.B,
      is_antibiotic:     false,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["Allergic rhinitis", "Urticaria", "Allergic reactions", "Cold symptoms"],
      notes: "Causes sedation — warn patients not to drive. First-gen antihistamine.",
    },
    brands: [
      { brand_name: "Piriton",   manufacturer: "GSK",   is_common_in_nigeria: true, approximate_price_ngn: 200 },
    ],
    strengths: [
      { strength_value: 4,  strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: true },
      { strength_value: 2,  strength_unit: "mg/5ml", form: DRUG_FORM.SYRUP, route: ROUTE.ORAL, is_default: false, notes: "Paediatric" },
    ],
    dosageRanges: [
      { age_min_years: 2,  age_max_years: 6,   min_single_dose_mg: 1,   max_single_dose_mg: 1,   max_daily_dose_mg: 6,  frequency: "TDS" },
      { age_min_years: 6,  age_max_years: 12,  min_single_dose_mg: 2,   max_single_dose_mg: 2,   max_daily_dose_mg: 12, frequency: "TDS" },
      { age_min_years: 12, age_max_years: 120, min_single_dose_mg: 4,   max_single_dose_mg: 4,   max_daily_dose_mg: 24, frequency: "TDS" },
    ],
  });

  // ── 16. Ceftriaxone ───────────────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Ceftriaxone",
      therapeutic_class: THERAPEUTIC_CLASS.ANTIBIOTIC,
      sub_class:         "Cephalosporin (3rd gen)",
      pregnancy_category: PREGNANCY_CATEGORY.B,
      is_antibiotic:     true,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["Severe infections", "Typhoid (severe)", "Meningitis", "Sepsis", "Gonorrhoea"],
      contraindications:  ["Cephalosporin allergy", "Neonatal hyperbilirubinemia (IV/IM)"],
      notes: "Caution in penicillin allergy (10% cross-reactivity). Do not mix with calcium-containing IV fluids.",
    },
    brands: [
      { brand_name: "Rocephin",   manufacturer: "Roche",  is_common_in_nigeria: true, approximate_price_ngn: 2500 },
      { brand_name: "Ceftrizone", manufacturer: "Local",  is_common_in_nigeria: true, approximate_price_ngn: 1500 },
    ],
    strengths: [
      { strength_value: 250,  strength_unit: "mg", form: DRUG_FORM.INJECTION, route: ROUTE.INTRAMUSCULAR, is_default: false },
      { strength_value: 1000, strength_unit: "mg", form: DRUG_FORM.INJECTION, route: ROUTE.INTRAVENOUS,   is_default: true  },
    ],
    dosageRanges: [
      { age_min_years: 0,  age_max_years: 12,  min_dose_mg_per_kg: 50,  max_dose_mg_per_kg: 100, max_daily_dose_mg: 4000, frequency: "OD" },
      { age_min_years: 12, age_max_years: 120, min_single_dose_mg: 1000,max_single_dose_mg: 2000,max_daily_dose_mg: 4000, frequency: "OD", renal_adjustment: true },
    ],
  });

  // ── 17. Doxycycline ───────────────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Doxycycline",
      therapeutic_class: THERAPEUTIC_CLASS.ANTIBIOTIC,
      sub_class:         "Tetracycline",
      pregnancy_category: PREGNANCY_CATEGORY.D,
      is_antibiotic:     true,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["Malaria prophylaxis", "RTI", "STI (chlamydia)", "Lyme disease", "Acne"],
      contraindications:  ["Pregnancy (D)", "Children <8 years (tooth discolouration)", "Oesophageal stricture"],
      notes: "Take with full glass of water — remain upright 30 min. Avoid dairy and antacids.",
    },
    brands: [
      { brand_name: "Vibramycin", manufacturer: "Pfizer", is_common_in_nigeria: true, approximate_price_ngn: 600 },
      { brand_name: "Doxylin",    manufacturer: "Local",  is_common_in_nigeria: true, approximate_price_ngn: 400 },
    ],
    strengths: [
      { strength_value: 100, strength_unit: "mg", form: DRUG_FORM.CAPSULE, route: ROUTE.ORAL, is_default: true },
    ],
    dosageRanges: [
      { age_min_years: 8, age_max_years: 120, min_single_dose_mg: 100, max_single_dose_mg: 200, max_daily_dose_mg: 200, frequency: "OD" },
    ],
  });

  // ── 18. Hydralazine ───────────────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Hydralazine",
      therapeutic_class: THERAPEUTIC_CLASS.ANTIHYPERTENSIVE,
      pregnancy_category: PREGNANCY_CATEGORY.C,
      is_antibiotic:     false,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["Hypertensive crisis in pregnancy", "Eclampsia", "Severe hypertension"],
      notes: "IV use in obstetric emergencies. Oral form less common — used in resistant HTN.",
    },
    brands: [
      { brand_name: "Apresoline", manufacturer: "Novartis", is_common_in_nigeria: true, approximate_price_ngn: 800 },
    ],
    strengths: [
      { strength_value: 25,  strength_unit: "mg", form: DRUG_FORM.TABLET,    route: ROUTE.ORAL,          is_default: true  },
      { strength_value: 20,  strength_unit: "mg", form: DRUG_FORM.INJECTION, route: ROUTE.INTRAVENOUS,   is_default: false },
    ],
    dosageRanges: [
      { age_min_years: 18, age_max_years: 120, min_single_dose_mg: 25, max_single_dose_mg: 50, max_daily_dose_mg: 200, frequency: "BD" },
    ],
  });

  // ── 19. Vitamin B Complex ────────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Vitamin B Complex",
      therapeutic_class: THERAPEUTIC_CLASS.VITAMIN_SUPPLEMENT,
      pregnancy_category: PREGNANCY_CATEGORY.A,
      is_antibiotic:     false,
      requires_prescription: false,
      is_on_nhis_formulary: true,
      common_indications: ["Vitamin B deficiency", "Peripheral neuropathy", "General supplement", "Malnutrition", "Anaemia support"],
      notes: "Generally well tolerated. Urine may turn bright yellow — normal.",
    },
    brands: [
      { brand_name: "Berocca",  manufacturer: "Roche",  is_common_in_nigeria: false, approximate_price_ngn: 1200 },
      { brand_name: "B-complex",manufacturer: "Local",  is_common_in_nigeria: true,  approximate_price_ngn: 300  },
    ],
    strengths: [
      { strength_value: 1, strength_unit: "tablet", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: true },
    ],
    dosageRanges: [
      { age_min_years: 0, age_max_years: 120, max_daily_dose_mg: null, frequency: "OD" },
    ],
  });

  // ── 20. Zinc Sulphate ────────────────────────────────────────────────────
  seedDrug({
    drug: {
      generic_name:      "Zinc Sulphate",
      therapeutic_class: THERAPEUTIC_CLASS.VITAMIN_SUPPLEMENT,
      pregnancy_category: PREGNANCY_CATEGORY.A,
      is_antibiotic:     false,
      requires_prescription: false,
      is_on_nhis_formulary: true,
      is_on_nlem:        true,
      common_indications: ["Paediatric diarrhoea", "Zinc deficiency", "Wound healing", "Growth faltering"],
      notes: "WHO-recommended adjunct to ORS for paediatric diarrhoea. Reduces duration.",
    },
    brands: [
      { brand_name: "Zincovit",  manufacturer: "Local",  is_common_in_nigeria: true, approximate_price_ngn: 300 },
    ],
    strengths: [
      { strength_value: 10,  strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: false, notes: "<6 months" },
      { strength_value: 20,  strength_unit: "mg", form: DRUG_FORM.TABLET, route: ROUTE.ORAL, is_default: true,  notes: ">6 months" },
    ],
    dosageRanges: [
      { age_min_years: 0,   age_max_years: 0.5, min_single_dose_mg: 10,  max_single_dose_mg: 10,  max_daily_dose_mg: 10,  frequency: "OD", notes: "<6 months: 10mg OD × 10 days" },
      { age_min_years: 0.5, age_max_years: 5,   min_single_dose_mg: 20,  max_single_dose_mg: 20,  max_daily_dose_mg: 20,  frequency: "OD", notes: ">6 months: 20mg OD × 10 days" },
    ],
  });
}

// ─── Initialize ───────────────────────────────────────────────────────────────
// Call once on app startup.

export function initDrugDatabase() {
  seedDrugs();
  console.log(`[AleraDrugSchema] Initialized.`);
  console.log(`  drugs:           ${store.drugs.size}`);
  console.log(`  drug_brands:     ${store.drug_brands.size}`);
  console.log(`  drug_strengths:  ${store.drug_strengths.size}`);
  console.log(`  dosage_ranges:   ${store.dosage_ranges.size}`);
  console.log(`  drug_interactions: ${store.drug_interactions.size} (none seeded — add via DrugInteractionTable.insert())`);
}

// ─── Search API ───────────────────────────────────────────────────────────────
// Fast search used by the prescription UI.

export function searchDrugs(query) {
  if (!query || query.trim().length < 1) return [];
  const q = query.toLowerCase().trim();

  const drugMatches = DrugTable.findByName(q);

  // Also search brand names
  const brandMatches = DrugBrandTable.findByBrandName(q);
  const brandDrugIds = [...new Set(brandMatches.map(b => b.drug_id))];
  const brandDrugs   = brandDrugIds
    .map(id => DrugTable.findById(id))
    .filter(Boolean)
    .filter(d => !drugMatches.find(m => m.id === d.id)); // Deduplicate

  return [...drugMatches, ...brandDrugs].map(drug => ({
    drug,
    brands:    DrugBrandTable.findByDrugId(drug.id),
    strengths: DrugStrengthTable.findByDrugId(drug.id),
    defaultStrength: DrugStrengthTable.findDefault(drug.id),
    dosageRanges: DosageRangeTable.findByDrugId(drug.id),
  }));
}

// ─── Exports ──────────────────────────────────────────────────────────────────


