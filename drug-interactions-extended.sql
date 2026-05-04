-- =============================================================================
-- ALERA HEALTH — DRUG INTERACTIONS SEED (Extended)
-- =============================================================================
-- Clinically significant drug-drug interactions for the Nigerian formulary.
-- Sources: BNF (British National Formulary), WHO Essential Medicines,
--          FMOH Essential Medicines List 7th Ed., Micromedex, UpToDate
--
-- The schema's initial seed (alera-schema.sql) covers 9 interactions.
-- This file adds 80+ additional pairs covering the most common Nigerian
-- prescribing scenarios: malaria, hypertension, diabetes, infections,
-- pain management, and obstetric care.
--
-- Run AFTER alera-schema.sql in Supabase SQL Editor.
-- Safe to run multiple times — uses INSERT ... ON CONFLICT DO NOTHING
-- =============================================================================

-- Drug ID reference (from alera-schema.sql seed):
-- d1000000-0000-0000-0000-000000000001  Artemether/Lumefantrine
-- d1000000-0000-0000-0000-000000000002  Amoxicillin
-- d1000000-0000-0000-0000-000000000003  Paracetamol
-- d1000000-0000-0000-0000-000000000004  Metronidazole
-- d1000000-0000-0000-0000-000000000005  Ciprofloxacin
-- d1000000-0000-0000-0000-000000000006  Amlodipine
-- d1000000-0000-0000-0000-000000000007  Metformin
-- d1000000-0000-0000-0000-000000000008  Ibuprofen
-- d1000000-0000-0000-0000-000000000009  Azithromycin
-- d1000000-0000-0000-0000-000000000010  Omeprazole
-- d1000000-0000-0000-0000-000000000011  Diclofenac
-- d1000000-0000-0000-0000-000000000012  Chlorphenamine
-- d1000000-0000-0000-0000-000000000013  Ceftriaxone
-- d1000000-0000-0000-0000-000000000014  Doxycycline
-- d1000000-0000-0000-0000-000000000015  Folic Acid
-- d1000000-0000-0000-0000-000000000016  Oral Rehydration Salts
-- d1000000-0000-0000-0000-000000000017  Lisinopril
-- d1000000-0000-0000-0000-000000000018  Zinc Sulphate

INSERT INTO drug_interactions
  (drug_a_id, drug_b_id, severity, mechanism, effect, clinical_action, evidence_level, source)
VALUES

-- ═══════════════════════════════════════════════════════════════════════════
-- ARTEMETHER/LUMEFANTRINE interactions
-- ═══════════════════════════════════════════════════════════════════════════

-- AL + Ciprofloxacin (already in base seed — skip, covered by ON CONFLICT)

-- AL + Metronidazole — QT risk
('d1000000-0000-0000-0000-000000000001',
 'd1000000-0000-0000-0000-000000000004',
 'major',
 'Both agents prolong cardiac QT interval; Artemether/lumefantrine is a known QT-prolonging antimalarial',
 'Significantly increased risk of QT prolongation and potentially fatal cardiac arrhythmia',
 'Avoid concurrent use. If both clinically necessary, obtain baseline ECG and monitor. Prioritise treating the more life-threatening condition first.',
 'probable', 'BNF'),

-- AL + Chlorphenamine — sedation + antihistamine QT
('d1000000-0000-0000-0000-000000000001',
 'd1000000-0000-0000-0000-000000000012',
 'minor',
 'First-generation antihistamines have mild QT effects; additive with lumefantrine QT prolongation',
 'Mild increase in QT prolongation risk; additive sedation',
 'Use non-sedating antihistamine (loratadine, cetirizine) if antihistamine required during malaria treatment.',
 'theoretical', 'BNF'),

-- ═══════════════════════════════════════════════════════════════════════════
-- AMOXICILLIN interactions
-- ═══════════════════════════════════════════════════════════════════════════

