// ─────────────────────────────────────────────────────────────────────────────
// AleraParser.js
// Deterministic prescription abbreviation parser.
// Converts Nigerian medical shorthand into structured prescription fields.
// No AI. No network calls. Pure string processing.
//
// Usage:
//   import { parseRx } from "./AleraParser.js";
//
//   const result = parseRx("amox 500 tds 5d");
//   // {
//   //   raw:       "amox 500 tds 5d",
//   //   drug:      { query: "amox", matched: [...], best: {...}, confident: true },
//   //   strength:  { value: 500, unit: "mg", label: "500mg", raw: "500" },
//   //   frequency: { key: "TDS", label: "TDS", full: "Three times daily", timesPerDay: 3 },
//   //   duration:  { days: 5, raw: "5d", label: "5 days" },
//   //   route:     null,
//   //   flags:     [],
//   //   confidence: 0.95,
//   // }
// ─────────────────────────────────────────────────────────────────────────────

import { searchDrugs } from "./AleraDrugSchema.js";

// ─── Frequency Dictionary ─────────────────────────────────────────────────────
// Nigerian + international prescribing shorthand.
// Keys are lowercase tokens. Each entry is the canonical FREQUENCY object.

const FREQUENCY_MAP = {
  // Standard
  "od":     { key: "OD",    full: "Once daily",          timesPerDay: 1    },
  "bd":     { key: "BD",    full: "Twice daily",          timesPerDay: 2    },
  "bid":    { key: "BD",    full: "Twice daily",          timesPerDay: 2    },
  "tds":    { key: "TDS",   full: "Three times daily",    timesPerDay: 3    },
  "tid":    { key: "TDS",   full: "Three times daily",    timesPerDay: 3    },
  "qid":    { key: "QID",   full: "Four times daily",     timesPerDay: 4    },
  "qds":    { key: "QID",   full: "Four times daily",     timesPerDay: 4    },
  "prn":    { key: "PRN",   full: "As needed",            timesPerDay: null },
  "stat":   { key: "STAT",  full: "Immediately (once)",   timesPerDay: 1    },
  "nocte":  { key: "NOCTE", full: "At night",             timesPerDay: 1    },
  "mane":   { key: "MANE",  full: "In the morning",       timesPerDay: 1    },
  "weekly": { key: "WEEKLY",full: "Once weekly",          timesPerDay: null },
  "q4h":    { key: "Q4H",   full: "Every 4 hours",        timesPerDay: 6    },
  "q6h":    { key: "Q6H",   full: "Every 6 hours",        timesPerDay: 4    },
  "q8h":    { key: "Q8H",   full: "Every 8 hours",        timesPerDay: 3    },
  "q12h":   { key: "Q12H",  full: "Every 12 hours",       timesPerDay: 2    },
  // Common verbose forms
  "once daily":         { key: "OD",    full: "Once daily",       timesPerDay: 1 },
  "twice daily":        { key: "BD",    full: "Twice daily",      timesPerDay: 2 },
  "twice a day":        { key: "BD",    full: "Twice daily",      timesPerDay: 2 },
  "three times daily":  { key: "TDS",   full: "Three times daily",timesPerDay: 3 },
  "three times a day":  { key: "TDS",   full: "Three times daily",timesPerDay: 3 },
  "four times daily":   { key: "QID",   full: "Four times daily", timesPerDay: 4 },
  "four times a day":   { key: "QID",   full: "Four times daily", timesPerDay: 4 },
  "as needed":          { key: "PRN",   full: "As needed",        timesPerDay: null },
  "at night":           { key: "NOCTE", full: "At night",         timesPerDay: 1 },
  "at bedtime":         { key: "NOCTE", full: "At night",         timesPerDay: 1 },
  "in the morning":     { key: "MANE",  full: "In the morning",   timesPerDay: 1 },
  "morning":            { key: "MANE",  full: "In the morning",   timesPerDay: 1 },
  "night":              { key: "NOCTE", full: "At night",         timesPerDay: 1 },
  "nightly":            { key: "NOCTE", full: "At night",         timesPerDay: 1 },
  "daily":              { key: "OD",    full: "Once daily",       timesPerDay: 1 },
};

