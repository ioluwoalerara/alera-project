// ─────────────────────────────────────────────────────────────────────────────
// AleraSafetyEngine.js
// Deterministic, rule-based prescription safety checker.
// No AI. No rules seeded. All checks are structural — ready to receive rules.
//
// Usage:
//   const results = SafetyEngine.check({ candidate, activePrescriptions, patient });
//   // results: SafetyResult[]
//
// Each SafetyResult describes one finding. The UI layer decides how to display it.
// The engine never blocks or allows — it only reports. The UI enforces.
// ─────────────────────────────────────────────────────────────────────────────

import {
  DrugTable,
  DrugStrengthTable,
  DosageRangeTable,
  DrugInteractionTable,
  PatientAllergyTable,
  INTERACTION_SEVERITY,
  ALLERGY_SEVERITY,
} from "./AleraDrugSchema.js";

// ─── Result Types ─────────────────────────────────────────────────────────────

export const CHECK_TYPE = {
  ALLERGY_CONFLICT:           "ALLERGY_CONFLICT",
  DRUG_INTERACTION:           "DRUG_INTERACTION",
  DUPLICATE_DRUG:             "DUPLICATE_DRUG",
  PREGNANCY_CONTRAINDICATION: "PREGNANCY_CONTRAINDICATION",
  PEDIATRIC_DOSE_EXCEEDED:    "PEDIATRIC_DOSE_EXCEEDED",
  MAX_DOSE_EXCEEDED:          "MAX_DOSE_EXCEEDED",
  AGE_RESTRICTION:            "AGE_RESTRICTION",
  RENAL_CAUTION:              "RENAL_CAUTION",
  HEPATIC_CAUTION:            "HEPATIC_CAUTION",
  MISSING_DURATION:           "MISSING_DURATION",
  MISSING_FREQUENCY:          "MISSING_FREQUENCY",
  ANTIBIOTIC_NO_INDICATION:   "ANTIBIOTIC_NO_INDICATION",
  CONTROLLED_SUBSTANCE:       "CONTROLLED_SUBSTANCE",
  INFO:                       "INFO",
};

export const SEVERITY = {
  INFO:     "info",      // Quiet inline note — no alert needed
  WARNING:  "warning",   // Yellow — doctor can proceed without action
  CRITICAL: "critical",  // Red — doctor must provide override reason to proceed
  BLOCKED:  "blocked",   // Cannot be overridden (reserved for absolute contraindications)
};

// ─── SafetyResult ─────────────────────────────────────────────────────────────
// Every check returns zero or more SafetyResult objects.

function SafetyResult({
  type,
  severity,
  title,
  message,
  detail        = null,   // Extra clinical detail (shown on expand)
  canOverride   = true,   // Whether doctor can override with a reason
  affectedDrugs = [],     // Drug IDs involved
  checkId       = null,   // ID of the interaction/allergy/rule that triggered this
  recommendation = null,  // Suggested action
}) {
  return {
    type,
    severity,
    title,
    message,
    detail,
    canOverride,
    affectedDrugs,
    checkId,
    recommendation,
    timestamp: new Date().toISOString(),
  };
}

// ─── Patient Context ──────────────────────────────────────────────────────────
// Shape expected by the engine. All fields optional — engine degrades gracefully.
//
// {
//   id:            string,
//   age_years:     number,
//   weight_kg:     number | null,
//   sex:           "Male" | "Female" | "Other",
//   is_pregnant:   boolean,
//   trimester:     1 | 2 | 3 | null,
//   has_renal_impairment:  boolean,
//   has_hepatic_impairment: boolean,
//   allergies:     PatientAllergy[],   // Pre-loaded from PatientAllergyTable
// }

// ─── Prescription Candidate ───────────────────────────────────────────────────
// Shape of the prescription being checked (before it is saved).
//
// {
//   drug_id:       string,
//   strength_id:   string | null,
//   dosage_amount: number,
//   dosage_unit:   string,
//   frequency:     string,       // OD | BD | TDS | QID | PRN etc.
//   duration_days: number | null,
//   route:         string,
// }