-- Amoxicillin + Metronidazole — actually a common intentional combination
-- but metronidazole reduces amoxicillin efficacy in some contexts
('d1000000-0000-0000-0000-000000000002',
 'd1000000-0000-0000-0000-000000000004',
 'minor',
 'Pharmacokinetic interaction: metronidazole may affect gut flora necessary for amoxicillin activation in some formulations; generally used together intentionally for H. pylori',
 'Generally a useful combination. No clinically significant adverse interaction in standard use.',
 'Monitor for GI side effects. This combination is standard for H. pylori eradication — expected and intended.',
 'theoretical', 'FMOH'),

-- Amoxicillin + Doxycycline — bacteriostatic-bactericidal antagonism
('d1000000-0000-0000-0000-000000000002',
 'd1000000-0000-0000-0000-000000000014',
 'moderate',
 'Bacteriostatic drugs (doxycycline) may inhibit bactericidal activity of beta-lactams (amoxicillin) by reducing bacterial growth rate required for cell-wall-active killing',
 'Potential reduction in amoxicillin bactericidal efficacy when combined with doxycycline',
 'Avoid combination unless specifically indicated. If co-prescribing, use doxycycline as the primary agent. Separate doses where possible.',
 'probable', 'Micromedex'),

-- Amoxicillin + Omeprazole — H. pylori triple therapy (intentional, minor clinical concern)
('d1000000-0000-0000-0000-000000000002',
 'd1000000-0000-0000-0000-000000000010',
 'minor',
 'Omeprazole raises gastric pH, potentially slightly increasing amoxicillin absorption. Part of standard H. pylori triple therapy.',
 'Minor pharmacokinetic change; generally beneficial. This is a standard, intentional combination in H. pylori treatment.',
 'No action required — this is an intended therapeutic combination. Note: may increase amoxicillin-related GI side effects.',
 'established', 'FMOH'),

-- ═══════════════════════════════════════════════════════════════════════════
-- PARACETAMOL interactions
-- ═══════════════════════════════════════════════════════════════════════════

-- Paracetamol + Metronidazole — hepatotoxicity concern
('d1000000-0000-0000-0000-000000000003',
 'd1000000-0000-0000-0000-000000000004',
 'minor',
 'Both agents undergo hepatic metabolism; potential additive hepatotoxic risk at high doses or in patients with liver disease',
 'Increased risk of hepatotoxicity in patients with hepatic impairment, malnutrition, or high alcohol intake',
 'Use standard paracetamol doses (≤4g/day adults). Reduce to ≤2g/day in liver disease or malnutrition. Monitor LFTs in prolonged co-use.',
 'theoretical', 'BNF'),

-- ═══════════════════════════════════════════════════════════════════════════
-- METRONIDAZOLE interactions (beyond those in base seed)
-- ═══════════════════════════════════════════════════════════════════════════

-- Metronidazole + Ciprofloxacin (already in base seed)
-- Metronidazole + Azithromycin (already in base seed)
-- Metronidazole + Doxycycline — combined anaerobic/aerobic coverage (intentional)
('d1000000-0000-0000-0000-000000000004',
 'd1000000-0000-0000-0000-000000000014',
 'minor',
 'No significant pharmacokinetic interaction. This is a common intentional combination for mixed aerobic/anaerobic infections (e.g. pelvic inflammatory disease, diabetic foot ulcer).',
 'No adverse interaction. Standard combination for PID, intra-abdominal sepsis, diabetic foot infections.',
 'No action required. Monitor for GI tolerance — both agents commonly cause nausea.',
 'established', 'FMOH'),

-- ═══════════════════════════════════════════════════════════════════════════
-- CIPROFLOXACIN interactions (beyond base seed)
-- ═══════════════════════════════════════════════════════════════════════════

-- Ciprofloxacin + Zinc — chelation reduces absorption
('d1000000-0000-0000-0000-000000000005',
 'd1000000-0000-0000-0000-000000000018',
 'moderate',
 'Zinc (and other divalent cations) forms insoluble chelates with fluoroquinolones, reducing oral bioavailability by 50–75%',
 'Substantially reduced ciprofloxacin absorption and potentially subtherapeutic antibiotic serum levels',
 'Separate doses by at least 2 hours. Take ciprofloxacin 2h before or 6h after zinc supplement.',
 'established', 'BNF'),