// ─── Route Dictionary ─────────────────────────────────────────────────────────

const ROUTE_MAP = {
  "oral":    "oral",
  "po":      "oral",
  "by mouth":"oral",
  "iv":      "intravenous",
  "i.v":     "intravenous",
  "intravenous": "intravenous",
  "im":      "intramuscular",
  "i.m":     "intramuscular",
  "intramuscular": "intramuscular",
  "sc":      "subcutaneous",
  "s.c":     "subcutaneous",
  "subcutaneous": "subcutaneous",
  "top":     "topical",
  "topical": "topical",
  "sl":      "sublingual",
  "sublingual": "sublingual",
  "pr":      "rectal",
  "rectal":  "rectal",
  "inh":     "inhalation",
  "inhaled": "inhalation",
  "inhalation": "inhalation",
};

// ─── Unit Normalisation ───────────────────────────────────────────────────────
// Converts all strength values to mg for safety engine.

const UNIT_TO_MG = {
  "mcg":  0.001,
  "ug":   0.001,
  "mg":   1,
  "g":    1000,
  "gm":   1000,
  "gram": 1000,
  "grams":1000,
  "ml":   null,   // Cannot convert volume — returned as-is
  "iu":   null,   // Cannot convert units — returned as-is
  "units":null,
};

// ─── Duration Patterns ────────────────────────────────────────────────────────
// All resolve to { days: number, raw: string, label: string }

const DURATION_PATTERNS = [
  // Nigerian shorthand: 3/7 = 3 days, 1/52 = 1 week, 2/12 = 2 months
  {
    re: /\b(\d+)\/7\b/,
    parse: (m) => ({ days: parseInt(m[1]), label: `${m[1]} day${m[1] === "1" ? "" : "s"}`, raw: m[0] }),
  },
  {
    re: /\b(\d+)\/52\b/,
    parse: (m) => ({ days: parseInt(m[1]) * 7, label: `${m[1]} week${m[1] === "1" ? "" : "s"}`, raw: m[0] }),
  },
  {
    re: /\b(\d+)\/12\b/,
    parse: (m) => ({ days: parseInt(m[1]) * 30, label: `${m[1]} month${m[1] === "1" ? "" : "s"}`, raw: m[0] }),
  },
  // Standard: 5d, 7days, 7 days
  {
    re: /\b(\d+)\s*days?\b/i,
    parse: (m) => ({ days: parseInt(m[1]), label: `${m[1]} day${m[1] === "1" ? "" : "s"}`, raw: m[0] }),
  },
  // Weeks: 2w, 2wks, 2weeks
  {
    re: /\b(\d+)\s*w(?:ks?|eeks?)?\b/i,
    parse: (m) => ({ days: parseInt(m[1]) * 7, label: `${m[1]} week${m[1] === "1" ? "" : "s"}`, raw: m[0] }),
  },
  // Months: 1m, 1mo, 1month
  {
    re: /\b(\d+)\s*m(?:o|onths?)?\b/i,
    parse: (m) => ({
      days: parseInt(m[1]) * 30,
      label: `${m[1]} month${m[1] === "1" ? "" : "s"}`,
      raw: m[0]
    }),
    // Disambiguation: don't match single "m" if preceded by a digit (e.g. "500mg")
    guard: (raw, m) => {
      const before = raw.slice(0, raw.indexOf(m[0]));
      return !/\d\s*$/.test(before) || /\bm(?:o|onths?)\b/i.test(m[0]);
    },
  },
  // Shorthand: 5d
  {
    re: /\b(\d+)d\b/i,
    parse: (m) => ({ days: parseInt(m[1]), label: `${m[1]} days`, raw: m[0] }),
  },
];

// ─── Strength Patterns ────────────────────────────────────────────────────────
// Matches: 500, 500mg, 1g, 250mcg, 125mg/5ml (for suspensions), 80/480mg