// ─── Individual Check Functions ───────────────────────────────────────────────
// Each function takes (candidate, patient, activePrescriptions) and returns SafetyResult[].
// They are pure functions — no side effects.

// ── Check 1: Allergy Conflict ─────────────────────────────────────────────────
function checkAllergyConflict(candidate, patient) {
  const results = [];
  if (!patient?.allergies?.length) return results;

  const drug = DrugTable.findById(candidate.drug_id);
  if (!drug) return results;

  for (const allergy of patient.allergies) {
    // Direct drug match
    const isDrugMatch = allergy.drug_id && allergy.drug_id === candidate.drug_id;

    // Class-level match — e.g. allergy.drug_class = "Penicillin" matches Amoxicillin (sub_class = "Penicillin")
    const isClassMatch =
      allergy.drug_class &&
      drug.sub_class &&
      drug.sub_class.toLowerCase() === allergy.drug_class.toLowerCase();

    if (!isDrugMatch && !isClassMatch) continue;

    const isAnaphylactic = allergy.severity === ALLERGY_SEVERITY.ANAPHYLACTIC;
    const isSevere       = allergy.severity === ALLERGY_SEVERITY.SEVERE;

    results.push(SafetyResult({
      type:     CHECK_TYPE.ALLERGY_CONFLICT,
      severity: isAnaphylactic ? SEVERITY.BLOCKED : isSevere ? SEVERITY.CRITICAL : SEVERITY.WARNING,
      title:    `Allergy conflict — ${drug.generic_name}`,
      message:  isClassMatch
        ? `Patient has a recorded ${allergy.drug_class} class allergy. ${drug.generic_name} is a ${drug.sub_class}.`
        : `Patient has a recorded allergy to ${drug.generic_name}.`,
      detail:   allergy.reaction_type
        ? `Recorded reaction: ${allergy.reaction_type}. Severity: ${allergy.severity}.`
        : null,
      canOverride:   !isAnaphylactic,
      affectedDrugs: [candidate.drug_id],
      checkId:       allergy.id,
      recommendation: isClassMatch
        ? `Consider an alternative antibiotic class. If Penicillin is essential, ensure resuscitation equipment is available.`
        : `Review allergy history. Consider alternative drug class.`,
    }));
  }

  return results;
}

// ── Check 2: Drug–Drug Interactions ──────────────────────────────────────────
function checkDrugInteractions(candidate, activePrescriptions) {
  const results = [];
  if (!activePrescriptions?.length) return results;

  for (const active of activePrescriptions) {
    if (active.drug_id === candidate.drug_id) continue; // Handled by duplicate check

    const interactions = DrugInteractionTable.findBetween(candidate.drug_id, active.drug_id);

    for (const interaction of interactions) {
      const activeDrug    = DrugTable.findById(active.drug_id);
      const candidateDrug = DrugTable.findById(candidate.drug_id);

      const severityMap = {
        [INTERACTION_SEVERITY.MILD]:     SEVERITY.INFO,
        [INTERACTION_SEVERITY.MODERATE]: SEVERITY.WARNING,
        [INTERACTION_SEVERITY.SEVERE]:   SEVERITY.CRITICAL,
        [INTERACTION_SEVERITY.CRITICAL]: SEVERITY.BLOCKED,
      };

      results.push(SafetyResult({
        type:     CHECK_TYPE.DRUG_INTERACTION,
        severity: severityMap[interaction.severity] || SEVERITY.WARNING,
        title:    `Interaction: ${candidateDrug?.generic_name} + ${activeDrug?.generic_name}`,
        message:  interaction.clinical_effect || `Potential ${interaction.severity} interaction between these two drugs.`,
        detail:   [
          interaction.mechanism    ? `Mechanism: ${interaction.mechanism}`    : null,
          interaction.management   ? `Management: ${interaction.management}`   : null,
          interaction.evidence_level ? `Evidence: Level ${interaction.evidence_level}` : null,
        ].filter(Boolean).join(" · ") || null,
        canOverride:   interaction.can_override !== false,
        affectedDrugs: [candidate.drug_id, active.drug_id],
        checkId:       interaction.id,
        recommendation: interaction.management || null,
      }));
    }
  }

  return results;
}