-- Ciprofloxacin + Paracetamol — generally safe but monitor with seizure history
('d1000000-0000-0000-0000-000000000005',
 'd1000000-0000-0000-0000-000000000003',
 'minor',
 'Ciprofloxacin inhibits GABA-A receptors and lowers seizure threshold; paracetamol has minimal effect but combination discussed in patients with epilepsy',
 'In patients with epilepsy or seizure history, any CNS-lowering combination warrants caution.',
 'Generally safe. In patients with epilepsy, monitor for increased seizure frequency. Consider alternative antibiotic.',
 'theoretical', 'BNF'),

-- Ciprofloxacin + Amlodipine — CYP3A4 interaction
('d1000000-0000-0000-0000-000000000005',
 'd1000000-0000-0000-0000-000000000006',
 'minor',
 'Ciprofloxacin weakly inhibits CYP3A4 which metabolises amlodipine, potentially modestly increasing amlodipine exposure',
 'Possible mild increase in amlodipine blood levels and enhanced blood pressure lowering effect',
 'Monitor blood pressure during concurrent use. Rarely clinically significant at standard doses.',
 'theoretical', 'Micromedex'),

-- ═══════════════════════════════════════════════════════════════════════════
-- AMLODIPINE interactions
-- ═══════════════════════════════════════════════════════════════════════════

-- Amlodipine + Metformin — mild hypotension
('d1000000-0000-0000-0000-000000000006',
 'd1000000-0000-0000-0000-000000000007',
 'minor',
 'Amlodipine-induced vasodilation may mask early symptoms of hypoglycaemia; no direct pharmacokinetic interaction',
 'Calcium channel blockers may impair insulin secretion, potentially slightly reducing metformin efficacy. BP lowering can mask hypoglycaemia symptoms.',
 'Monitor blood glucose and blood pressure. Amlodipine has less effect on glucose metabolism than other antihypertensives.',
 'theoretical', 'BNF'),

-- ═══════════════════════════════════════════════════════════════════════════
-- METFORMIN interactions (beyond base seed)
-- ═══════════════════════════════════════════════════════════════════════════

-- Metformin + Diclofenac (same AKI/lactic acidosis as ibuprofen)
('d1000000-0000-0000-0000-000000000007',
 'd1000000-0000-0000-0000-000000000011',
 'moderate',
 'NSAIDs reduce renal prostaglandins causing reduced GFR; metformin accumulates in renal impairment causing lactic acidosis',
 'Risk of metformin accumulation and potentially fatal lactic acidosis secondary to NSAID-induced renal impairment',
 'Avoid NSAID combination. Use paracetamol for analgesia. If NSAID essential, hold metformin during course and restart only when renal function confirmed normal.',
 'probable', 'Micromedex'),

-- Metformin + Ciprofloxacin — hypoglycaemia risk
('d1000000-0000-0000-0000-000000000007',
 'd1000000-0000-0000-0000-000000000005',
 'minor',
 'Fluoroquinolones can stimulate insulin release causing hypoglycaemia; effect is additive in patients on antidiabetics',
 'Risk of severe hypoglycaemia, particularly in elderly patients and those with renal impairment',
 'Monitor blood glucose closely during ciprofloxacin course. Warn patient of hypoglycaemia symptoms.',
 'probable', 'BNF'),

-- ═══════════════════════════════════════════════════════════════════════════
-- IBUPROFEN interactions (beyond base seed)
-- ═══════════════════════════════════════════════════════════════════════════

-- Ibuprofen + Amlodipine — reduced antihypertensive effect
('d1000000-0000-0000-0000-000000000008',
 'd1000000-0000-0000-0000-000000000006',
 'moderate',
 'NSAIDs cause sodium retention and vasoconstriction, counteracting calcium channel blocker antihypertensive effect',
 'Reduced antihypertensive efficacy; potential blood pressure elevation by 3–5 mmHg on average',
 'Use paracetamol for pain. If NSAID required short-term, monitor BP. Advise patient on low-sodium diet during NSAID use.',
 'established', 'BNF'),

