import { useState, useEffect, useRef } from "react";
import AleraPatientLookup from "./AleraPatientLookup.jsx";
import { useRole } from "./AleraShell.jsx";
import { SafetyEngine, CHECK_TYPE, SEVERITY } from "./AleraSafetyEngine.js";
import { initDrugDatabase, DrugTable, ALLERGY_SEVERITY } from "./AleraDrugSchema.js";
import { useAuth } from "./AleraAuth.jsx";
import { getDrugFormulary, checkDrugInteractions, savePrescription } from "./supabase.js";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const PATIENT = {
  id: "ALE-00847", name: "Adaeze Okafor", age: 33, sex: "Female",
  weight: 58, allergies: "None", insurance: "NHIS",
  diagnosis: "Malaria (P. falciparum) [B50.9]",
  phone: "+234 803 441 7892",
};

// ─── Drug Database ─────────────────────────────────────────────────────────────
// Full 18-drug Nigerian formulary with strengths, brands, dosage ranges, and categories
const DRUG_FORM = { TABLET:"tablet", CAPSULE:"capsule", SUSPENSION:"suspension", INJECTION:"injection", SYRUP:"syrup", SACHET:"sachet" };
const ROUTE_RAW = { ORAL:"oral", IV:"intravenous", IM:"intramuscular", TOPICAL:"topical" };

const DRUGS_RAW = [
  { id:"d1",  name:"Artemether/Lumefantrine", cls:"Antimalarial",           sub:null,              pregCat:"C", isAntibiotic:false, nhis:true, brands:[{name:"Coartem",price:2000},{name:"Lonart",price:1800}], strengths:[{id:"s1a",val:20,unit:"mg/120mg",form:DRUG_FORM.TABLET,isDefault:false,label:"20mg/120mg",mg:20},{id:"s1b",val:80,unit:"mg/480mg",form:DRUG_FORM.TABLET,isDefault:true,label:"80mg/480mg",mg:80}], notes:"Take with food or fat-containing drink. First-line for uncomplicated P. falciparum." },
  { id:"d2",  name:"Amoxicillin",             cls:"Antibiotic",              sub:"Penicillin",      pregCat:"B", isAntibiotic:true,  nhis:true, brands:[{name:"Amoxil",price:500},{name:"Tonsicap",price:400}], strengths:[{id:"s2a",val:250,unit:"mg",form:DRUG_FORM.CAPSULE,isDefault:false,label:"250mg",mg:250},{id:"s2b",val:500,unit:"mg",form:DRUG_FORM.CAPSULE,isDefault:true,label:"500mg",mg:500}], notes:"Penicillin-class — always check allergy." },
  { id:"d3",  name:"Paracetamol",             cls:"Analgesic",               sub:"Antipyretic",     pregCat:"B", isAntibiotic:false, nhis:true, brands:[{name:"Panadol",price:200},{name:"Emzor Para",price:150}], strengths:[{id:"s3a",val:500,unit:"mg",form:DRUG_FORM.TABLET,isDefault:true,label:"500mg",mg:500},{id:"s3b",val:1000,unit:"mg",form:DRUG_FORM.TABLET,isDefault:false,label:"1000mg",mg:1000}], notes:"Do not exceed 4g/day — hepatotoxic in overdose." },
  { id:"d4",  name:"Metronidazole",           cls:"Antibiotic",              sub:"Nitroimidazole",  pregCat:"B", isAntibiotic:true,  nhis:true, brands:[{name:"Flagyl",price:400},{name:"Metrozol",price:300}], strengths:[{id:"s4a",val:200,unit:"mg",form:DRUG_FORM.TABLET,isDefault:false,label:"200mg",mg:200},{id:"s4b",val:400,unit:"mg",form:DRUG_FORM.TABLET,isDefault:true,label:"400mg",mg:400}], notes:"AVOID ALCOHOL during treatment and 48h after." },
  { id:"d5",  name:"Ciprofloxacin",           cls:"Antibiotic",              sub:"Fluoroquinolone", pregCat:"C", isAntibiotic:true,  nhis:true, brands:[{name:"Ciproxin",price:800},{name:"Ciprolet",price:600}], strengths:[{id:"s5a",val:250,unit:"mg",form:DRUG_FORM.TABLET,isDefault:false,label:"250mg",mg:250},{id:"s5b",val:500,unit:"mg",form:DRUG_FORM.TABLET,isDefault:true,label:"500mg",mg:500}], notes:"Avoid antacids — give 2h apart. Tendon rupture risk." },
  { id:"d6",  name:"Amlodipine",              cls:"Calcium Channel Blocker", sub:null,              pregCat:"C", isAntibiotic:false, nhis:true, brands:[{name:"Norvasc",price:1200},{name:"Amlopin",price:800}], strengths:[{id:"s6a",val:5,unit:"mg",form:DRUG_FORM.TABLET,isDefault:true,label:"5mg",mg:5},{id:"s6b",val:10,unit:"mg",form:DRUG_FORM.TABLET,isDefault:false,label:"10mg",mg:10}], notes:"Long-acting. Once daily. Ankle swelling common." },
  { id:"d7",  name:"Metformin",               cls:"Antidiabetic",            sub:"Biguanide",       pregCat:"B", isAntibiotic:false, nhis:true, brands:[{name:"Glucophage",price:600},{name:"Metforal",price:400}], strengths:[{id:"s7a",val:500,unit:"mg",form:DRUG_FORM.TABLET,isDefault:true,label:"500mg",mg:500},{id:"s7b",val:850,unit:"mg",form:DRUG_FORM.TABLET,isDefault:false,label:"850mg",mg:850}], notes:"Take with meals. Hold before contrast procedures." },
  { id:"d8",  name:"Ibuprofen",               cls:"NSAID",                   sub:null,              pregCat:"D", isAntibiotic:false, nhis:true, brands:[{name:"Brufen",price:350},{name:"Emzor Ibu",price:250}], strengths:[{id:"s8a",val:200,unit:"mg",form:DRUG_FORM.TABLET,isDefault:false,label:"200mg",mg:200},{id:"s8b",val:400,unit:"mg",form:DRUG_FORM.TABLET,isDefault:true,label:"400mg",mg:400}], notes:"Take with food. Avoid in renal disease and third trimester." },
  { id:"d9",  name:"Azithromycin",            cls:"Antibiotic",              sub:"Macrolide",       pregCat:"B", isAntibiotic:true,  nhis:true, brands:[{name:"Zithromax",price:1500},{name:"Azicip",price:900}], strengths:[{id:"s9a",val:250,unit:"mg",form:DRUG_FORM.TABLET,isDefault:false,label:"250mg",mg:250},{id:"s9b",val:500,unit:"mg",form:DRUG_FORM.TABLET,isDefault:true,label:"500mg",mg:500}], notes:"QT-prolonging — caution with other QT drugs." },
  { id:"d10", name:"Omeprazole",              cls:"Proton Pump Inhibitor",   sub:null,              pregCat:"C", isAntibiotic:false, nhis:true, brands:[{name:"Losec",price:700},{name:"Meprazol",price:500}], strengths:[{id:"s10a",val:20,unit:"mg",form:DRUG_FORM.CAPSULE,isDefault:true,label:"20mg",mg:20},{id:"s10b",val:40,unit:"mg",form:DRUG_FORM.CAPSULE,isDefault:false,label:"40mg",mg:40}], notes:"Take 30–60 min before meals." },
  { id:"d11", name:"Diclofenac",              cls:"NSAID",                   sub:null,              pregCat:"D", isAntibiotic:false, nhis:true, brands:[{name:"Voltaren",price:500},{name:"Cataflam",price:600}], strengths:[{id:"s11a",val:50,unit:"mg",form:DRUG_FORM.TABLET,isDefault:true,label:"50mg",mg:50}], notes:"Lowest dose, shortest duration. Higher CV risk than ibuprofen." },
  { id:"d12", name:"Chlorphenamine",          cls:"Antihistamine",           sub:"First-gen",       pregCat:"B", isAntibiotic:false, nhis:true, brands:[{name:"Piriton",price:200}], strengths:[{id:"s12a",val:4,unit:"mg",form:DRUG_FORM.TABLET,isDefault:true,label:"4mg",mg:4}], notes:"Sedating — warn patients not to drive." },
  { id:"d13", name:"Ceftriaxone",             cls:"Antibiotic",              sub:"Cephalosporin",   pregCat:"B", isAntibiotic:true,  nhis:true, brands:[{name:"Rocephin",price:2500},{name:"Ceftrizone",price:1500}], strengths:[{id:"s13a",val:1000,unit:"mg",form:DRUG_FORM.INJECTION,isDefault:true,label:"1g IV",mg:1000}], notes:"10% cross-reactivity with Penicillin allergy." },
  { id:"d14", name:"Doxycycline",             cls:"Antibiotic",              sub:"Tetracycline",    pregCat:"D", isAntibiotic:true,  nhis:true, brands:[{name:"Vibramycin",price:600},{name:"Doxylin",price:400}], strengths:[{id:"s14a",val:100,unit:"mg",form:DRUG_FORM.CAPSULE,isDefault:true,label:"100mg",mg:100}], notes:"Remain upright 30 min after taking. Avoid dairy and antacids." },
  { id:"d15", name:"Folic Acid",              cls:"Vitamin/Supplement",      sub:null,              pregCat:"A", isAntibiotic:false, nhis:true, brands:[{name:"Folvite",price:150}], strengths:[{id:"s15a",val:5,unit:"mg",form:DRUG_FORM.TABLET,isDefault:true,label:"5mg",mg:5}], notes:"Start before conception. 5mg if high risk." },
  { id:"d16", name:"Oral Rehydration Salts",  cls:"Fluid & Electrolyte",     sub:null,              pregCat:"A", isAntibiotic:false, nhis:true, brands:[{name:"Electroral",price:150}], strengths:[{id:"s16a",val:1,unit:"sachet",form:DRUG_FORM.SACHET,isDefault:true,label:"1 sachet",mg:null}], notes:"Mix 1 sachet in 200ml clean water." },
  { id:"d17", name:"Lisinopril",              cls:"ACE Inhibitor",           sub:null,              pregCat:"D", isAntibiotic:false, nhis:true, brands:[{name:"Zestril",price:900},{name:"Listril",price:600}], strengths:[{id:"s17a",val:5,unit:"mg",form:DRUG_FORM.TABLET,isDefault:true,label:"5mg",mg:5},{id:"s17b",val:10,unit:"mg",form:DRUG_FORM.TABLET,isDefault:false,label:"10mg",mg:10}], notes:"Category D — contraindicated in pregnancy." },
  { id:"d18", name:"Zinc Sulphate",           cls:"Vitamin/Supplement",      sub:null,              pregCat:"A", isAntibiotic:false, nhis:true, brands:[{name:"Zincovit",price:300}], strengths:[{id:"s18a",val:20,unit:"mg",form:DRUG_FORM.TABLET,isDefault:true,label:"20mg",mg:20}], notes:"WHO-recommended adjunct to ORS for paediatric diarrhoea." },
];
const DRUG_MAP = {};
DRUGS_RAW.forEach(d => { DRUG_MAP[d.id] = d; });