// ── Check 3: Duplicate Drug ───────────────────────────────────────────────────
function checkDuplicate(candidate, activePrescriptions) {
  const results = [];
  if (!activePrescriptions?.length) return results;

  const duplicate = activePrescriptions.find(p => p.drug_id === candidate.drug_id);
  if (!duplicate) return results;

  const drug = DrugTable.findById(candidate.drug_id);

  results.push(SafetyResult({
    type:          CHECK_TYPE.DUPLICATE_DRUG,
    severity:      SEVERITY.WARNING,
    title:         `Duplicate drug — ${drug?.generic_name || "Unknown"}`,
    message:       `${drug?.generic_name || "This drug"} is already on the active prescription list for this encounter.`,
    detail:        `Active entry: ${duplicate.dosage_amount} ${duplicate.dosage_unit} ${duplicate.frequency}`,
    canOverride:   true,
    affectedDrugs: [candidate.drug_id],
    checkId:       duplicate.id,
    recommendation: "Review whether both entries are intended. Consider updating the existing entry instead.",
  }));

  return results;
}

// ── Check 4: Pregnancy Contraindication ──────────────────────────────────────
function checkPregnancyContraindication(candidate, patient) {
  const results = [];
  if (!patient?.is_pregnant) return results;

  const drug = DrugTable.findById(candidate.drug_id);
  if (!drug) return results;

  const trimester = patient.trimester || null;

  const categoryMessages = {
    C: {
      severity:      SEVERITY.WARNING,
      title:         `Pregnancy caution — Category C`,
      message:       `${drug.generic_name} is Category C in pregnancy. Animal studies show adverse effects; no adequate human data.`,
      canOverride:   true,
      recommendation: "Use only if potential benefit justifies risk. Document indication.",
    },
    D: {
      severity:      SEVERITY.CRITICAL,
      title:         `Pregnancy risk — Category D`,
      message:       `${drug.generic_name} is Category D in pregnancy. Evidence of human fetal risk.`,
      canOverride:   true,
      recommendation: "Use only in life-threatening situations where safer alternatives are not available.",
    },
    X: {
      severity:      SEVERITY.BLOCKED,
      title:         `Contraindicated in pregnancy — Category X`,
      message:       `${drug.generic_name} is absolutely contraindicated in pregnancy (Category X).`,
      canOverride:   false,
      recommendation: "Do not prescribe. Select an alternative.",
    },
  };

  // Special trimester-specific rules
  const isNSAID = drug.therapeutic_class === "NSAID";
  if (isNSAID && trimester === 3) {
    results.push(SafetyResult({
      type:          CHECK_TYPE.PREGNANCY_CONTRAINDICATION,
      severity:      SEVERITY.BLOCKED,
      title:         "NSAIDs contraindicated in third trimester",
      message:       `${drug.generic_name} is an NSAID and is contraindicated in the third trimester of pregnancy.`,
      detail:        "Risk of premature closure of ductus arteriosus and neonatal renal failure.",
      canOverride:   false,
      affectedDrugs: [candidate.drug_id],
      recommendation: "Use paracetamol for analgesia in third trimester.",
    }));
    return results;
  }

  const rule = categoryMessages[drug.pregnancy_category];
  if (!rule) return results;

  results.push(SafetyResult({
    type:          CHECK_TYPE.PREGNANCY_CONTRAINDICATION,
    severity:      rule.severity,
    title:         rule.title,
    message:       rule.message,
    detail:        `Pregnancy category: ${drug.pregnancy_category}. ${trimester ? `Patient is in trimester ${trimester}.` : "Trimester not recorded."}`,
    canOverride:   rule.canOverride,
    affectedDrugs: [candidate.drug_id],
    recommendation: rule.recommendation,
  }));

  return results;
}