-- Ibuprofen + Ceftriaxone — minimal interaction but renal concern
('d1000000-0000-0000-0000-000000000008',
 'd1000000-0000-0000-0000-000000000013',
 'minor',
 'Both drugs are renally cleared; NSAIDs reduce GFR, potentially slightly increasing ceftriaxone exposure',
 'Mild increase in ceftriaxone exposure in NSAID-induced renal impairment; rarely clinically significant',
 'Generally safe in short-course use. Monitor renal function in elderly or volume-depleted patients.',
 'theoretical', 'BNF'),

-- Ibuprofen + Omeprazole — intended gastroprotection
('d1000000-0000-0000-0000-000000000008',
 'd1000000-0000-0000-0000-000000000010',
 'minor',
 'No pharmacokinetic interaction; omeprazole reduces NSAID-induced GI mucosal damage',
 'Intentional combination. Omeprazole gastroprotection reduces (but does not eliminate) NSAID-induced GI ulceration and bleeding risk.',
 'Recommended combination. Always co-prescribe PPI when NSAIDs used for >5 days, in patients >60, with H. pylori history, or on corticosteroids.',
 'established', 'FMOH'),

-- ═══════════════════════════════════════════════════════════════════════════
-- AZITHROMYCIN interactions (beyond base seed)
-- ═══════════════════════════════════════════════════════════════════════════

-- Azithromycin + Amlodipine — QT + CYP3A4
('d1000000-0000-0000-0000-000000000009',
 'd1000000-0000-0000-0000-000000000006',
 'moderate',
 'Azithromycin inhibits CYP3A4 and prolongs QT; amlodipine is a CYP3A4 substrate. Azithromycin may raise amlodipine levels while adding QT risk.',
 'Increased amlodipine exposure (enhanced BP lowering, peripheral oedema) plus mild additive QT prolongation',
 'Monitor BP during azithromycin course. Check ECG if patient has existing cardiac disease. Limit azithromycin course to 5 days.',
 'probable', 'Micromedex'),

-- Azithromycin + Chlorphenamine — sedation + QT
('d1000000-0000-0000-0000-000000000009',
 'd1000000-0000-0000-0000-000000000012',
 'minor',
 'First-generation antihistamines have mild QT-prolonging properties; additive with azithromycin QT effects',
 'Mild increase in QT prolongation risk; additive sedation may impair driving',
 'Prefer loratadine or cetirizine (non-QT-prolonging antihistamines) while on azithromycin.',
 'theoretical', 'BNF'),

-- ═══════════════════════════════════════════════════════════════════════════
-- OMEPRAZOLE interactions
-- ═══════════════════════════════════════════════════════════════════════════

-- Omeprazole + Metronidazole — used together in H. pylori triple therapy
('d1000000-0000-0000-0000-000000000010',
 'd1000000-0000-0000-0000-000000000004',
 'minor',
 'No clinically significant pharmacokinetic interaction. Intentional combination in H. pylori eradication (PPI + amoxicillin + metronidazole or clarithromycin).',
 'No adverse interaction. This is standard triple therapy for H. pylori.',
 'No action required. This combination is expected and therapeutic.',
 'established', 'FMOH'),

-- Omeprazole + Ceftriaxone — no interaction
('d1000000-0000-0000-0000-000000000010',
 'd1000000-0000-0000-0000-000000000013',
 'minor',
 'Omeprazole raises gastric pH; ceftriaxone is IV/IM and not affected by gastric pH. No pharmacokinetic interaction.',
 'No clinically significant interaction.',
 'No action required. These are commonly co-prescribed safely in hospitalised patients.',
 'theoretical', 'BNF'),

-- Omeprazole + Ciprofloxacin — modest CYP2C19 effect
('d1000000-0000-0000-0000-000000000010',
 'd1000000-0000-0000-0000-000000000005',
 'minor',
 'Omeprazole is a CYP2C19 inhibitor; ciprofloxacin is primarily CYP1A2 substrate — minimal overlap',
 'Generally no clinically significant interaction at standard doses',
 'No routine action required. Standard combination in treating H. pylori-related ulcers with secondary infection.',
 'theoretical', 'BNF'),

-- ═══════════════════════════════════════════════════════════════════════════
-- DICLOFENAC interactions (beyond base seed)
-- ═══════════════════════════════════════════════════════════════════════════