// ─── Drug Search ──────────────────────────────────────────────────────────────
function rxSearchDrugs(query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.toLowerCase().trim();
  const scored = DRUGS_RAW.map(drug => {
    const gs = (() => { const n=drug.name.toLowerCase(); return n===q?1.0:n.startsWith(q)?0.95:n.includes(q)&&q.length>=3?0.75:0; })();
    const bs = Math.max(0, ...drug.brands.map(b => { const n=b.name.toLowerCase(); return n===q?1.0:n.startsWith(q)?0.9:n.includes(q)&&q.length>=3?0.7:0; }));
    return { drug, score: Math.max(gs, bs) };
  }).filter(r => r.score > 0).sort((a,b) => b.score - a.score);
  return scored;
}

// ─── Abbreviation Parser ──────────────────────────────────────────────────────
const RX_FREQ_MAP = { "od":{key:"OD",full:"Once daily",tpd:1},"bd":{key:"BD",full:"Twice daily",tpd:2},"bid":{key:"BD",full:"Twice daily",tpd:2},"tds":{key:"TDS",full:"Three times daily",tpd:3},"tid":{key:"TDS",full:"Three times daily",tpd:3},"qid":{key:"QID",full:"Four times daily",tpd:4},"qds":{key:"QID",full:"Four times daily",tpd:4},"prn":{key:"PRN",full:"As needed",tpd:null},"stat":{key:"STAT",full:"Immediately",tpd:1},"nocte":{key:"NOCTE",full:"At night",tpd:1},"mane":{key:"MANE",full:"In the morning",tpd:1},"q6h":{key:"Q6H",full:"Every 6 hours",tpd:4},"q8h":{key:"Q8H",full:"Every 8 hours",tpd:3},"q12h":{key:"Q12H",full:"Every 12 hours",tpd:2},"weekly":{key:"WEEKLY",full:"Once weekly",tpd:null},"daily":{key:"OD",full:"Once daily",tpd:1},"night":{key:"NOCTE",full:"At night",tpd:1} };
const RX_ROUTE_MAP = { "oral":"oral","po":"oral","iv":"intravenous","im":"intramuscular","top":"topical","topical":"topical","sl":"sublingual","inh":"inhalation" };
const RX_UNIT_MG   = { "mcg":0.001,"ug":0.001,"mg":1,"g":1000,"gm":1000 };

function rxExtractDuration(raw) { const pats=[[/\b(\d+)\/7\b/,m=>({days:+m[1],label:`${m[1]} days`,raw:m[0]})],[/\b(\d+)\s*days?\b/i,m=>({days:+m[1],label:`${m[1]} days`,raw:m[0]})],[/\b(\d+)\s*d\b/i,m=>({days:+m[1],label:`${m[1]} days`,raw:m[0]})],[/\b(\d+)\s*w(?:ks?|eeks?)?\b/i,m=>({days:+m[1]*7,label:`${m[1]} weeks`,raw:m[0]})]]; for(const[re,parse]of pats){const m=raw.match(re);if(m)return parse(m);} return null; }
function rxExtractStrength(raw) { const combo=raw.match(/\b(\d+)\/(\d+)\s*(mg)?\b/i); if(combo&&![7,52,12].includes(+combo[2]))return{value:+combo[1],unit:"mg/"+combo[2]+"mg",label:`${combo[1]}/${combo[2]}mg`,mg:+combo[1],raw:combo[0]}; const std=raw.match(/\b(\d+(?:\.\d+)?)\s*(mg|g|gm|mcg|ug)\b/i); if(std){const u=std[2].toLowerCase();return{value:+std[1],unit:u,label:`${std[1]}${u}`,mg:(RX_UNIT_MG[u]??null)?+std[1]*(RX_UNIT_MG[u]):null,raw:std[0]};} const bare=raw.match(/\b(\d{3,4})\b/); if(bare)return{value:+bare[1],unit:"mg",label:`${bare[1]}mg`,mg:+bare[1],raw:bare[0],inferred:true}; return null; }
function rxExtractFreq(text) { const t=text.toLowerCase(); for(const k of Object.keys(RX_FREQ_MAP).sort((a,b)=>b.length-a.length)){if(t.includes(k))return{...RX_FREQ_MAP[k],raw:k};} return null; }
function rxExtractRoute(text) { for(const tok of text.toLowerCase().split(/\s+/)){const c=tok.replace(/\./g,"");if(RX_ROUTE_MAP[c])return RX_ROUTE_MAP[c];} return null; }
function rxStripKnown(raw) { let s=raw; s=s.replace(/\b\d+\/7\b|\b\d+\s*days?\b|\b\d+\s*d\b|\b\d+\s*w(?:ks?|eeks?)?\b/gi," "); s=s.replace(/\b\d+\/\d+\s*mg?\b|\b\d+(?:\.\d+)?\s*(?:mg|g|gm|mcg|ug)\b|\b\d{3,4}\b/gi," "); Object.keys(RX_FREQ_MAP).sort((a,b)=>b.length-a.length).forEach(k=>{s=s.replace(new RegExp(`\\b${k}\\b`,"gi")," ");}); Object.keys(RX_ROUTE_MAP).forEach(k=>{s=s.replace(new RegExp(`\\b${k.replace(/\./g,"\\.")}\\b`,"gi")," ");}); return s.replace(/\b(x|for|tab|tabs|cap|caps|sachet)\b/gi," ").replace(/\s+/g," ").trim(); }
function rxGenInstruction({drugName,strength,frequency,duration,route}){const isInj=route==="intravenous"||route==="intramuscular";const parts=[isInj?"Administer":"Take"];if(strength)parts.push(strength.label);if(drugName)parts.push(`of ${drugName}`);if(frequency){const fl={OD:"once daily",BD:"twice daily",TDS:"three times daily",QID:"four times daily",PRN:"as needed",STAT:"immediately",NOCTE:"at night",MANE:"in the morning",WEEKLY:"once a week"}[frequency.key]||frequency.full.toLowerCase();parts.push(fl);}if(duration)parts.push(`for ${duration.label}`);return parts.join(" ")+".";}
function parseRx(input) { if(!input?.trim())return null; const raw=input.trim(); const duration=rxExtractDuration(raw); const strength=rxExtractStrength(raw); const frequency=rxExtractFreq(raw); const route=rxExtractRoute(raw); const drugQuery=rxStripKnown(raw); const matches=rxSearchDrugs(drugQuery); const best=matches.length&&matches[0].score>=0.75?matches[0].drug:null; const defaultStr=best?best.strengths.find(s=>s.isDefault)||best.strengths[0]:null; const resolvedStr=strength||(defaultStr?{...defaultStr,inferred:true}:null); const flags=[]; if(!best&&matches.length===0)flags.push({type:"error",msg:`No drug matching "${drugQuery}"`}); else if(!best&&matches.length>0)flags.push({type:"warning",msg:`Did you mean ${matches.slice(0,2).map(m=>m.drug.name).join(" or ")}?`}); if(!frequency)flags.push({type:"warning",msg:"Frequency not detected — add OD, BD, TDS, PRN etc."}); if(!strength&&best)flags.push({type:"info",msg:`No strength — using default ${defaultStr?.label||"unknown"}`}); if(best?.isAntibiotic&&!duration)flags.push({type:"warning",msg:"Duration missing for antibiotic"}); const confidence=(best?0.4:0)+(frequency?0.25:0)+(resolvedStr&&!resolvedStr.inferred?0.2:resolvedStr?0.1:0)+(duration?0.15:0); return{raw,best,matches,strength:resolvedStr,frequency,duration,route,flags,confidence,instruction:best?rxGenInstruction({drugName:best.name,strength:resolvedStr,frequency,duration,route}):null}; }

const ENTRY_FREQ_OPTIONS = ["OD","BD","TDS","QID","PRN","STAT","NOCTE","MANE","Q6H","Q8H","Q12H","WEEKLY"];

const AI_SUGGESTIONS = {
  malaria: [
    { drug: "Artemether/Lumefantrine", strength: "80/480mg", dose: "2 tabs BD", duration: "3 days", reason: "First-line treatment for uncomplicated P. falciparum malaria (WHO/FMOH guidelines)" },
    { drug: "Paracetamol", strength: "500mg", dose: "2 tabs TDS", duration: "3 days", reason: "Fever management and pain relief" },
    { drug: "Oral Rehydration Salts", strength: "5.4g", dose: "1 sachet TDS", duration: "3 days", reason: "Prevent dehydration from febrile illness" },
  ],
};

// ─── SafetyEngine Integration ─────────────────────────────────────────────────
// One-time DB init (idempotent — safe to call multiple times)
initDrugDatabase();