// ── Check 5: Age Restriction ──────────────────────────────────────────────────
function checkAgeRestriction(candidate, patient) {
  const results = [];
  if (patient?.age_years == null) return results;

  const drug   = DrugTable.findById(candidate.drug_id);
  const ranges = DosageRangeTable.findForAge(candidate.drug_id, patient.age_years);

  // No dosage range defined for this age group
  if (ranges.length === 0) {
    const allRanges = DosageRangeTable.findByDrugId(candidate.drug_id);
    if (allRanges.length > 0) {
      const minAge = Math.min(...allRanges.map(r => r.age_min_years));
      const maxAge = Math.max(...allRanges.map(r => r.age_max_years));

      if (patient.age_years < minAge) {
        results.push(SafetyResult({
          type:          CHECK_TYPE.AGE_RESTRICTION,
          severity:      SEVERITY.CRITICAL,
          title:         `Age restriction — ${drug?.generic_name}`,
          message:       `${drug?.generic_name} is not approved for patients under ${minAge} years. Patient is ${patient.age_years} years old.`,
          canOverride:   true,
          affectedDrugs: [candidate.drug_id],
          recommendation: `Check approved alternatives for patients under ${minAge} years.`,
        }));
      }

      if (patient.age_years > maxAge) {
        results.push(SafetyResult({
          type:          CHECK_TYPE.AGE_RESTRICTION,
          severity:      SEVERITY.WARNING,
          title:         `Age consideration — ${drug?.generic_name}`,
          message:       `No dosage range defined for patients over ${maxAge} years. Use clinical judgment.`,
          canOverride:   true,
          affectedDrugs: [candidate.drug_id],
        }));
      }
    }
  }

  // Ciprofloxacin-specific: fluoroquinolones contraindicated in children <18
  if (
    drug?.sub_class?.toLowerCase().includes("fluoroquinolone") &&
    patient.age_years < 18
  ) {
    results.push(SafetyResult({
      type:          CHECK_TYPE.AGE_RESTRICTION,
      severity:      SEVERITY.CRITICAL,
      title:         `Fluoroquinolone — contraindicated under 18`,
      message:       `${drug.generic_name} (fluoroquinolone class) is generally contraindicated in patients under 18 years due to risk of cartilage toxicity.`,
      detail:        "This class of antibiotics can cause arthropathy in growing joints.",
      canOverride:   true,
      affectedDrugs: [candidate.drug_id],
      recommendation: "Use an age-appropriate antibiotic. Consider co-amoxiclav, cefuroxime, or azithromycin depending on indication.",
    }));
  }

  // Tetracycline-specific: contraindicated in children <8
  if (
    drug?.sub_class?.toLowerCase().includes("tetracycline") &&
    patient.age_years < 8
  ) {
    results.push(SafetyResult({
      type:          CHECK_TYPE.AGE_RESTRICTION,
      severity:      SEVERITY.CRITICAL,
      title:         `Tetracycline — contraindicated under 8`,
      message:       `${drug.generic_name} (tetracycline class) is contraindicated in patients under 8 years due to permanent tooth discolouration.`,
      canOverride:   true,
      affectedDrugs: [candidate.drug_id],
    }));
  }

  return results;
}