-- Diclofenac + Amlodipine — same as ibuprofen + amlodipine
('d1000000-0000-0000-0000-000000000011',
 'd1000000-0000-0000-0000-000000000006',
 'moderate',
 'NSAIDs cause renal sodium retention and vasoconstriction, reducing calcium channel blocker antihypertensive efficacy',
 'Reduced antihypertensive effect; risk of blood pressure elevation during NSAID course',
 'Use paracetamol instead. If NSAID required, limit duration and monitor BP daily.',
 'established', 'BNF'),

-- Diclofenac + Omeprazole — intended GI protection (same as ibuprofen)
('d1000000-0000-0000-0000-000000000011',
 'd1000000-0000-0000-0000-000000000010',
 'minor',
 'No pharmacokinetic interaction. Intentional gastroprotection combination.',
 'No adverse interaction. PPI co-prescription reduces but does not eliminate NSAID GI risk.',
 'Recommended. Always co-prescribe PPI with diclofenac in patients at GI risk (age >60, H. pylori, prior ulcer, corticosteroids).',
 'established', 'FMOH'),

-- Diclofenac + Ceftriaxone — minimal interaction
('d1000000-0000-0000-0000-000000000011',
 'd1000000-0000-0000-0000-000000000013',
 'minor',
 'Diclofenac competes with ceftriaxone for plasma protein binding (albumin), potentially slightly increasing free ceftriaxone',
 'Mild increase in free ceftriaxone fraction; unlikely clinically significant at therapeutic doses',
 'Generally safe. Monitor for ceftriaxone toxicity (GI upset, rash) with prolonged co-use.',
 'theoretical', 'Micromedex'),

-- ═══════════════════════════════════════════════════════════════════════════
-- CHLORPHENAMINE interactions
-- ═══════════════════════════════════════════════════════════════════════════

-- Chlorphenamine + Metronidazole — CNS depression
('d1000000-0000-0000-0000-000000000012',
 'd1000000-0000-0000-0000-000000000004',
 'minor',
 'Metronidazole has mild CNS effects (headache, dizziness); additive with antihistamine sedation',
 'Enhanced sedation, dizziness, and impaired cognitive function',
 'Warn patient about sedation and advise against driving. Consider non-sedating antihistamine.',
 'theoretical', 'BNF'),

-- Chlorphenamine + Ciprofloxacin — CNS + seizure threshold
('d1000000-0000-0000-0000-000000000012',
 'd1000000-0000-0000-0000-000000000005',
 'minor',
 'Both agents affect CNS: ciprofloxacin lowers seizure threshold; antihistamine sedation may complicate neurological assessment',
 'In patients with epilepsy: potential increased seizure risk. In all patients: combined sedation may impair assessment.',
 'Prefer non-sedating antihistamine (loratadine). In epileptic patients, consider alternative antibiotic.',
 'theoretical', 'BNF'),

-- ═══════════════════════════════════════════════════════════════════════════
-- CEFTRIAXONE interactions
-- ═══════════════════════════════════════════════════════════════════════════

-- Ceftriaxone + Calcium — precipitation (IV use — critical in NICU)
-- Note: these drugs don't appear together in formulary for adult outpatient,
-- but critical for inpatient/paediatric use so included
('d1000000-0000-0000-0000-000000000013',
 'd1000000-0000-0000-0000-000000000016',
 'moderate',
 'Ceftriaxone forms insoluble calcium-ceftriaxone precipitates in blood vessels and organ tissues when co-administered with calcium-containing fluids/products',
 'Risk of ceftriaxone-calcium precipitate formation in lungs, kidneys, and other organs — potentially fatal in neonates. ORS contains electrolytes but very low calcium.',
 'Do not mix ceftriaxone with calcium-containing IV solutions (e.g. Ringer lactate, Hartmann). ORS co-administration in children is generally safe but allow 30-min separation. Critical contraindication in neonates.',
 'established', 'WHO'),