const STRENGTH_PATTERNS = [
  // Combination: 80/480mg (e.g. Coartem)
  {
    re: /\b(\d+)\/(\d+)\s*(mg|g|mcg|ug)?\b/i,
    parse: (m) => ({
      value:     parseFloat(m[1]),
      secondValue: parseFloat(m[2]),
      unit:      (m[3] || "mg").toLowerCase(),
      label:     `${m[1]}/${m[2]}${(m[3] || "mg").toLowerCase()}`,
      raw:       m[0],
      isCombination: true,
    }),
    guard: (raw, m) => {
      // Don't match duration patterns like 3/7 or 1/52
      const second = parseInt(m[2]);
      return second !== 7 && second !== 52 && second !== 12;
    },
  },
  // Standard: 500mg, 1g, 250mcg, 5ml
  {
    re: /\b(\d+(?:\.\d+)?)\s*(mg|g|gm|grams?|mcg|ug|ml|iu|units?)\b/i,
    parse: (m) => {
      const raw_unit = m[2].toLowerCase().replace(/s$/, "");
      const factor   = UNIT_TO_MG[raw_unit] ?? null;
      const value    = parseFloat(m[1]);
      return {
        value,
        unit:      raw_unit,
        unitLabel: m[2],
        label:     `${m[1]}${m[2].toLowerCase()}`,
        raw:       m[0],
        mg:        factor ? value * factor : null,
      };
    },
  },
  // Bare number that looks like a dose (100–2000 range, not a duration)
  {
    re: /\b(\d{3,4})\b/,
    parse: (m) => ({
      value:    parseFloat(m[1]),
      unit:     "mg",
      unitLabel:"mg",
      label:    `${m[1]}mg`,
      raw:      m[0],
      mg:       parseFloat(m[1]),
      inferred: true,
    }),
    // Only fire if no unit-bearing strength was found, and value is plausible dose range
    isLowPriority: true,
  },
];

// ─── Fuzzy Drug Matching ──────────────────────────────────────────────────────
// Scores a query against a candidate drug name.

function scoreDrugMatch(query, name) {
  const q = query.toLowerCase().trim();
  const n = name.toLowerCase().trim();

  if (n === q)                          return 1.0;   // Exact
  if (n.startsWith(q))                  return 0.95;  // Prefix exact
  if (q.length >= 4 && n.startsWith(q)) return 0.9;
  if (q.length >= 3 && n.startsWith(q)) return 0.85;

  // Abbreviation match: first letters of each word
  const initials = n.split(/[\s\/\-]/).map(w => w[0]).join("");
  if (initials === q)                   return 0.8;

  // Contains substring
  if (n.includes(q) && q.length >= 3)  return 0.75;
  if (q.includes(n) && n.length >= 3)  return 0.7;

  return 0;
}