// Frequency string → canonical key the engine understands
const FREQ_MAP = {
  "OD (once daily)":       "OD",
  "BD (twice daily)":      "BD",
  "TDS (three times daily)": "TDS",
  "QDS (four times daily)": "QDS",
  "Nocte (at night)":      "OD",
  "PRN (as needed)":       "PRN",
  "Stat (immediately)":    "STAT",
  "Weekly":                "WEEKLY",
};

// Map a screen drug row → SafetyEngine candidate shape
function toCandidate(drug) {
  const match = DrugTable.findByName(drug.name)?.[0];
  if (!match) return null;
  const daysMatch = (drug.duration || "").match(/(\d+)/);
  return {
    drug_id:       match.id,
    strength_id:   null,
    dosage_amount: null,
    dosage_unit:   null,
    frequency:     FREQ_MAP[drug.dose] || drug.dose?.split(" ")[drug.dose?.split(" ").length - 1] || null,
    duration_days: daysMatch ? parseInt(daysMatch[1]) : null,
    route:         "oral",
  };
}

// Map patient prop allergies (string[] | string) → engine allergy objects
function toEngineAllergies(allergies) {
  if (!allergies) return [];
  const list = Array.isArray(allergies)
    ? allergies
    : String(allergies).split(",").map(s => s.trim()).filter(Boolean);

  return list
    .filter(a => a && a !== "None")
    .map(allergenName => {
      // Try to match to a drug class (e.g. "Penicillin" → drug_class)
      // Common class names the engine recognises
      const classNames = ["Penicillin", "Sulfonamide", "NSAID", "Cephalosporin",
                          "Macrolide", "Quinolone", "Tetracycline", "Aminoglycoside"];
      const isClass = classNames.some(c => allergenName.toLowerCase().includes(c.toLowerCase()));
      return {
        id:            allergenName,
        drug_id:       null,
        drug_class:    isClass ? allergenName : null,
        allergen_name: allergenName,
        severity:      ALLERGY_SEVERITY.SEVERE,
        reaction_type: null,
        verified:      false,
      };
    });
}

// Map patient prop → engine patient shape
function toEnginePatient(patient) {
  const weightRaw = patient.weight ?? patient.weight_kg;
  return {
    id:                      patient.id,
    age_years:               patient.age,
    weight_kg:               typeof weightRaw === "string"
                               ? parseFloat(weightRaw) || null
                               : weightRaw || null,
    sex:                     patient.sex,
    is_pregnant:             patient.is_pregnant  || false,
    trimester:               patient.trimester    || null,
    has_renal_impairment:    patient.has_renal_impairment  || false,
    has_hepatic_impairment:  patient.has_hepatic_impairment || false,
    allergies:               toEngineAllergies(patient.allergies),
  };
}

// Severity → display config
const SEV_CONFIG = {
  [SEVERITY.BLOCKED]:  { color: "#7B1D1D", bg: "#FDECEA", border: "rgba(192,57,43,0.4)", icon: "🚫", label: "BLOCKED" },
  [SEVERITY.CRITICAL]: { color: "#7B3A00", bg: "#FEF0E0", border: "rgba(200,100,0,0.35)", icon: "🚨", label: "CRITICAL" },
  [SEVERITY.WARNING]:  { color: "#7A5200", bg: "#FEF9EC", border: "rgba(232,134,10,0.3)", icon: "⚠️",  label: "WARNING"  },
  [SEVERITY.INFO]:     { color: "#0D4F8C", bg: "#EBF3FD", border: "rgba(26,95,168,0.25)", icon: "ℹ️",  label: "INFO"     },
};