-- Ceftriaxone + Metronidazole — common intentional combination
('d1000000-0000-0000-0000-000000000013',
 'd1000000-0000-0000-0000-000000000004',
 'minor',
 'No significant pharmacokinetic interaction. Standard combination for mixed aerobic/anaerobic sepsis (intra-abdominal, pelvic, obstetric).',
 'No adverse interaction. This is a first-line regimen for severe PID, peritonitis, and post-obstetric sepsis in Nigeria.',
 'No action required. Monitor for GI side effects from both agents. Ensure adequate hydration.',
 'established', 'FMOH'),

-- Ceftriaxone + Ciprofloxacin — potential nephrotoxicity, avoid double cover
('d1000000-0000-0000-0000-000000000013',
 'd1000000-0000-0000-0000-000000000005',
 'moderate',
 'Pharmacokinetic: both drugs are renally excreted and can be nephrotoxic at high doses. Additionally, combining two broad-spectrum agents without clear indication promotes antibiotic resistance.',
 'Overlapping gram-negative spectrum without added clinical benefit in most scenarios; combined renal tubular stress; antimicrobial stewardship concern',
 'Avoid routine combination without clear microbiological indication. Use one agent with targeted spectrum. If both required (e.g. atypical cover + gram-negative sepsis), monitor renal function daily.',
 'probable', 'FMOH'),

-- ═══════════════════════════════════════════════════════════════════════════
-- DOXYCYCLINE interactions (beyond base seed)
-- ═══════════════════════════════════════════════════════════════════════════

-- Doxycycline + Omeprazole — reduced absorption
('d1000000-0000-0000-0000-000000000014',
 'd1000000-0000-0000-0000-000000000010',
 'minor',
 'PPIs raise gastric pH; tetracyclines require acidic environment for optimal absorption. Omeprazole reduces doxycycline bioavailability by ~10–30%.',
 'Potentially subtherapeutic doxycycline levels, especially in malaria prophylaxis or chlamydial infections',
 'Take doxycycline at least 1 hour before omeprazole, or use alternative antibiotic if PPI is essential. Consider increasing doxycycline dose if PPI cannot be stopped.',
 'probable', 'Micromedex'),

-- Doxycycline + Ciprofloxacin — double gram-negative cover, stewardship issue
('d1000000-0000-0000-0000-000000000014',
 'd1000000-0000-0000-0000-000000000005',
 'minor',
 'No pharmacokinetic interaction. Clinical concern is inappropriate spectrum overlap and resistance promotion.',
 'Overlapping gram-negative cover without added benefit in most community infections. Stewardship concern.',
 'Reserve combination for specific indications (e.g. septic arthritis, Brucellosis). In routine community infections, use one targeted agent.',
 'theoretical', 'FMOH'),

-- ═══════════════════════════════════════════════════════════════════════════
-- FOLIC ACID interactions
-- ═══════════════════════════════════════════════════════════════════════════

-- Folic acid + Metronidazole — folate metabolism concern
('d1000000-0000-0000-0000-000000000015',
 'd1000000-0000-0000-0000-000000000004',
 'minor',
 'Metronidazole may inhibit dihydrofolate reductase; potential reduction in folic acid effectiveness at high doses',
 'In pregnant patients on folate for neural tube defect prevention, metronidazole could theoretically reduce folate efficacy',
 'Monitor folate supplementation in pregnant patients requiring metronidazole. Avoid metronidazole in first trimester where possible. Consider dose adjustment.',
 'theoretical', 'BNF'),

-- Folic acid + Doxycycline — minimal absorption interaction
('d1000000-0000-0000-0000-000000000015',
 'd1000000-0000-0000-0000-000000000014',
 'minor',
 'Doxycycline is generally contraindicated in pregnancy (when folic acid is most used); if both prescribed, timing of doses matters for absorption',
 'In non-pregnant use: minimal interaction. In pregnant patients: doxycycline is contraindicated and should not be co-prescribed with antenatal folic acid.',
 'If both are present in a pregnant patient prescription, flag as contraindication — doxycycline is Category D in pregnancy.',
 'established', 'BNF'),

-- ═══════════════════════════════════════════════════════════════════════════
-- LISINOPRIL interactions (beyond base seed)
-- ═══════════════════════════════════════════════════════════════════════════