function findBestDrugMatch(query) {
  if (!query || query.trim().length < 2) {
    return { matched: [], best: null, confident: false, ambiguous: false };
  }

  const results = searchDrugs(query.trim());

  // Score each result
  const scored = results.map(r => {
    const genericScore = scoreDrugMatch(query, r.drug.generic_name);
    const brandScores  = r.brands.map(b => scoreDrugMatch(query, b.brand_name));
    const brandScore   = brandScores.length ? Math.max(...brandScores) : 0;
    const score        = Math.max(genericScore, brandScore);
    const matchedViaBrand = brandScore > genericScore;
    const matchedBrand = matchedViaBrand
      ? r.brands[brandScores.indexOf(brandScore)]
      : null;

    return { ...r, score, matchedViaBrand, matchedBrand };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return { matched: [], best: null, confident: false, ambiguous: false };
  }

  const best      = scored[0];
  const confident = best.score >= 0.75;
  const ambiguous = scored.length > 1 && scored[1].score >= best.score - 0.1;

  return {
    matched:  scored,
    best:     confident ? best : null,
    confident,
    ambiguous,
    query,
  };
}

// ─── Token Extraction Helpers ─────────────────────────────────────────────────

function extractFrequency(tokens) {
  // Try multi-word phrases first (longest match wins)
  const joined = tokens.join(" ").toLowerCase();
  const phrases = Object.keys(FREQUENCY_MAP).sort((a, b) => b.length - a.length);

  for (const phrase of phrases) {
    if (joined.includes(phrase)) {
      return {
        found:      FREQUENCY_MAP[phrase],
        raw:        phrase,
        tokenCount: phrase.split(" ").length,
      };
    }
  }

  // Try individual tokens
  for (const token of tokens) {
    const t = token.toLowerCase();
    if (FREQUENCY_MAP[t]) {
      return { found: FREQUENCY_MAP[t], raw: token, tokenCount: 1 };
    }
  }

  return null;
}

function extractRoute(tokens) {
  for (const token of tokens) {
    const t = token.toLowerCase().replace(/\./g, "");
    if (ROUTE_MAP[t]) {
      return { found: ROUTE_MAP[t], raw: token };
    }
  }
  return null;
}

function extractDuration(raw) {
  for (const pattern of DURATION_PATTERNS) {
    const m = raw.match(pattern.re);
    if (m) {
      if (pattern.guard && !pattern.guard(raw, m)) continue;
      return pattern.parse(m);
    }
  }
  return null;
}

function extractStrength(raw) {
  // Try patterns in priority order
  const highPriority = STRENGTH_PATTERNS.filter(p => !p.isLowPriority);
  const lowPriority  = STRENGTH_PATTERNS.filter(p =>  p.isLowPriority);

  for (const pattern of highPriority) {
    const m = raw.match(pattern.re);
    if (m) {
      if (pattern.guard && !pattern.guard(raw, m)) continue;
      return pattern.parse(m);
    }
  }

  for (const pattern of lowPriority) {
    const m = raw.match(pattern.re);
    if (m) return pattern.parse(m);
  }

  return null;
}

// ─── Drug Query Isolation ─────────────────────────────────────────────────────
// Strips out known non-drug tokens to isolate the drug query.

function isolateDrugQuery(raw) {
  let s = raw;

  // Remove duration tokens
  for (const pattern of DURATION_PATTERNS) {
    s = s.replace(pattern.re, " ");
  }

  // Remove strength tokens
  for (const pattern of STRENGTH_PATTERNS.filter(p => !p.isLowPriority)) {
    s = s.replace(pattern.re, " ");
  }

  // Remove frequency tokens
  const phrases = Object.keys(FREQUENCY_MAP).sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    const re = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "gi");
    s = s.replace(re, " ");
  }

  // Remove route tokens
  for (const route of Object.keys(ROUTE_MAP)) {
    const re = new RegExp(`\\b${route.replace(/\./g, "\\.")}\\b`, "gi");
    s = s.replace(re, " ");
  }

  // Remove common connectors
  s = s.replace(/\b(x|for|×|tab|tabs|cap|caps|sachet)\b/gi, " ");

  return s.replace(/\s+/g, " ").trim();
}

// ─── Confidence Scorer ────────────────────────────────────────────────────────
// Overall parse confidence based on what was found.

function scoreConfidence({ drug, strength, frequency, duration }) {
  let score = 0;
  let total = 0;

  // Drug match (most important)
  total += 40;
  if (drug.best)           score += 40;
  else if (drug.matched.length) score += 20;

  // Frequency
  total += 25;
  if (frequency)           score += 25;

  // Strength
  total += 20;
  if (strength && !strength.inferred) score += 20;
  else if (strength)       score += 10;

  // Duration
  total += 15;
  if (duration)            score += 15;

  return parseFloat((score / total).toFixed(2));
}

// ─── Flag Generator ───────────────────────────────────────────────────────────
// Returns human-readable flags for the UI to display.