// ── Check 6: Pediatric Dose Validation ───────────────────────────────────────
function checkPediatricDose(candidate, patient) {
  const results = [];
  if (!patient?.weight_kg || patient.age_years == null || patient.age_years >= 18) return results;

  const ranges = DosageRangeTable.findForAge(candidate.drug_id, patient.age_years);
  if (!ranges.length) return results;

  const drug  = DrugTable.findById(candidate.drug_id);
  const range = ranges[0];

  if (!range.max_dose_mg_per_kg) return results;

  // Determine dose in mg. candidate.dosage_amount may be in tablets — we need mg.
  // The engine expects the candidate to carry a resolved_dose_mg if available.
  const resolvedDoseMg = candidate.resolved_dose_mg || null;
  if (!resolvedDoseMg) return results;

  const maxAllowedMg = range.max_dose_mg_per_kg * patient.weight_kg;

  if (resolvedDoseMg > maxAllowedMg) {
    results.push(SafetyResult({
      type:     CHECK_TYPE.PEDIATRIC_DOSE_EXCEEDED,
      severity: SEVERITY.CRITICAL,
      title:    `Pediatric dose exceeded — ${drug?.generic_name}`,
      message:  `Prescribed dose (${resolvedDoseMg}mg) exceeds the maximum pediatric dose of ${range.max_dose_mg_per_kg}mg/kg for this patient (max ${maxAllowedMg.toFixed(1)}mg for ${patient.weight_kg}kg).`,
      detail:   `Recommended: ${range.min_dose_mg_per_kg || "—"}–${range.max_dose_mg_per_kg}mg/kg. Patient weight: ${patient.weight_kg}kg.`,
      canOverride:   true,
      affectedDrugs: [candidate.drug_id],
      recommendation: `Reduce dose to ${(range.max_dose_mg_per_kg * patient.weight_kg).toFixed(0)}mg or less per dose.`,
    }));
  }

  return results;
}

// ── Check 7: Max Daily Dose ───────────────────────────────────────────────────
function checkMaxDailyDose(candidate, patient) {
  const results = [];

  const age = patient?.age_years ?? 999;
  const ranges = DosageRangeTable.findForAge(candidate.drug_id, age);
  if (!ranges.length) return results;

  const drug  = DrugTable.findById(candidate.drug_id);
  const range = ranges[0];
  if (!range.max_daily_dose_mg) return results;

  const resolvedDoseMg     = candidate.resolved_dose_mg || null;
  const timesPerDay        = candidate.times_per_day    || null;
  if (!resolvedDoseMg || !timesPerDay) return results;

  const projectedDailyDose = resolvedDoseMg * timesPerDay;

  if (projectedDailyDose > range.max_daily_dose_mg) {
    results.push(SafetyResult({
      type:     CHECK_TYPE.MAX_DOSE_EXCEEDED,
      severity: SEVERITY.CRITICAL,
      title:    `Maximum daily dose exceeded — ${drug?.generic_name}`,
      message:  `Projected daily dose (${projectedDailyDose}mg/day) exceeds the maximum of ${range.max_daily_dose_mg}mg/day.`,
      detail:   `${resolvedDoseMg}mg × ${timesPerDay}x/day = ${projectedDailyDose}mg. Maximum: ${range.max_daily_dose_mg}mg/day.`,
      canOverride:   true,
      affectedDrugs: [candidate.drug_id],
      recommendation: `Reduce dose or frequency. Maximum: ${range.max_daily_dose_mg}mg/day.`,
    }));
  }

  return results;
}

// ── Check 8: Renal Caution ────────────────────────────────────────────────────
function checkRenalCaution(candidate, patient) {
  const results = [];
  if (!patient?.has_renal_impairment) return results;

  const ranges = DosageRangeTable.findByDrugId(candidate.drug_id);
  const needsAdjustment = ranges.some(r => r.renal_adjustment);
  if (!needsAdjustment) return results;

  const drug = DrugTable.findById(candidate.drug_id);

  results.push(SafetyResult({
    type:     CHECK_TYPE.RENAL_CAUTION,
    severity: SEVERITY.WARNING,
    title:    `Renal dose adjustment — ${drug?.generic_name}`,
    message:  `${drug?.generic_name} requires dose adjustment in renal impairment. Patient has documented renal impairment.`,
    detail:   "Review current eGFR and adjust dose accordingly. Refer to local renal dosing guidelines.",
    canOverride:   true,
    affectedDrugs: [candidate.drug_id],
    recommendation: "Check eGFR and apply renal dose adjustment per formulary guidelines.",
  }));

  return results;
}