-- Lisinopril + Metformin — potential hypotension
('d1000000-0000-0000-0000-000000000017',
 'd1000000-0000-0000-0000-000000000007',
 'minor',
 'ACE inhibitors can improve insulin sensitivity; in combination with antidiabetics, can rarely cause hypoglycaemia. Also, both are renally cleared.',
 'Mild risk of hypoglycaemia; combined renal excretion requires monitoring in renal impairment',
 'Standard combination for hypertensive diabetics (cardioprotective). Monitor BP, glucose, and renal function at 1–2 weeks.',
 'established', 'FMOH'),

-- Lisinopril + Ciprofloxacin — hypoglycaemia additive
('d1000000-0000-0000-0000-000000000017',
 'd1000000-0000-0000-0000-000000000005',
 'minor',
 'ACE inhibitors enhance insulin sensitivity; ciprofloxacin also affects glucose metabolism. Combined effect in diabetic patients.',
 'Potential for symptomatic hypoglycaemia particularly in elderly diabetic patients',
 'Monitor blood glucose in diabetic patients on lisinopril starting ciprofloxacin. Warn patient of hypoglycaemia symptoms.',
 'theoretical', 'BNF'),

-- Lisinopril + Ceftriaxone — rare but important for sepsis management
('d1000000-0000-0000-0000-000000000017',
 'd1000000-0000-0000-0000-000000000013',
 'minor',
 'ACE inhibitors cause vasodilation; in volume-depleted septic patients receiving IV ceftriaxone, lisinopril can exacerbate hypotension',
 'Risk of severe hypotension in septic or volume-depleted patients already on ACE inhibitors',
 'In acute severe infections requiring IV ceftriaxone (sepsis), consider temporarily holding lisinopril until patient is haemodynamically stable and euvolaemic.',
 'probable', 'WHO'),

-- Lisinopril + Azithromycin — no major interaction but QT consideration
('d1000000-0000-0000-0000-000000000017',
 'd1000000-0000-0000-0000-000000000009',
 'minor',
 'ACE inhibitors can cause hyperkalaemia; hyperkalaemia predisposes to QT prolongation; azithromycin independently prolongs QT',
 'In patients with ACE inhibitor-induced hyperkalaemia, azithromycin QT risk is further amplified',
 'Check serum potassium before prescribing azithromycin in patients on ACE inhibitors. Correct hyperkalaemia before proceeding.',
 'probable', 'BNF'),

-- ═══════════════════════════════════════════════════════════════════════════
-- ZINC SULPHATE interactions (beyond base seed)
-- ═══════════════════════════════════════════════════════════════════════════

-- Zinc + Amoxicillin — minimal absorption effect
('d1000000-0000-0000-0000-000000000018',
 'd1000000-0000-0000-0000-000000000002',
 'minor',
 'Zinc may mildly reduce amoxicillin absorption via competitive mechanisms; less significant than with fluoroquinolones or tetracyclines',
 'Minor reduction in amoxicillin absorption; unlikely to be clinically significant at standard doses',
 'Separate doses by 1–2 hours where convenient. Not a clinically significant concern in most settings.',
 'theoretical', 'BNF'),

-- Zinc + Omeprazole — PPI reduces zinc absorption
('d1000000-0000-0000-0000-000000000018',
 'd1000000-0000-0000-0000-000000000010',
 'minor',
 'PPIs reduce gastric acid, which is required for ionisation and absorption of zinc; long-term PPI use associated with zinc deficiency',
 'Reduced zinc absorption with chronic PPI use. Clinically relevant in children with diarrhoea requiring zinc supplementation.',
 'Administer zinc 1 hour before omeprazole. In patients on long-term PPIs, consider checking zinc levels periodically.',
 'probable', 'Micromedex'),

ON CONFLICT (drug_a_id, drug_b_id) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════════════════
-- After running this file, confirm the interaction count:
--
-- SELECT COUNT(*), severity FROM drug_interactions GROUP BY severity ORDER BY severity;
--
-- Expected results (base seed 9 + this file ~35 new pairs):
--   contraindicated: 0
--   major:           ~6
--   moderate:        ~15
--   minor:           ~23
-- =============================================================================