function generateFlags({ drug, strength, frequency, duration, raw }) {
  const flags = [];

  if (!drug.best && drug.matched.length === 0) {
    flags.push({ type: "error", message: `No drug found matching "${drug.query}"` });
  } else if (!drug.best && drug.matched.length > 0) {
    flags.push({ type: "warning", message: `Uncertain drug match — did you mean ${drug.matched.slice(0, 2).map(r => r.drug.generic_name).join(" or ")}?` });
  } else if (drug.ambiguous) {
    flags.push({ type: "info", message: `Multiple drugs match — please confirm: ${drug.matched.slice(0, 2).map(r => r.drug.generic_name).join(" or ")}` });
  }

  if (!frequency) {
    flags.push({ type: "warning", message: "Frequency not detected — please specify (e.g. OD, BD, TDS, PRN)" });
  }

  if (!strength) {
    flags.push({ type: "info", message: "Strength not detected — default strength will be used if drug is matched" });
  } else if (strength.inferred) {
    flags.push({ type: "info", message: `Strength inferred as ${strength.label} — confirm if correct` });
  }

  if (!duration && drug.best?.drug?.is_antibiotic) {
    flags.push({ type: "warning", message: "Duration missing for antibiotic — required for antibiotic stewardship" });
  }

  return flags;
}

// ─── Patient-Friendly Instruction Generator ───────────────────────────────────
// Converts structured fields into a plain-English instruction string.