// ── Check 9: Hepatic Caution ──────────────────────────────────────────────────
function checkHepaticCaution(candidate, patient) {
  const results = [];
  if (!patient?.has_hepatic_impairment) return results;

  const ranges = DosageRangeTable.findByDrugId(candidate.drug_id);
  const needsAdjustment = ranges.some(r => r.hepatic_adjustment);
  if (!needsAdjustment) return results;

  const drug = DrugTable.findById(candidate.drug_id);

  results.push(SafetyResult({
    type:     CHECK_TYPE.HEPATIC_CAUTION,
    severity: SEVERITY.WARNING,
    title:    `Hepatic dose adjustment — ${drug?.generic_name}`,
    message:  `${drug?.generic_name} requires caution or dose reduction in hepatic impairment.`,
    detail:   "Review liver function and adjust accordingly.",
    canOverride:   true,
    affectedDrugs: [candidate.drug_id],
    recommendation: "Assess Child-Pugh score. Reduce dose if significant hepatic impairment.",
  }));

  return results;
}

// ── Check 10: Completeness (Missing Fields) ───────────────────────────────────
function checkCompleteness(candidate) {
  const results = [];
  const drug = DrugTable.findById(candidate.drug_id);

  if (!candidate.frequency) {
    results.push(SafetyResult({
      type:          CHECK_TYPE.MISSING_FREQUENCY,
      severity:      SEVERITY.WARNING,
      title:         "Frequency not specified",
      message:       `No frequency specified for ${drug?.generic_name || "this drug"}. Frequency is required for dispensing.`,
      canOverride:   false,
      affectedDrugs: [candidate.drug_id],
      recommendation: "Select a frequency (OD, BD, TDS, PRN, etc.)",
    }));
  }

  if (drug?.is_antibiotic && !candidate.duration_days) {
    results.push(SafetyResult({
      type:          CHECK_TYPE.MISSING_DURATION,
      severity:      SEVERITY.WARNING,
      title:         "Duration missing for antibiotic",
      message:       `${drug.generic_name} is an antibiotic. A treatment duration is required to support antibiotic stewardship.`,
      canOverride:   true,
      affectedDrugs: [candidate.drug_id],
      recommendation: "Specify duration in days.",
    }));
  }

  return results;
}

// ── Check 11: Controlled Substance ───────────────────────────────────────────
function checkControlledSubstance(candidate) {
  const results = [];
  const drug = DrugTable.findById(candidate.drug_id);
  if (!drug?.is_controlled) return results;

  results.push(SafetyResult({
    type:     CHECK_TYPE.CONTROLLED_SUBSTANCE,
    severity: SEVERITY.INFO,
    title:    `Controlled substance — ${drug.generic_name}`,
    message:  `${drug.generic_name} is a controlled substance. Prescription will be flagged in the audit log.`,
    canOverride:   true,
    affectedDrugs: [candidate.drug_id],
    recommendation: "Ensure prescription is compliant with NAFDAC controlled substance regulations.",
  }));

  return results;
}

// ─── Safety Engine ────────────────────────────────────────────────────────────