const FREQ_OPTIONS = ["OD (once daily)", "BD (twice daily)", "TDS (three times daily)", "QDS (four times daily)", "Nocte (at night)", "PRN (as needed)", "Stat (immediately)", "Weekly"];
const DURATION_OPTIONS = ["1 day", "3 days", "5 days", "7 days", "10 days", "14 days", "30 days", "Ongoing"];
const ROUTE_OPTIONS = ["Oral", "IV", "IM", "Topical", "Sublingual", "Inhaled", "Rectal"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateRx(patient, drugs) {
  const date = new Date().toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
  return `ALERA HEALTH — PRESCRIPTION
──────────────────────────────
Patient: ${patient.name}
ID: ${patient.id} | Age: ${patient.age}yrs | Sex: ${patient.sex}
Diagnosis: ${patient.diagnosis}
Date: ${date}
──────────────────────────────
MEDICATIONS:
${drugs.map((d, i) => `${i + 1}. ${d.name} ${d.strength}
   Dose: ${d.dose} | Duration: ${d.duration}
   Instructions: ${d.instructions}
`).join("")}──────────────────────────────
Prescriber: Dr. Chidi Okonkwo
Sig: Follow instructions. Return if symptoms worsen.
Digital copy sent to patient app.`;
}


// ─── AI Verification Gate ─────────────────────────────────────────────────────

function AiVerificationGate({ drugs, onConfirm, onCancel }) {
  const [checked, setChecked] = useState(false);
  const [btnReady, setBtnReady] = useState(false);
  const [countdown, setCountdown] = useState(2);

  // Countdown timer — confirm button unlocks after 2 seconds
  useEffect(() => {
    if (countdown <= 0) { setBtnReady(true); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  return (
    <div style={{
      background: "#0A0F1E",
      border: "1.5px solid rgba(30,107,85,0.45)",
      borderRadius: 14, overflow: "hidden",
      marginBottom: 20, animation: "slideIn 0.25s ease",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 18px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", gap: 10,
        background: "rgba(30,107,85,0.08)",
      }}>
        <span style={{ fontSize: 18 }}>🔑</span>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: "#fff" }}>
          Clinician Verification Required
        </div>
        <div style={{
          marginLeft: "auto", fontSize: 10, padding: "2px 8px",
          background: "rgba(232,134,10,0.15)", color: "#E8A03A",
          border: "1px solid rgba(232,134,10,0.3)",
          borderRadius: 4, fontFamily: "'JetBrains Mono',monospace",
        }}>REVIEW BEFORE APPLYING</div>
      </div>

      {/* Drug list to review */}
      <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{
          fontSize: 10, color: "rgba(255,255,255,0.3)",
          fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 10,
        }}>Medications to be applied</div>
        {drugs.map((d, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 12px", borderRadius: 9, marginBottom: 6,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%",
              background: "rgba(30,107,85,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 800, color: "#27856A",
              fontFamily: "'Syne',sans-serif", flexShrink: 0,
            }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{d.drug} {d.strength}</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginLeft: 8 }}>
                {d.dose} · {d.duration}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", maxWidth: 180, textAlign: "right" }}>
              {d.reason}
            </div>
          </div>
        ))}
      </div>

      {/* Responsibility statement + checkbox */}
      <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <label style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          cursor: "pointer", userSelect: "none",
        }}>
          <div style={{ marginTop: 2, flexShrink: 0 }}>
            <div
              onClick={() => setChecked(c => !c)}
              style={{
                width: 20, height: 20, borderRadius: 5,
                border: `2px solid ${checked ? "#1E6B55" : "rgba(255,255,255,0.2)"}`,
                background: checked ? "#1E6B55" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
                flexShrink: 0,
              }}
            >
              {checked && <span style={{ fontSize: 12, color: "#fff", lineHeight: 1 }}>✓</span>}
            </div>
          </div>
          <div onClick={() => setChecked(c => !c)} style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.7 }}>
            I, <span style={{ color: "#fff", fontWeight: 600 }}>Dr. Chidi Okonkwo</span>, confirm that I have independently reviewed the above AI-suggested medications for this patient. I understand that{" "}
            <span style={{ color: "#27856A", fontWeight: 600 }}>Alera AI is a clinical decision-support tool only</span>, and that I assume full clinical responsibility for this prescription.
          </div>
        </label>
      </div>

      {/* Action buttons */}
      <div style={{ padding: "14px 18px", display: "flex", gap: 10, alignItems: "center" }}>
        <button
          onClick={onConfirm}
          disabled={!checked || !btnReady}
          style={{
            padding: "11px 24px", borderRadius: 9, border: "none",
            background: checked && btnReady ? "#1E6B55" : "rgba(255,255,255,0.08)",
            color: checked && btnReady ? "#fff" : "rgba(255,255,255,0.25)",
            fontSize: 13.5, fontWeight: 700,
            cursor: checked && btnReady ? "pointer" : "not-allowed",
            fontFamily: "'Syne',sans-serif",
            boxShadow: checked && btnReady ? "0 4px 14px rgba(30,107,85,0.35)" : "none",
            transition: "all 0.2s",
            display: "flex", alignItems: "center", gap: 8,
          }}
          onMouseEnter={e => { if (checked && btnReady) { e.currentTarget.style.background = "#27856A"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
          onMouseLeave={e => { if (checked && btnReady) { e.currentTarget.style.background = "#1E6B55"; e.currentTarget.style.transform = ""; } }}
        >
          {!btnReady ? (
            <>
              <span style={{
                display: "inline-block", width: 14, height: 14,
                border: "2px solid rgba(255,255,255,0.2)",
                borderTopColor: "rgba(255,255,255,0.5)",
                borderRadius: "50%", animation: "spin 0.8s linear infinite",
              }} />
              Confirm in {countdown}s…
            </>
          ) : "🔑 Confirm & Apply Prescription"}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "11px 18px", borderRadius: 9,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "transparent", color: "rgba(255,255,255,0.35)",
            fontSize: 13, cursor: "pointer",
            fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.6)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.35)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
        >Cancel</button>
        {!btnReady && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono',monospace", marginLeft: 4 }}>
            Please read before confirming
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// ─── DrugSearchDropdown ───────────────────────────────────────────────────────
// Hits live Supabase formulary first; falls back to local DRUGS_RAW if DB unavailable
function DrugSearchDropdown({ onSelect, orgId }) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [dbDrugs, setDbDrugs] = useState(null);  // null = not yet loaded
  const ref = useRef(null);

  // Load live formulary from Supabase once on mount
  useEffect(() => {
    if (!orgId) return;
    getDrugFormulary(orgId).then(({ data }) => {
      if (data?.length) {
        // Normalise DB shape to DRUGS_RAW shape for compatibility
        const normalised = data.map(d => ({
          id:          d.id,
          name:        d.name,
          cls:         d.drug_class   ?? "Drug",
          sub:         d.drug_subclass ?? null,
          pregCat:     d.pregnancy_category ?? "?",
          isAntibiotic: false,
          nhis:        d.is_nhis_formulary ?? false,
          notes:       d.clinical_notes ?? "",
          brands:      (d.drug_brands ?? []).map(b => ({ name: b.brand_name, price: b.unit_price_ngn ?? 0 })),
          strengths:   (d.drug_strengths ?? []).map(s => ({ id: s.id, label: s.strength_label, val: s.strength_value, unit: s.strength_unit, mg: s.strength_mg, form: s.dosage_form, isDefault: s.is_default })),
        }));
        setDbDrugs(normalised);
      }
    });
  }, [orgId]);

  // Search — use live DB drugs if loaded, fall back to local DRUGS_RAW
  useEffect(() => {
    const source = dbDrugs ?? DRUGS_RAW;
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    const q = query.toLowerCase().trim();
    const r = source
      .map(drug => {
        const ns = drug.name.toLowerCase();
        const gs = ns === q ? 1 : ns.startsWith(q) ? 0.95 : ns.includes(q) ? 0.75 : 0;
        const bs = Math.max(0, ...(drug.brands ?? []).map(b => {
          const bn = b.name.toLowerCase();
          return bn === q ? 1 : bn.startsWith(q) ? 0.9 : bn.includes(q) ? 0.7 : 0;
        }));
        return { drug, score: Math.max(gs, bs) };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    setResults(r);
    setOpen(r.length > 0);
  }, [query, dbDrugs]);

  useEffect(() => {
    const h = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const clsCols = { "Antimalarial":{ c:"#1E6B55", bg:"#E6F3EE" }, "Antibiotic":{ c:"#1A5FA8", bg:"#EBF3FD" }, "NSAID":{ c:"#C0392B", bg:"#FDECEA" }, "Analgesic":{ c:"#E8860A", bg:"#FEF3E2" } };

  return (
    <div ref={ref} style={{ position:"relative" }}>
      <div style={{ position:"relative" }}>
        <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:14, color:"#9A9890", pointerEvents:"none" }}>🔍</span>
        <input value={query} onChange={e=>setQuery(e.target.value)}
          placeholder="Search drug by name or brand (e.g. amox, coartem, flagyl)…"
          style={{ width:"100%", padding:"11px 12px 11px 36px", border:"1.5px solid #E0DCD4", borderRadius:9, fontSize:13.5, fontFamily:"'DM Sans',sans-serif", color:"#0A0F1E", outline:"none", transition:"all 0.15s", background:"#fff", boxSizing:"border-box" }}
          onFocus={e=>{ e.target.style.borderColor="#1E6B55"; e.target.style.boxShadow="0 0 0 3px rgba(30,107,85,0.1)"; if(results.length)setOpen(true); }}
          onBlur={e=>{ e.target.style.borderColor="#E0DCD4"; e.target.style.boxShadow="none"; }}
        />
      </div>
      {open && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"#fff", border:"1.5px solid #E0DCD4", borderRadius:10, boxShadow:"0 8px 30px rgba(10,15,30,0.12)", zIndex:60, maxHeight:300, overflowY:"auto" }}>
          {results.map(({ drug }) => {
            const col = clsCols[drug.cls] || { c:"#3D4558", bg:"#F0EDE8" };
            const cheapest = Math.min(...drug.brands.map(b=>b.price||9999));
            return (
              <div key={drug.id} onClick={() => { onSelect(drug); setQuery(""); setOpen(false); }}
                style={{ padding:"11px 16px", cursor:"pointer", borderBottom:"1px solid #F0EDE8", display:"flex", gap:12, alignItems:"flex-start", transition:"background 0.1s" }}
                onMouseEnter={e=>e.currentTarget.style.background="#F6F9F7"}
                onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                <div style={{ width:36, height:36, borderRadius:9, background:col.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>💊</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap", marginBottom:3 }}>
                    <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:14, color:"#0A0F1E" }}>{drug.name}</span>
                    <span style={{ fontSize:10, fontWeight:700, color:col.c, background:col.bg, padding:"1px 7px", borderRadius:4, fontFamily:"'JetBrains Mono',monospace" }}>{drug.cls}</span>
                    {drug.nhis && <span style={{ fontSize:10, color:"#1E6B55", background:"#E6F3EE", padding:"1px 7px", borderRadius:4, fontFamily:"'JetBrains Mono',monospace" }}>NHIS</span>}
                    {drug.pregCat === "D" && <span style={{ fontSize:10, color:"#E8860A", background:"#FEF3E2", padding:"1px 7px", borderRadius:4, fontFamily:"'JetBrains Mono',monospace" }}>Cat D</span>}
                    {drug.pregCat === "X" && <span style={{ fontSize:10, color:"#C0392B", background:"#FDECEA", padding:"1px 7px", borderRadius:4, fontFamily:"'JetBrains Mono',monospace" }}>Cat X</span>}
                  </div>
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                    {drug.strengths.slice(0,3).map(s=>(
                      <span key={s.id} style={{ fontSize:11, color:"#6B7080", background:"#F5F2EC", padding:"2px 7px", borderRadius:4, fontFamily:"'JetBrains Mono',monospace" }}>{s.label}</span>
                    ))}
                  </div>
                  <div style={{ fontSize:11.5, color:"#9A9890", marginTop:3 }}>{drug.brands.slice(0,3).map(b=>b.name).join(" · ")}</div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:10, color:"#9A9890", fontFamily:"'JetBrains Mono',monospace" }}>from</div>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:14, color:"#1E6B55" }}>₦{cheapest.toLocaleString()}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── QuickEntry ───────────────────────────────────────────────────────────────
function QuickEntry({ onAdd }) {
  const [input, setInput] = useState("");
  const [parsed, setParsed] = useState(null);
  const [mode, setMode] = useState("idle"); // idle | typing | parsed | error
  const debounceRef = useRef(null);

  function handleChange(val) {
    setInput(val);
    setMode("typing");
    clearTimeout(debounceRef.current);
    if (!val.trim()) { setParsed(null); setMode("idle"); return; }
    debounceRef.current = setTimeout(() => {
      const p = parseRx(val);
      setParsed(p);
      setMode(p?.best ? "parsed" : "error");
    }, 380);
  }

  function handleAdd() {
    if (!parsed?.best) return;
    onAdd(parsed);
    setInput(""); setParsed(null); setMode("idle");
  }

  const conf = parsed?.confidence ?? 0;
  const confColor = conf >= 0.8 ? "#1E6B55" : conf >= 0.5 ? "#E8860A" : "#C0392B";
  const borderCol = mode === "parsed" ? "#1E6B55" : mode === "error" ? "#E8860A" : "#E0DCD4";
  const EXAMPLES = ["amox 500 tds 5d","para 1g nocte","flagyl 400 tds 7d","ciprofloxacin 500 bd 5d","omep 20 od","azith 500 od 3d"];

  return (
    <div style={{ background:"#0A0F1E", borderRadius:12, padding:"18px 20px", marginBottom:14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:12 }}>
        <div style={{ width:28, height:28, borderRadius:8, background:"rgba(30,107,85,0.3)", border:"1px solid rgba(30,107,85,0.4)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>⌨</div>
        <div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:14, color:"#fff" }}>Quick Entry</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>Type shorthand — parser structures it automatically</div>
        </div>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:10 }}>
        <div style={{ flex:1, position:"relative" }}>
          <input value={input} onChange={e=>handleChange(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter") handleAdd(); }}
            placeholder="e.g. amox 500 tds 5d"
            style={{ width:"100%", padding:"11px 14px", border:`1.5px solid ${borderCol}60`, borderRadius:8, fontSize:14, fontFamily:"'JetBrains Mono',monospace", fontWeight:500, color:"#fff", background:"rgba(255,255,255,0.07)", outline:"none", transition:"all 0.2s", boxSizing:"border-box" }}
            onFocus={e=>{ e.target.style.background="rgba(255,255,255,0.1)"; }}
            onBlur={e=>{ e.target.style.background="rgba(255,255,255,0.07)"; }}
          />
          {parsed && <div style={{ position:"absolute", bottom:0, left:0, height:2, borderRadius:2, width:`${conf*100}%`, background:confColor, transition:"width 0.3s ease" }}/>}
        </div>
        <button onClick={handleAdd} disabled={mode!=="parsed"}
          style={{ padding:"11px 18px", borderRadius:8, border:"none", background:mode==="parsed"?"#1E6B55":"rgba(255,255,255,0.1)", color:mode==="parsed"?"#fff":"rgba(255,255,255,0.3)", fontFamily:"'DM Sans',sans-serif", fontWeight:700, fontSize:13, cursor:mode==="parsed"?"pointer":"not-allowed", transition:"all 0.15s", flexShrink:0 }}>Add →</button>
      </div>

      {parsed && mode === "parsed" && (
        <div style={{ background:"rgba(255,255,255,0.06)", borderRadius:8, padding:"10px 14px" }}>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:6 }}>
            {[
              { label:"DRUG",     val:parsed.best?.name,           col:"#27856A" },
              { label:"STRENGTH", val:parsed.strength?.label,      col:"rgba(255,255,255,0.7)" },
              { label:"FREQ",     val:parsed.frequency?.key,       col:"rgba(255,255,255,0.7)" },
              { label:"DURATION", val:parsed.duration?.label,      col:"rgba(255,255,255,0.7)" },
              { label:"ROUTE",    val:parsed.route,                col:"rgba(255,255,255,0.5)" },
            ].filter(f=>f.val).map(f=>(
              <div key={f.label} style={{ display:"flex", flexDirection:"column", gap:2 }}>
                <span style={{ fontSize:9, color:"rgba(255,255,255,0.3)", fontFamily:"'JetBrains Mono',monospace", letterSpacing:"0.5px" }}>{f.label}</span>
                <span style={{ fontSize:12.5, fontWeight:600, color:f.col }}>{f.val}</span>
              </div>
            ))}
            <div style={{ marginLeft:"auto", display:"flex", flexDirection:"column", gap:2 }}>
              <span style={{ fontSize:9, color:"rgba(255,255,255,0.3)", fontFamily:"'JetBrains Mono',monospace" }}>CONFIDENCE</span>
              <span style={{ fontSize:12.5, fontWeight:700, color:confColor }}>{Math.round(conf*100)}%</span>
            </div>
          </div>
          {parsed.flags.map((f,i)=>(
            <div key={i} style={{ fontSize:11.5, color:f.type==="error"?"#F07070":f.type==="warning"?"#E8A530":"rgba(255,255,255,0.5)", marginTop:4 }}>
              {f.type==="error"?"⛔":f.type==="warning"?"⚠":"ℹ"} {f.msg}
            </div>
          ))}
        </div>
      )}
      {parsed && mode === "error" && (
        <div style={{ fontSize:12, color:"#E8A530", padding:"6px 0" }}>
          ⚠ {parsed.flags[0]?.msg || "Could not fully parse — check spelling or use search above"}
        </div>
      )}
      {mode === "idle" && (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
          {EXAMPLES.map(ex=>(
            <button key={ex} onClick={()=>handleChange(ex)}
              style={{ padding:"3px 9px", borderRadius:5, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"rgba(255,255,255,0.45)", fontSize:11, fontFamily:"'JetBrains Mono',monospace", cursor:"pointer", transition:"all 0.12s" }}
              onMouseEnter={e=>{ e.currentTarget.style.color="rgba(255,255,255,0.8)"; e.currentTarget.style.background="rgba(255,255,255,0.1)"; }}
              onMouseLeave={e=>{ e.currentTarget.style.color="rgba(255,255,255,0.45)"; e.currentTarget.style.background="rgba(255,255,255,0.05)"; }}>
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DrugCard ─────────────────────────────────────────────────────────────────
function DrugCard({ rx, index, safetyResults = [], overrideReasons = {}, onOverride, onChange, onRemove }) {
  const drug = DRUG_MAP[rx.drug_id];
  const [expanded, setExpanded] = useState(false);

  if (!drug) return null;

  const hasBlocked  = safetyResults.some(r=>r.severity==="blocked");
  const hasCritical = safetyResults.some(r=>r.severity==="critical");
  const hasWarning  = safetyResults.some(r=>r.severity==="warning");
  const cardBorder  = hasBlocked||hasCritical ? "#C0392B" : hasWarning ? "#E8860A" : "#E0DCD4";

  const cheapest = drug.brands.reduce((a,b)=>(a.price||9999)<(b.price||9999)?a:b, drug.brands[0]);

  return (
    <div style={{ background:"#fff", borderRadius:12, border:`1.5px solid ${cardBorder}`, boxShadow:"0 1px 8px rgba(10,15,30,0.06)", marginBottom:12, overflow:"hidden", transition:"border-color 0.2s" }}>
      {/* Header */}
      <div style={{ padding:"12px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:24, height:24, borderRadius:6, background:hasBlocked||hasCritical?"#FDECEA":hasWarning?"#FEF3E2":"#E6F3EE", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Syne',sans-serif", fontSize:11, fontWeight:800, color:hasBlocked||hasCritical?"#C0392B":hasWarning?"#E8860A":"#1E6B55", flexShrink:0 }}>{index+1}</div>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap", marginBottom:3 }}>
            <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:14.5, color:"#0A0F1E" }}>{drug.name}</span>
            <span style={{ fontSize:10, fontWeight:700, color:"#1A5FA8", background:"#EBF3FD", padding:"1px 7px", borderRadius:4, fontFamily:"'JetBrains Mono',monospace" }}>{drug.cls}</span>
            {drug.isAntibiotic && <span style={{ fontSize:10, color:"#E8860A", background:"#FEF3E2", padding:"1px 7px", borderRadius:4, fontFamily:"'JetBrains Mono',monospace" }}>Antibiotic</span>}
            {drug.nhis && <span style={{ fontSize:10, color:"#1E6B55", background:"#E6F3EE", padding:"1px 7px", borderRadius:4, fontFamily:"'JetBrains Mono',monospace" }}>NHIS</span>}
            {rx.is_ai_suggested && <span style={{ fontSize:10, color:"#1E6B55", background:"#E6F3EE", padding:"1px 7px", borderRadius:4, fontFamily:"'JetBrains Mono',monospace" }}>✦ AI</span>}
          </div>
          <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
            {[rx.dosage_unit&&`${rx.dosage_amount||"—"} ${rx.dosage_unit}`, rx.frequency, rx.duration_days&&`${rx.duration_days}d`, rx.route!=="oral"&&rx.route].filter(Boolean).map((v,i)=>(
              <span key={i} style={{ fontSize:11, color:"#6B7080", background:"#F5F2EC", padding:"2px 7px", borderRadius:4, fontFamily:"'JetBrains Mono',monospace" }}>{v}</span>
            ))}
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:5, flexShrink:0 }}>
          <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:15, color:"#1E6B55" }}>₦{(cheapest?.price||0).toLocaleString()}</span>
          {hasBlocked  && <span style={{ fontSize:10, color:"#C0392B", background:"#FDECEA", padding:"1px 7px", borderRadius:4, fontFamily:"'JetBrains Mono',monospace" }}>🚫 Blocked</span>}
          {!hasBlocked && hasCritical && <span style={{ fontSize:10, color:"#C0392B", background:"#FDECEA", padding:"1px 7px", borderRadius:4, fontFamily:"'JetBrains Mono',monospace" }}>⛔ Critical</span>}
          {!hasBlocked && !hasCritical && hasWarning && <span style={{ fontSize:10, color:"#E8860A", background:"#FEF3E2", padding:"1px 7px", borderRadius:4, fontFamily:"'JetBrains Mono',monospace" }}>⚠ Warning</span>}
          {safetyResults.length === 0 && <span style={{ fontSize:10, color:"#1E6B55", background:"#E6F3EE", padding:"1px 7px", borderRadius:4, fontFamily:"'JetBrains Mono',monospace" }}>✓ Clear</span>}
        </div>

        <div style={{ display:"flex", gap:6, flexShrink:0 }}>
          <button onClick={()=>setExpanded(e=>!e)} style={{ width:30, height:30, borderRadius:7, border:"1px solid #E0DCD4", background:"transparent", cursor:"pointer", color:"#9A9890", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.12s", fontSize:13 }}
            onMouseEnter={e=>{e.currentTarget.style.background="#F5F2EC";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>{expanded?"▲":"▼"}</button>
          <button onClick={onRemove} style={{ width:30, height:30, borderRadius:7, border:"1px solid #E0DCD4", background:"transparent", cursor:"pointer", color:"#9A9890", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.12s", fontSize:14 }}
            onMouseEnter={e=>{e.currentTarget.style.background="#FDECEA";e.currentTarget.style.color="#C0392B";e.currentTarget.style.borderColor="#C0392B";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#9A9890";e.currentTarget.style.borderColor="#E0DCD4";}}>✕</button>
        </div>
      </div>

      {/* Safety alerts inline */}
      {safetyResults.length > 0 && (
        <div style={{ padding:"0 16px 12px" }}>
          <SafetyPanel safetyResults={safetyResults} overrideReasons={overrideReasons} onOverride={onOverride} />
        </div>
      )}

      {/* Expanded editor */}
      {expanded && (
        <div style={{ borderTop:"1px solid #F0EDE8", padding:"14px 16px", background:"#F9F7F3" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:10, color:"#9A9890", fontFamily:"'JetBrains Mono',monospace", letterSpacing:"0.5px", marginBottom:6 }}>STRENGTH</div>
              <select value={rx.strength_id||""} onChange={e=>{ const s=drug.strengths.find(x=>x.id===e.target.value); onChange({strength_id:e.target.value,dosage_amount:s?.val,dosage_unit:s?.unit}); }}
                style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #E0DCD4", borderRadius:8, fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#0A0F1E", outline:"none", background:"#fff" }}>
                {drug.strengths.map(s=><option key={s.id} value={s.id}>{s.label} — {s.form}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:10, color:"#9A9890", fontFamily:"'JetBrains Mono',monospace", letterSpacing:"0.5px", marginBottom:6 }}>FREQUENCY</div>
              <select value={rx.frequency||""} onChange={e=>{ const f=RX_FREQ_MAP[e.target.value.toLowerCase()]; onChange({frequency:e.target.value,times_per_day:f?.tpd??null}); }}
                style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #E0DCD4", borderRadius:8, fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#0A0F1E", outline:"none", background:"#fff" }}>
                <option value="">— Select —</option>
                {ENTRY_FREQ_OPTIONS.map(f=><option key={f} value={f}>{f} — {RX_FREQ_MAP[f.toLowerCase()]?.full||""}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:10, color:"#9A9890", fontFamily:"'JetBrains Mono',monospace", letterSpacing:"0.5px", marginBottom:6 }}>DURATION (DAYS)</div>
              <input type="number" value={rx.duration_days||""} onChange={e=>onChange({duration_days:+e.target.value||null})} placeholder="e.g. 5"
                style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #E0DCD4", borderRadius:8, fontSize:13, fontFamily:"'JetBrains Mono',monospace", color:"#0A0F1E", outline:"none", background:"#fff", boxSizing:"border-box" }}
                onFocus={e=>e.target.style.borderColor="#1E6B55"} onBlur={e=>e.target.style.borderColor="#E0DCD4"}/>
            </div>
          </div>
          <div>
            <div style={{ fontSize:10, color:"#9A9890", fontFamily:"'JetBrains Mono',monospace", letterSpacing:"0.5px", marginBottom:6 }}>PATIENT INSTRUCTIONS</div>
            <textarea value={rx.instructions||""} onChange={e=>onChange({instructions:e.target.value})} rows={2}
              style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #E0DCD4", borderRadius:8, fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#0A0F1E", outline:"none", resize:"none", background:"#fff", lineHeight:1.55, boxSizing:"border-box" }}
              onFocus={e=>e.target.style.borderColor="#1E6B55"} onBlur={e=>e.target.style.borderColor="#E0DCD4"}/>
          </div>
          {drug.notes && (
            <div style={{ marginTop:10, padding:"8px 12px", background:"#EBF3FD", borderRadius:8, fontSize:12, color:"#1A5FA8", lineHeight:1.55 }}>
              ℹ {drug.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SafetyPanel({ safetyResults, overrideReasons, onOverride }) {
  const [expanded, setExpanded] = useState({});

  if (!safetyResults || safetyResults.length === 0) return null;

  const grouped = [SEVERITY.BLOCKED, SEVERITY.CRITICAL, SEVERITY.WARNING, SEVERITY.INFO]
    .map(sev => ({ sev, items: safetyResults.filter(r => r.severity === sev) }))
    .filter(g => g.items.length > 0);

  return (
    <div style={{ marginBottom: 0 }}>
      {grouped.map(({ sev, items }) =>
        items.map((r, i) => {
          const cfg = SEV_CONFIG[sev];
          const needsOverride = (sev === SEVERITY.CRITICAL || sev === SEVERITY.BLOCKED) && r.canOverride;
          const hasOverride   = overrideReasons?.[r.checkId || r.type];
          const isOpen        = expanded[`${sev}-${i}`];
          return (
            <div key={`${sev}-${i}`} style={{ marginBottom: 6, borderRadius: 8, border: `1.5px solid ${cfg.border}`, background: cfg.bg, overflow: "hidden" }}>
              <div style={{ padding: "9px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{cfg.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, fontFamily: "'JetBrains Mono',monospace" }}>{cfg.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{r.title}</span>
                    {hasOverride && <span style={{ fontSize: 10, color: "#1A6650", background: "#E6F3EE", padding: "1px 6px", borderRadius: 3, fontFamily: "'JetBrains Mono',monospace" }}>OVERRIDDEN</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#2A1A0A", lineHeight: 1.45 }}>{r.message}</div>
                </div>
                {r.detail && (
                  <button onClick={() => setExpanded(e => ({ ...e, [`${sev}-${i}`]: !isOpen }))} style={{ background: "none", border: "none", color: cfg.color, fontSize: 10, cursor: "pointer" }}>{isOpen ? "▲" : "▼"}</button>
                )}
              </div>
              {isOpen && r.detail && (
                <div style={{ padding: "0 12px 9px 34px", fontSize: 11.5, color: "#4A3020", lineHeight: 1.5 }}>
                  {r.detail}
                  {r.recommendation && <div style={{ marginTop: 4, fontWeight: 600, color: cfg.color }}>→ {r.recommendation}</div>}
                </div>
              )}
              {needsOverride && !hasOverride && (
                <div style={{ padding: "0 12px 10px 34px", display: "flex", gap: 7 }}>
                  <input placeholder="Clinical override reason…" style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1.5px solid ${cfg.border}`, fontSize: 12, fontFamily: "'DM Sans',sans-serif", background: "#fff", outline: "none" }}
                    onKeyDown={e => { if (e.key === "Enter" && e.target.value.trim()) { onOverride(r.checkId || r.type, e.target.value.trim()); e.target.value = ""; }}} />
                  <button onClick={e => { const inp = e.currentTarget.previousSibling; if (inp.value.trim()) { onOverride(r.checkId || r.type, inp.value.trim()); inp.value = ""; }}}
                    style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: cfg.color, color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>Override</button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}


// ─── Main Component ───────────────────────────────────────────────────────────



// ─── Main Component ───────────────────────────────────────────────────────────

export default function AleraPrescriptionScreen({ patient, diagnosis, onComplete }) {
  const hasPatient = !!(patient?._db_id);
  if (!hasPatient) return <AleraPatientLookup screenName="Prescription" screenIcon="💊" onSelect={p => onComplete?.({ _lookup: true, patient: p })} />;
  const { role, can } = useRole?.() || { role: "doctor", can: () => true };
  const { orgId, staffId } = useAuth();
  const canPrescribe = can("canPrescribe");
  const canDispense  = can("canDispense");
  const [drugs, setDrugs]         = useState([]); // engine-native: { _id, drug_id, strength_id, dosage_amount, dosage_unit, frequency, duration_days, route, instructions, is_ai_suggested }
  const [entryMode, setEntryMode] = useState("search"); // "search" | "quick" | "both"
  const [aiApplied, setAiApplied] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [showRx, setShowRx] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [smsSent, setSmsSent] = useState(false);

  // ── Safety Engine state ──────────────────────────────────────────────────
  // safetyMap: { drug_id → SafetyResult[] } — per-drug findings
  const [safetyMap,      setSafetyMap]      = useState({});
  const [overrideReasons, setOverrideReasons] = useState({});

  // Flatten all findings across all drugs, deduped by checkId/type
  const allSafetyResults = (() => {
    const seen = new Set();
    return Object.values(safetyMap).flat().filter(r => {
      const key = r.checkId || `${r.type}-${r.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

  const safetySum   = SafetyEngine.summarise(allSafetyResults);
  const enginePatient = toEnginePatient(patient);

  // Re-run safety checks whenever drugs change
  useEffect(() => {
    if (drugs.length === 0) { setSafetyMap({}); return; }
    const newMap = {};
    drugs.forEach((rx, idx) => {
      if (!rx.drug_id) return;
      const others = drugs.filter((_, i) => i !== idx).map(r => ({
        drug_id: r.drug_id, strength_id: r.strength_id,
        dosage_amount: r.dosage_amount, dosage_unit: r.dosage_unit,
        frequency: r.frequency, duration_days: r.duration_days, route: r.route || "oral",
      }));
      const results = SafetyEngine.check({
        candidate: { drug_id:rx.drug_id, strength_id:rx.strength_id, dosage_amount:rx.dosage_amount, dosage_unit:rx.dosage_unit, frequency:rx.frequency, duration_days:rx.duration_days, route:rx.route||"oral" },
        activePrescriptions: others,
        patient: enginePatient,
      });
      if (results.length > 0) newMap[rx._id] = results;
    });
    setSafetyMap(newMap);
  }, [drugs, patient]); // eslint-disable-line

  function handleOverride(checkKey, reason) {
    setOverrideReasons(prev => ({ ...prev, [checkKey]: reason }));
  }

  // Save is blocked if any BLOCKED result, or CRITICAL without override
  const canSave = SafetyEngine.canSave(allSafetyResults, overrideReasons);

  const diagKey = Object.keys(AI_SUGGESTIONS).find(k => diagnosis.toLowerCase().includes(k)) || null;
  const aiDrugs = diagKey ? AI_SUGGESTIONS[diagKey] : [];

  function applyAiSuggestions() {
    const newDrugs = aiDrugs.map(s => {
      const dbDrug = DRUGS_RAW.find(d => d.name === s.drug);
      if (!dbDrug) return null;
      const defaultStr = dbDrug.strengths.find(x => x.isDefault) || dbDrug.strengths[0];
      const matchedStr = dbDrug.strengths.find(x => x.label === s.strength) || defaultStr;
      return {
        _id: "rx" + Date.now() + Math.random().toString(36).slice(2) + s.drug.slice(0,3),
        drug_id: dbDrug.id, strength_id: matchedStr?.id ?? null,
        dosage_amount: matchedStr?.val ?? null, dosage_unit: matchedStr?.unit ?? null,
        frequency: s.dose?.match(/OD|BD|TDS|QDS/i)?.[0]?.toUpperCase() ?? null,
        duration_days: parseInt(s.duration) || null,
        route: "oral", instructions: dbDrug.notes || "", is_ai_suggested: true,
      };
    }).filter(Boolean);
    setDrugs(newDrugs);
    setAiApplied(true);
    setShowVerification(false);
  }

  function addFromSearch(drug) {
    const defaultStr = drug.strengths.find(s => s.isDefault) || drug.strengths[0];
    setDrugs(prev => [...prev, {
      _id: "rx" + Date.now() + Math.random().toString(36).slice(2),
      drug_id: drug.id, strength_id: defaultStr?.id ?? null,
      dosage_amount: defaultStr?.val ?? null, dosage_unit: defaultStr?.unit ?? null,
      frequency: null, duration_days: null, route: "oral",
      instructions: drug.notes || "", is_ai_suggested: false,
    }]);
    setSaved(false);
  }

  function addFromParser(parsed) {
    if (!parsed?.best) return;
    const drug = parsed.best;
    const defaultStr = drug.strengths.find(s => s.isDefault) || drug.strengths[0];
    const str = parsed.strength;
    const matchedStr = drug.strengths.find(s => str && s.mg === str.mg) || defaultStr;
    setDrugs(prev => [...prev, {
      _id: "rx" + Date.now() + Math.random().toString(36).slice(2),
      drug_id: drug.id, strength_id: matchedStr?.id ?? null,
      dosage_amount: str?.value ?? matchedStr?.val ?? null,
      dosage_unit:   str?.unit  ?? matchedStr?.unit ?? null,
      frequency: parsed.frequency?.key ?? null,
      duration_days: parsed.duration?.days ?? null,
      route: parsed.route || "oral",
      instructions: parsed.instruction || drug.notes || "",
      is_ai_suggested: false,
    }]);
    setSaved(false);
  }

  function updateDrug(id, fields) {
    setDrugs(prev => prev.map(rx => rx._id === id ? { ...rx, ...fields } : rx));
    setSaved(false);
  }

  function removeDrug(id) {
    setDrugs(prev => prev.filter(rx => rx._id !== id));
    setSaved(false);
  }

  const totalCost = drugs.reduce((sum, rx) => {
    const drug = DRUG_MAP[rx.drug_id];
    const cheapest = drug?.brands.reduce((a,b)=>(a.price||9999)<(b.price||9999)?a:b, drug.brands[0]);
    return sum + (cheapest?.price || 0);
  }, 0);
  const validDrugs = drugs.filter(d => d.drug_id && d.frequency && d.duration_days);
  const rxText = generateRx(patient, drugs.map(rx => {
    const drug = DRUG_MAP[rx.drug_id];
    return { name: drug?.name||"", strength:`${rx.dosage_amount||""} ${rx.dosage_unit||""}`.trim(), dose:rx.frequency||"", duration:rx.duration_days?`${rx.duration_days} days`:"" };
  }).filter(d=>d.name));

  async function handleSave() {
    setSaving(true);
    try {
      // Persist prescription to Supabase if context available
      if (orgId && patient?._encounter_id && patient?._db_id) {
        const rxItems = validDrugs.map(rx => ({
          drug_id:       rx.drug_id,
          strength_id:   rx.strength_id ?? null,
          dosage_amount: rx.dosage_amount ?? null,
          dosage_unit:   rx.dosage_unit  ?? null,
          frequency:     rx.frequency,
          times_per_day: rx.times_per_day ?? null,
          duration_days: rx.duration_days ?? null,
          route:         rx.route ?? "oral",
          instructions:  rx.instructions ?? null,
          is_ai_suggested: false,
        }));
        const { error } = await savePrescription(
          patient._encounter_id,
          patient._db_id,
          orgId,
          staffId,
          rxItems,
          patient._note_id ?? null
        );
        if (error) console.error("[Alera Rx] Save error:", error.message);
      }
    } catch (err) {
      console.error("[Alera Rx] Unexpected error:", err);
    }
    setSaving(false);
    setSaved(true);
    onComplete?.({ rxList: validDrugs.map(rx => {
      const drug = DRUG_MAP[rx.drug_id];
      return { name: drug?.name, dose: `${rx.dosage_amount||""} ${rx.dosage_unit||""} ${rx.frequency||""}`.trim(), duration: rx.duration_days ? `${rx.duration_days} days` : "", instructions: rx.instructions };
    })});
  }

  function handleSendSms() { setSmsSent(true); setTimeout(() => setSmsSent(false), 3000); }

  const s = {
    card: { background: "#fff", borderRadius: 14, border: "1.5px solid #E0DCD4", boxShadow: "0 2px 12px rgba(10,15,30,0.06)" },
    label: { fontSize: 10, color: "#9A9890", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 8 },
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F5F2EC", fontFamily: "'DM Sans',sans-serif", color: "#0A0F1E" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: rgba(30,107,85,0.2); }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #D8D4CC; border-radius: 4px; }
        @keyframes slideIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from{opacity:0}to{opacity:1} }
        @keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
        @keyframes voicePulse { 0%,100%{box-shadow:0 0 0 0 rgba(232,134,10,0.5)}50%{box-shadow:0 0 0 12px rgba(232,134,10,0)} }
        @keyframes saveIn { from{transform:scale(0.8);opacity:0}to{transform:scale(1);opacity:1} }
        @keyframes slideRight { from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1} }
        @keyframes tooltipIn { from{opacity:0;transform:translateX(-50%) translateY(4px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: "#0A0F1E", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: "#fff", letterSpacing: -0.5 }}>al<span style={{ color: "#27856A" }}>era</span></div>
          <div style={{ width: 1, height: 20, background: "#1A2040" }} />
          <div style={{ fontSize: 12, color: "#5A6580" }}>Prescription</div>
          <span style={{ color: "#2A3050" }}>›</span>
          <span style={{ fontSize: 12, color: "#7A8290" }}>{patient.name}</span>
          <span style={{ color: "#2A3050" }}>›</span>
          <span style={{ fontSize: 12, color: "#27856A", fontFamily: "'JetBrains Mono',monospace" }}>{patient.id}</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: "#27856A", background: "rgba(30,107,85,0.1)", padding: "3px 10px", borderRadius: 4, border: "1px solid rgba(30,107,85,0.25)" }}>
            {validDrugs.length} drug{validDrugs.length !== 1 ? "s" : ""} · ₦{totalCost.toLocaleString()}
          </div>
          {safetySum.total > 0 && (
            <div style={{
              fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
              color: safetySum.blocked > 0 ? "#7B1D1D" : safetySum.critical > 0 ? "#7B3A00" : "#C0392B",
              background: safetySum.blocked > 0 ? "rgba(192,57,43,0.15)" : "rgba(192,57,43,0.08)",
              padding: "3px 10px", borderRadius: 4,
              border: `1px solid ${safetySum.blocked > 0 ? "rgba(192,57,43,0.4)" : "rgba(192,57,43,0.25)"}`,
              animation: "fadeIn 0.3s ease",
            }}>
              {safetySum.blocked > 0 ? "🚫" : "⚠"} {safetySum.total} alert{safetySum.total !== 1 ? "s" : ""}
              {safetySum.blocked > 0 ? " — BLOCKED" : safetySum.critical > 0 ? " — CRITICAL" : ""}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", minHeight: "calc(100vh - 58px)" }}>

        {/* ── Left: Prescription builder ── */}
        <div style={{ padding: "28px 24px 40px 28px", overflowY: "auto" }}>

          {/* Patient + diagnosis strip */}
          <div style={{ ...s.card, marginBottom: 20, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#0A0F1E", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
              {patient.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14 }}>{patient.name}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                {[`${patient.age}yrs`, `${patient.sex}`, `${patient.weight}kg`, `Allergies: ${patient.allergies}`, patient.insurance].map((m, i) => (
                  <span key={i} style={{ fontSize: 11, color: "#6B7080", background: "#F5F2EC", padding: "1px 7px", borderRadius: 4 }}>{m}</span>
                ))}
              </div>
            </div>
            <div style={{ padding: "8px 14px", background: "#E8F4F0", borderRadius: 8, border: "1px solid rgba(30,107,85,0.2)" }}>
              <div style={{ fontSize: 10, color: "#9A9890", fontFamily: "'JetBrains Mono',monospace", marginBottom: 2 }}>DIAGNOSIS</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1E6B55" }}>{diagnosis}</div>
            </div>
          </div>

          {/* AI suggestion banner */}
          {!aiApplied && aiDrugs.length > 0 && (
            <div style={{
              background: "linear-gradient(135deg,#0A0F1E,#0E1830)",
              border: "1.5px solid rgba(30,107,85,0.35)",
              borderRadius: 14, padding: "18px 20px", marginBottom: 20,
              animation: "slideIn 0.3s ease",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#1E6B55,#27856A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff" }}>✦</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: "#fff" }}>AI Prescription Recommendation</div>
                <span style={{ marginLeft: "auto", fontSize: 10, padding: "2px 8px", background: "rgba(30,107,85,0.2)", color: "#27856A", borderRadius: 4, fontFamily: "'JetBrains Mono',monospace" }}>FMOH GUIDELINES</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                {aiDrugs.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 9, border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#1E6B55", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", fontFamily: "'Syne',sans-serif", flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>{d.drug} {d.strength}</span>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>{d.dose} · {d.duration}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", maxWidth: 200, textAlign: "right" }}>{d.reason}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setShowVerification(true); }} style={{
                  padding: "10px 22px", background: "#1E6B55", color: "#fff",
                  border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: "pointer", fontFamily: "'Syne',sans-serif",
                  boxShadow: "0 4px 14px rgba(30,107,85,0.4)", transition: "all 0.15s",
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "#27856A"}
                  onMouseLeave={e => e.currentTarget.style.background = "#1E6B55"}
                >🔑 Review &amp; Apply {aiDrugs.length} drugs</button>
                <button onClick={() => setAiApplied(true)} style={{
                  padding: "10px 18px", background: "transparent", color: "rgba(255,255,255,0.5)",
                  border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 13,
                  cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                }}>Build manually instead</button>
              </div>
            </div>
          )}

          {/* AI Verification Gate */}
          {showVerification && (
            <AiVerificationGate
              drugs={aiDrugs}
              onConfirm={applyAiSuggestions}
              onCancel={() => setShowVerification(false)}
            />
          )}

          {/* ── Entry mode toggle ── */}
          <div style={{ display:"flex", gap:0, marginBottom:14, background:"#fff", borderRadius:9, border:"1.5px solid #E0DCD4", padding:3, width:"fit-content" }}>
            {[{key:"search",label:"🔍 Search"},{key:"quick",label:"⌨ Quick Entry"},{key:"both",label:"⊞ Both"}].map(m=>(
              <button key={m.key} onClick={()=>setEntryMode(m.key)} style={{ padding:"6px 16px", borderRadius:6, border:"none", background:entryMode===m.key?"#0A0F1E":"transparent", color:entryMode===m.key?"#fff":"#6B7080", fontSize:12.5, fontWeight:entryMode===m.key?600:400, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.14s" }}>{m.label}</button>
            ))}
          </div>

          {/* Entry panels */}
          {(entryMode === "quick" || entryMode === "both") && (
            <QuickEntry onAdd={addFromParser} />
          )}
          {(entryMode === "search" || entryMode === "both") && (
            <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #E0DCD4", padding:"16px 18px", marginBottom:14, boxShadow:"0 1px 6px rgba(10,15,30,0.04)" }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:13.5, color:"#0A0F1E", marginBottom:12 }}>Search &amp; Add Drug</div>
              <DrugSearchDropdown onSelect={addFromSearch} orgId={orgId} />
            </div>
          )}

          {/* Drug list — engine-native DrugCards */}
          <div style={{ marginBottom: 12 }}>
            {drugs.length === 0 && (
              <div style={{ padding:"36px 20px", textAlign:"center", border:"2px dashed #E0DCD4", borderRadius:12, color:"#9A9890" }}>
                <div style={{ fontSize:32, marginBottom:10 }}>💊</div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:16, color:"#0A0F1E", marginBottom:5 }}>No drugs yet</div>
                <div style={{ fontSize:13 }}>Search for a drug above or type shorthand in Quick Entry</div>
              </div>
            )}
            {drugs.map((rx, i) => (
              <div key={rx._id} style={{ animation: "slideIn 0.25s ease" }}>
                <DrugCard
                  rx={rx} index={i}
                  safetyResults={safetyMap[rx._id] || []}
                  overrideReasons={overrideReasons}
                  onOverride={handleOverride}
                  onChange={fields => updateDrug(rx._id, fields)}
                  onRemove={() => removeDrug(rx._id)}
                />
              </div>
            ))}
          </div>

          {/* Cost summary */}
          {drugs.length > 0 && (
            <div style={{ ...s.card, padding: "18px 20px", marginBottom: 20, animation: "fadeIn 0.3s ease" }}>
              <div style={s.label}>Cost Breakdown</div>
              {drugs.map((rx, i) => {
                const drug = DRUG_MAP[rx.drug_id];
                const cheapest = drug?.brands.reduce((a,b)=>(a.price||9999)<(b.price||9999)?a:b, drug?.brands[0]);
                return drug ? (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F0EDE8", fontSize: 13 }}>
                  <span>{drug.name} {rx.dosage_amount ? `${rx.dosage_amount} ${rx.dosage_unit||""}`.trim() : ""} × {rx.duration_days ? `${rx.duration_days}d` : "—"}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#1E6B55" }}>₦{(cheapest?.price || 0).toLocaleString()}</span>
                </div>
                ) : null;
              })}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 8, borderTop: "2px solid #0A0F1E" }}>
                <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16 }}>Total (Meds)</span>
                <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: "#1E6B55" }}>₦{totalCost.toLocaleString()}</span>
              </div>
              {patient.insurance !== "None" && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#1A5FA8", background: "#E8F0FC", padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(26,95,168,0.2)" }}>
                  🏥 {patient.insurance} coverage active — submit claim at billing step
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {saved ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", background: "#E8F4F0", border: "1.5px solid rgba(30,107,85,0.3)", borderRadius: 10, animation: "saveIn 0.4s ease" }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, color: "#1E6B55" }}>Prescription saved · Proceed to Billing →</span>
              </div>
            ) : (
              <>
                {canPrescribe ? (
                <button
                  onClick={handleSave}
                  disabled={validDrugs.length === 0 || saving || !canSave}
                  style={{
                    padding: "12px 26px", borderRadius: 10, border: "none",
                    background: validDrugs.length > 0 && canSave ? "#1E6B55" : "#C8C4BC",
                    color: "#fff", fontSize: 14, fontWeight: 700,
                    cursor: validDrugs.length > 0 && canSave ? "pointer" : "not-allowed",
                    fontFamily: "'Syne',sans-serif", display: "flex", alignItems: "center", gap: 8,
                    boxShadow: validDrugs.length > 0 && canSave ? "0 4px 16px rgba(30,107,85,0.3)" : "none",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={e => { if (validDrugs.length > 0 && canSave) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(30,107,85,0.4)"; } }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ""; }}
                >
                  {saving ? <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> : "✓"} Save Prescription
                </button>
                ) : canDispense ? (
                  <button onClick={handleSave} disabled={validDrugs.length === 0 || saving || !canSave} style={{ padding: "12px 26px", borderRadius: 10, border: "none", background: canSave ? "#1A5FA8" : "#C8C4BC", color: "#fff", fontSize: 14, fontWeight: 700, cursor: canSave ? "pointer" : "not-allowed", fontFamily: "'Syne',sans-serif", display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s" }}>
                    💊 Confirm Dispensed
                  </button>
                ) : (
                  <div style={{ padding: "10px 16px", background: "#FEF5E7", border: "1px solid rgba(201,122,16,0.3)", borderRadius: 9, fontSize: 13, color: "#C97A10" }}>
                    👁 View only — your role cannot prescribe or dispense
                  </div>
                )}
                <button onClick={() => setShowRx(true)} disabled={validDrugs.length === 0} style={{
                  padding: "12px 18px", borderRadius: 10, border: "1.5px solid #E0DCD4",
                  background: "transparent", color: "#6B7080", fontSize: 13.5,
                  cursor: validDrugs.length > 0 ? "pointer" : "not-allowed",
                  fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s",
                }}
                  onMouseEnter={e => { if (validDrugs.length > 0) { e.currentTarget.style.borderColor = "#1A5FA8"; e.currentTarget.style.color = "#1A5FA8"; } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#E0DCD4"; e.currentTarget.style.color = "#6B7080"; }}
                >🖨 Preview Rx</button>
                <button onClick={handleSendSms} disabled={validDrugs.length === 0} style={{
                  padding: "12px 18px", borderRadius: 10,
                  border: `1.5px solid ${smsSent ? "rgba(30,107,85,0.4)" : "#E0DCD4"}`,
                  background: smsSent ? "#E8F4F0" : "transparent",
                  color: smsSent ? "#1E6B55" : "#6B7080", fontSize: 13.5,
                  cursor: validDrugs.length > 0 ? "pointer" : "not-allowed",
                  fontFamily: "'DM Sans',sans-serif", transition: "all 0.2s",
                }}>
                  {smsSent ? "✓ SMS Sent!" : "📨 Send to patient"}
                </button>
              </>
            )}
            {!canSave && allSafetyResults.length > 0 && (
              <div style={{ fontSize: 11, color: "#C0392B", fontFamily: "'JetBrains Mono',monospace", alignSelf: "center" }}>
                ⚠ Resolve blocked/critical alerts before saving
              </div>
            )}
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div style={{ background: "#0A0F1E", borderLeft: "1px solid #1A2040", padding: "24px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 22 }}>

          {/* Rx preview */}
          {showRx && (
            <div style={{ animation: "slideRight 0.3s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: "#3A4060", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "1px", textTransform: "uppercase" }}>Prescription Preview</div>
                <button onClick={() => setShowRx(false)} style={{ background: "none", border: "none", color: "#3A4060", cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
              <pre style={{
                background: "#050810", border: "1px solid #1A2040",
                borderRadius: 10, padding: "14px", fontSize: 10.5,
                color: "rgba(255,255,255,0.6)", fontFamily: "'JetBrains Mono',monospace",
                lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word",
                maxHeight: 320, overflowY: "auto",
              }}>{rxText}</pre>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button style={{ flex: 1, padding: "8px", background: "rgba(30,107,85,0.2)", color: "#27856A", border: "1px solid rgba(30,107,85,0.3)", borderRadius: 7, fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>📨 SMS</button>
                <button style={{ flex: 1, padding: "8px", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid #1A2040", borderRadius: 7, fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>🖨 Print</button>
              </div>
            </div>
          )}

          {/* Drug count */}
          <div>
            <div style={{ fontSize: 10, color: "#3A4060", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Prescription Status</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "Drugs",    value: validDrugs.length },
                { label: "Total",    value: `₦${totalCost.toLocaleString()}` },
                { label: "Alerts",   value: safetySum.total,
                  color: safetySum.blocked > 0 ? "#C0392B" : safetySum.critical > 0 ? "#E07030" : safetySum.total > 0 ? "#E8860A" : "#27856A" },
                { label: "Critical", value: safetySum.blocked + safetySum.critical || "—",
                  color: safetySum.blocked + safetySum.critical > 0 ? "#C0392B" : "#27856A" },
              ].map(item => (
                <div key={item.label} style={{ background: "#101828", borderRadius: 8, padding: "10px 12px", border: "1px solid #1A2040" }}>
                  <div style={{ fontSize: 9, color: "#3A4060", fontFamily: "'JetBrains Mono',monospace", marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 18, color: item.color || "#fff" }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Patient allergy reminder */}
          <div style={{ padding: "12px 14px", background: patient.allergies !== "None" ? "rgba(192,57,43,0.1)" : "rgba(30,107,85,0.1)", border: `1px solid ${patient.allergies !== "None" ? "rgba(192,57,43,0.3)" : "rgba(30,107,85,0.25)"}`, borderRadius: 10 }}>
            <div style={{ fontSize: 10, color: "#3A4060", fontFamily: "'JetBrains Mono',monospace", marginBottom: 5 }}>PATIENT ALLERGIES</div>
            <div style={{ fontSize: 13, color: patient.allergies !== "None" ? "#E07070" : "#27856A", fontWeight: 600 }}>
              {patient.allergies !== "None" ? `🚨 ${patient.allergies}` : "✓ None on record"}
            </div>
          </div>

          {/* Generic alternatives note */}
          <div>
            <div style={{ fontSize: 10, color: "#3A4060", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Generic Alternatives</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
              All suggested drugs are already generic equivalents. Tap any drug name in the list to search for alternatives.
            </div>
          </div>

          {/* Delivery methods */}
          <div>
            <div style={{ fontSize: 10, color: "#3A4060", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Rx Delivery</div>
            {[
              { icon: "📱", label: "Patient App", desc: "Auto-pushed on save", active: true },
              { icon: "📨", label: "SMS to " + patient.phone.slice(0, 10) + "…", desc: "Send now", active: false },
              { icon: "🖨", label: "Print slip", desc: "A5 format", active: false },
            ].map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #1A2040" }}>
                <span style={{ fontSize: 16 }}>{d.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, color: d.active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)", fontWeight: d.active ? 600 : 400 }}>{d.label}</div>
                  <div style={{ fontSize: 10, color: "#3A4060" }}>{d.desc}</div>
                </div>
                {d.active && <span style={{ fontSize: 10, color: "#27856A", fontFamily: "'JetBrains Mono',monospace" }}>AUTO</span>}
              </div>
            ))}
          </div>

          {/* Refill reminders */}
          <div>
            <div style={{ fontSize: 10, color: "#3A4060", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Smart Reminders</div>
            {["Dose reminder: daily via app", "Refill alert: 2 days before last dose", "Follow-up: 48hrs (auto-set)"].map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid #1A2040" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#27856A", flexShrink: 0 }} />
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)" }}>{r}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