export function generateInstruction({ drugName, strength, frequency, duration, route = null }) {
  const parts = [];

  // Verb
  const isInjection = route === "intravenous" || route === "intramuscular";
  parts.push(isInjection ? "Administer" : "Take");

  // Strength / amount
  if (strength) {
    parts.push(`${strength.label}`);
  }

  // Drug name
  if (drugName) {
    parts.push(`of ${drugName}`);
  }

  // Route
  if (route && route !== "oral") {
    const routeLabel = {
      intravenous:    "intravenously",
      intramuscular:  "by injection",
      topical:        "applied to the skin",
      sublingual:     "under the tongue",
      rectal:         "rectally",
      inhalation:     "by inhalation",
    }[route] || route;
    parts.push(routeLabel);
  }

  // Frequency
  if (frequency) {
    const freqLabel = {
      OD:     "once daily",
      BD:     "twice daily",
      TDS:    "three times daily",
      QID:    "four times daily",
      PRN:    "as needed",
      STAT:   "immediately",
      NOCTE:  "at night",
      MANE:   "in the morning",
      Q4H:    "every 4 hours",
      Q6H:    "every 6 hours",
      Q8H:    "every 8 hours",
      Q12H:   "every 12 hours",
      WEEKLY: "once a week",
    }[frequency.key] || frequency.full.toLowerCase();
    parts.push(freqLabel);
  }

  // Duration
  if (duration) {
    parts.push(`for ${duration.label}`);
  }

  return parts.join(" ") + ".";
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

export function parseRx(input) {
  if (!input || !input.trim()) {
    return {
      raw:       "",
      drug:      { query: "", matched: [], best: null, confident: false, ambiguous: false },
      strength:  null,
      frequency: null,
      duration:  null,
      route:     null,
      flags:     [{ type: "error", message: "Empty input" }],
      confidence: 0,
      instruction: null,
    };
  }

  const raw = input.trim();

  // ── Step 1: Extract duration ────────────────────────────────────────────
  const duration = extractDuration(raw);

  // ── Step 2: Extract strength ────────────────────────────────────────────
  // Guard: if a duration was found containing a bare number, exclude that number from strength
  let strengthSource = raw;
  if (duration?.raw) {
    strengthSource = strengthSource.replace(duration.raw, "DURATION_PLACEHOLDER");
  }
  const strength = extractStrength(strengthSource);

  // ── Step 3: Extract frequency ────────────────────────────────────────────
  const tokens    = raw.split(/\s+/);
  const freqMatch = extractFrequency(tokens);
  const frequency = freqMatch ? freqMatch.found : null;

  // ── Step 4: Extract route ────────────────────────────────────────────────
  const routeMatch = extractRoute(tokens);
  const route      = routeMatch ? routeMatch.found : null;

  // ── Step 5: Isolate drug query ───────────────────────────────────────────
  const drugQuery = isolateDrugQuery(raw);

  // ── Step 6: Match drug ───────────────────────────────────────────────────
  const drug = findBestDrugMatch(drugQuery);

  // ── Step 7: Resolve default strength if needed ───────────────────────────
  // If no strength found but drug matched, pull the default strength
  const resolvedStrength = strength || (
    drug.best?.defaultStrength
      ? {
          value:    drug.best.defaultStrength.strength_value,
          unit:     drug.best.defaultStrength.strength_unit,
          label:    drug.best.defaultStrength.strength_label,
          raw:      "(default)",
          inferred: true,
        }
      : null
  );

  // ── Step 8: Calculate resolved_dose_mg and times_per_day ─────────────────
  // These are consumed by the safety engine for dose range checks.
  const resolvedDoseMg = resolvedStrength?.mg ?? null;
  const timesPerDay    = frequency?.timesPerDay ?? null;

  // ── Step 9: Confidence + flags ───────────────────────────────────────────
  const confidence = scoreConfidence({ drug, strength: resolvedStrength, frequency, duration });
  const flags      = generateFlags({ drug, strength: resolvedStrength, frequency, duration, raw });

  // ── Step 10: Generate instruction ───────────────────────────────────────
  const instruction = drug.best
    ? generateInstruction({
        drugName:  drug.best.drug.generic_name,
        strength:  resolvedStrength,
        frequency,
        duration,
        route,
      })
    : null;

  return {
    raw,
    drug,
    strength:         resolvedStrength,
    frequency,
    duration,
    route,
    flags,
    confidence,
    instruction,
    // Fields consumed directly by the safety engine:
    resolved_dose_mg: resolvedDoseMg,
    times_per_day:    timesPerDay,
    // Convenience: build a prescription candidate for the safety engine
    toCandidate: () => ({
      drug_id:          drug.best?.drug?.id        ?? null,
      strength_id:      drug.best?.defaultStrength?.id ?? null,
      dosage_amount:    resolvedStrength?.value     ?? null,
      dosage_unit:      resolvedStrength?.unit      ?? null,
      frequency:        frequency?.key              ?? null,
      duration_days:    duration?.days              ?? null,
      route:            route                       ?? "oral",
      resolved_dose_mg: resolvedDoseMg,
      times_per_day:    timesPerDay,
    }),
  };
}

// ─── Batch Parser ─────────────────────────────────────────────────────────────
// Parse multiple lines at once (e.g. pasted prescription text).

export function parseRxBatch(text) {
  const lines = text
    .split(/\n/)
    .map(l => l.trim())
    .filter(l => l.length > 2);

  return lines.map(line => parseRx(line));
}

// ─── Structured → String (Reverse) ───────────────────────────────────────────
// Convert a structured prescription back to a compact abbreviation string.
// Used when displaying a confirmed prescription in a condensed view.

export function formatRx({ drugName, strength, frequency, duration, route }) {
  const parts = [drugName];
  if (strength)  parts.push(strength.label);
  if (frequency) parts.push(frequency.key);
  if (duration)  parts.push(`${duration.days}d`);
  if (route && route !== "oral") parts.push(`(${route})`);
  return parts.join(" ");
}

// ─── Test Harness ─────────────────────────────────────────────────────────────
// Call testParser() in development to verify parser against known inputs.

export function testParser() {
  const CASES = [
    // [input, expected_drug_prefix, expected_freq, expected_duration_days, expected_strength_value]
    ["amox 500 tds 5d",            "amoxicillin",    "TDS",   5,   500 ],
    ["amox 500mg tds 5 days",      "amoxicillin",    "TDS",   5,   500 ],
    ["Amoxicillin 500 TDS 5d",     "amoxicillin",    "TDS",   5,   500 ],
    ["para 500 tds prn",           "paracetamol",    "TDS",   null, 500 ],
    ["para 1g nocte",              "paracetamol",    "NOCTE", null, 1000],
    ["paracetamol 1000mg od",      "paracetamol",    "OD",    null, 1000],
    ["ciprofloxacin 500 bd x7",    "ciprofloxacin",  "BD",    7,    500 ],
    ["ciprofloxacin 500mg bd 7d",  "ciprofloxacin",  "BD",    7,    500 ],
    ["flagyl 400 tds 7 days",      "metronidazole",  "TDS",   7,    400 ],
    ["flagyl 400mg tds 7/7",       "metronidazole",  "TDS",   7,    400 ],
    ["omep 20 od",                 "omeprazole",     "OD",    null, 20  ],
    ["omeprazole 20mg od",         "omeprazole",     "OD",    null, 20  ],
    ["ibu 400 tds",                "ibuprofen",      "TDS",   null, 400 ],
    ["azith 500 od 3d",            "azithromycin",   "OD",    3,    500 ],
    ["zithromax 500 od 3 days",    "azithromycin",   "OD",    3,    500 ],
    ["coartem bd 3/7",             "artemether",     "BD",    3,    null],
    ["metformin 500 bd",           "metformin",      "BD",    null, 500 ],
    ["amlodipine 5mg od",          "amlodipine",     "OD",    null, 5   ],
    ["lisinopril 10 od",           "lisinopril",     "OD",    null, 10  ],
    ["doxycycline 100mg od 7d",    "doxycycline",    "OD",    7,    100 ],
    ["folic acid 5mg od",          "folic acid",     "OD",    null, 5   ],
    ["ceftriaxone 1g iv od",       "ceftriaxone",    "OD",    null, 1000],
    ["chlorphenamine 4mg tds",     "chlorphenamine", "TDS",   null, 4   ],
    ["ors bd 3 days",              "oral rehydration","BD",   3,    null],
    ["zinc 20mg od 10d",           "zinc",           "OD",    10,   20  ],
    // Edge cases
    ["amox tds 5d",                "amoxicillin",    "TDS",   5,    null],  // No strength — uses default
    ["paracetamol prn",            "paracetamol",    "PRN",   null, null],  // No strength or duration
    ["ciproxin bd 7",              "ciprofloxacin",  "BD",    7,    null],  // Brand name + bare number duration
    ["unknowndrug123 500 tds 5d",  null,             "TDS",   5,    500 ],  // Unknown drug
  ];

  const results = CASES.map(([input, expectedDrug, expectedFreq, expectedDays, expectedStrength]) => {
    const parsed = parseRx(input);
    const ok = {
      drug:     !expectedDrug || (parsed.drug.best?.drug.generic_name.toLowerCase().startsWith(expectedDrug.toLowerCase()) ?? false),
      freq:     !expectedFreq || parsed.frequency?.key === expectedFreq,
      duration: expectedDays === null
        ? parsed.duration === null
        : parsed.duration?.days === expectedDays,
      strength: expectedStrength === null
        ? true // Don't check strength if not expected
        : parsed.strength?.mg === expectedStrength || parsed.strength?.value === expectedStrength,
    };
    const pass = Object.values(ok).every(Boolean);

    return {
      input,
      pass,
      ok,
      parsed: {
        drug:      parsed.drug.best?.drug.generic_name ?? "(no match)",
        freq:      parsed.frequency?.key               ?? "(none)",
        days:      parsed.duration?.days               ?? "(none)",
        strength:  parsed.strength?.label              ?? "(none)",
        confidence:parsed.confidence,
        flags:     parsed.flags.length,
        instruction: parsed.instruction,
      },
    };
  });

  const passed = results.filter(r => r.pass).length;
  const total  = results.length;

  console.group(`[AleraParser] Test results: ${passed}/${total} passed`);
  results.forEach(r => {
    const icon = r.pass ? "✅" : "❌";
    console.log(
      `${icon} "${r.input}"`,
      `→ ${r.parsed.drug} | ${r.parsed.freq} | ${r.parsed.days}d | ${r.parsed.strength}`,
      `| conf: ${r.parsed.confidence}`,
      r.pass ? "" : `| FAIL: ${JSON.stringify(r.ok)}`
    );
  });
  console.groupEnd();

  return { passed, total, results };
}