export const SafetyEngine = {

  // ── Main entry point ──────────────────────────────────────────────────────
  // Returns all safety findings for a single prescription candidate.
  //
  // @param candidate          - The prescription being added (see shape above)
  // @param activePrescriptions - Other drugs already in this encounter
  // @param patient             - Patient context (age, weight, pregnancy, allergies, etc.)
  //
  // @returns SafetyResult[]

  check({ candidate, activePrescriptions = [], patient = {} }) {
    if (!candidate?.drug_id) return [];

    const results = [
      ...checkAllergyConflict(candidate, patient),
      ...checkDrugInteractions(candidate, activePrescriptions),
      ...checkDuplicate(candidate, activePrescriptions),
      ...checkPregnancyContraindication(candidate, patient),
      ...checkAgeRestriction(candidate, patient),
      ...checkPediatricDose(candidate, patient),
      ...checkMaxDailyDose(candidate, patient),
      ...checkRenalCaution(candidate, patient),
      ...checkHepaticCaution(candidate, patient),
      ...checkCompleteness(candidate),
      ...checkControlledSubstance(candidate),
    ];

    // Sort by severity: blocked → critical → warning → info
    const order = {
      [SEVERITY.BLOCKED]:  0,
      [SEVERITY.CRITICAL]: 1,
      [SEVERITY.WARNING]:  2,
      [SEVERITY.INFO]:     3,
    };

    return results.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  },

  // ── Batch check ───────────────────────────────────────────────────────────
  // Check all drugs in a prescription list against each other.
  // Returns { drug_id, results }[]

  checkAll({ prescriptions = [], patient = {} }) {
    return prescriptions.map((candidate, idx) => {
      const others = prescriptions.filter((_, i) => i !== idx);
      return {
        drug_id: candidate.drug_id,
        results: this.check({ candidate, activePrescriptions: others, patient }),
      };
    });
  },

  // ── Convenience helpers ───────────────────────────────────────────────────

  // Highest severity in a result set
  maxSeverity(results) {
    const order = [SEVERITY.BLOCKED, SEVERITY.CRITICAL, SEVERITY.WARNING, SEVERITY.INFO];
    for (const s of order) {
      if (results.some(r => r.severity === s)) return s;
    }
    return null;
  },

  // Is the prescription saveable? (No blocked results, and no critical without override)
  canSave(results, overrideReasons = {}) {
    const blocked  = results.filter(r => r.severity === SEVERITY.BLOCKED);
    const critical = results.filter(r => r.severity === SEVERITY.CRITICAL && !r.canOverride);
    const criticalUnoverridable = critical.filter(r => !overrideReasons[r.checkId || r.type]);

    return blocked.length === 0 && criticalUnoverridable.length === 0;
  },

  // Returns critical/blocked results that still need override reasons
  pendingOverrides(results, overrideReasons = {}) {
    return results.filter(r =>
      (r.severity === SEVERITY.CRITICAL || r.severity === SEVERITY.BLOCKED) &&
      r.canOverride &&
      !overrideReasons[r.checkId || r.type]
    );
  },

  // Summary counts
  summarise(results) {
    return {
      total:    results.length,
      blocked:  results.filter(r => r.severity === SEVERITY.BLOCKED).length,
      critical: results.filter(r => r.severity === SEVERITY.CRITICAL).length,
      warning:  results.filter(r => r.severity === SEVERITY.WARNING).length,
      info:     results.filter(r => r.severity === SEVERITY.INFO).length,
    };
  },
};

// ─── Override Logger ──────────────────────────────────────────────────────────
// Tracks override decisions in-session before the prescription is saved.
// The saved prescription record stores these in safety_checks_run[].

export class OverrideLog {
  constructor() {
    this._log = {};
  }

  // Record that a doctor has overridden a specific check
  add(checkType, reason, prescribedBy) {
    this._log[checkType] = {
      checkType,
      reason,
      prescribedBy,
      at: new Date().toISOString(),
    };
  }

  // Remove an override (doctor changed their mind)
  remove(checkType) {
    delete this._log[checkType];
  }

  has(checkType) {
    return !!this._log[checkType];
  }

  // Returns all overrides as an array for storage in the prescription record
  toArray() {
    return Object.values(this._log);
  }

  // Returns a plain object keyed by checkType — used by canSave()
  toMap() {
    return { ...this._log };
  }

  clear() {
    this._log = {};
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  SafetyResult,
};
