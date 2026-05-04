-- =============================================================================
-- ALERA HEALTH — DISPENSING & INVENTORY SUPPLEMENT
-- =============================================================================
-- Adds dispensing_records table, drug_inventory table, and the
-- decrement_drug_stock RPC needed by AleraDispensing.jsx.
--
-- Run AFTER alera-schema.sql in Supabase SQL Editor.
-- Safe to run multiple times — uses CREATE TABLE IF NOT EXISTS.
-- =============================================================================

-- ─── dispensing_records ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispensing_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  prescription_item_id  UUID REFERENCES prescription_items(id),
  encounter_id          UUID REFERENCES encounters(id),
  patient_id            UUID REFERENCES patients(id),
  dispensed_by          UUID REFERENCES staff(id),
  drug_id               UUID REFERENCES drugs(id),
  brand_dispensed       TEXT,
  quantity_dispensed    NUMERIC NOT NULL DEFAULT 1,
  batch_number          TEXT,
  expiry_date           DATE,
  dispensed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  instructions_given    TEXT,
  sync_status           TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced','pending','conflict','failed')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dispensing_records_org_idx        ON dispensing_records(org_id);
CREATE INDEX IF NOT EXISTS dispensing_records_patient_idx    ON dispensing_records(patient_id);
CREATE INDEX IF NOT EXISTS dispensing_records_encounter_idx  ON dispensing_records(encounter_id);
CREATE INDEX IF NOT EXISTS dispensing_records_date_idx       ON dispensing_records(dispensed_at DESC);

-- RLS
ALTER TABLE dispensing_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dispensing_org_isolation" ON dispensing_records;
CREATE POLICY "dispensing_org_isolation" ON dispensing_records
  USING (org_id = (
    SELECT org_id FROM staff WHERE auth_user_id = auth.uid() LIMIT 1
  ));

-- ─── drug_inventory ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drug_inventory (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  drug_id           UUID NOT NULL REFERENCES drugs(id),
  batch_number      TEXT,
  expiry_date       DATE,
  quantity_on_hand  NUMERIC NOT NULL DEFAULT 0,
  reorder_level     NUMERIC NOT NULL DEFAULT 10,
  unit_cost_ngn     NUMERIC,
  supplier          TEXT,
  received_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, drug_id, batch_number)
);

CREATE INDEX IF NOT EXISTS drug_inventory_org_idx    ON drug_inventory(org_id);
CREATE INDEX IF NOT EXISTS drug_inventory_drug_idx   ON drug_inventory(drug_id);
CREATE INDEX IF NOT EXISTS drug_inventory_expiry_idx ON drug_inventory(expiry_date);

ALTER TABLE drug_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_org_isolation" ON drug_inventory;
CREATE POLICY "inventory_org_isolation" ON drug_inventory
  USING (org_id = (
    SELECT org_id FROM staff WHERE auth_user_id = auth.uid() LIMIT 1
  ));

-- ─── Add dispense_status to prescription_items ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prescription_items' AND column_name = 'dispense_status'
  ) THEN
    ALTER TABLE prescription_items
      ADD COLUMN dispense_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (dispense_status IN ('pending', 'dispensed', 'cancelled', 'partially_dispensed')),
      ADD COLUMN brand_dispensed TEXT,
      ADD COLUMN batch_number    TEXT,
      ADD COLUMN dispensed_at    TIMESTAMPTZ;
  END IF;
END $$;

-- ─── Add dispensed fields to prescriptions ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prescriptions' AND column_name = 'dispensed_at'
  ) THEN
    ALTER TABLE prescriptions
      ADD COLUMN dispensed_at   TIMESTAMPTZ,
      ADD COLUMN dispensed_by   UUID REFERENCES staff(id);
  END IF;
END $$;

-- ─── decrement_drug_stock RPC ─────────────────────────────────────────────────
-- Called by AleraDispensing.jsx after each successful dispense.
-- Decrements the most recently received (non-expired) batch first (FEFO).

CREATE OR REPLACE FUNCTION decrement_drug_stock(
  p_org_id  UUID,
  p_drug_id UUID,
  p_qty     NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining NUMERIC := p_qty;
  v_row       drug_inventory%ROWTYPE;
BEGIN
  -- FEFO: First Expiry, First Out — consume soonest-expiring stock first
  FOR v_row IN
    SELECT * FROM drug_inventory
    WHERE org_id = p_org_id
      AND drug_id = p_drug_id
      AND quantity_on_hand > 0
      AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
    ORDER BY COALESCE(expiry_date, '9999-12-31') ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    IF v_row.quantity_on_hand >= v_remaining THEN
      UPDATE drug_inventory
        SET quantity_on_hand = quantity_on_hand - v_remaining,
            updated_at = NOW()
        WHERE id = v_row.id;
      v_remaining := 0;
    ELSE
      v_remaining := v_remaining - v_row.quantity_on_hand;
      UPDATE drug_inventory
        SET quantity_on_hand = 0,
            updated_at = NOW()
        WHERE id = v_row.id;
    END IF;
  END LOOP;

  -- If v_remaining > 0, stock went negative — log but don't raise (clinic may
  -- continue operating and reconcile later during stock-take)
  IF v_remaining > 0 THEN
    RAISE WARNING '[AleraDispensing] Stock shortfall: drug % org % — dispensed % more than available',
      p_drug_id, p_org_id, v_remaining;
  END IF;
END;
$$;

-- ─── View: dispensing_queue ───────────────────────────────────────────────────
-- Flattens prescriptions + items + patient info for the dispensing screen.
-- Replaces the complex nested select in AleraDispensing.jsx.

CREATE OR REPLACE VIEW dispensing_queue AS
SELECT
  p.id                          AS prescription_id,
  p.encounter_id,
  p.org_id,
  p.status                      AS prescription_status,
  p.created_at                  AS prescribed_at,
  p.dispensed_at,
  e.visit_number,
  e.urgency,
  e.status                      AS encounter_status,
  pat.id                        AS patient_id,
  pat.first_name,
  pat.last_name,
  pat.patient_number,
  pi.id                         AS item_id,
  pi.drug_id,
  d.name                        AS drug_name,
  pi.dosage_amount,
  pi.dosage_unit,
  pi.frequency,
  pi.duration_days,
  pi.quantity,
  pi.instructions,
  pi.dispense_status,
  COALESCE(inv.quantity_on_hand, 0) AS stock_on_hand,
  CASE WHEN COALESCE(inv.quantity_on_hand, 0) <= COALESCE(inv.reorder_level, 10) THEN true ELSE false END AS is_low_stock
FROM prescriptions p
JOIN encounters    e   ON e.id   = p.encounter_id
JOIN patients      pat ON pat.id = e.patient_id
JOIN prescription_items pi ON pi.prescription_id = p.id
JOIN drugs         d   ON d.id   = pi.drug_id
LEFT JOIN drug_inventory inv ON inv.drug_id = pi.drug_id AND inv.org_id = p.org_id
WHERE p.status IN ('active', 'dispensed');

-- ─── Seed: sample inventory for the 18 base drugs ────────────────────────────
-- Inserts placeholder stock for each drug in the org.
-- Uses a DO block so it's safe to run when org seed exists.
-- Replace 'YOUR_ORG_ID' with your actual org UUID before running.
--
-- DO $$
-- DECLARE
--   v_org_id UUID := 'YOUR_ORG_ID';
-- BEGIN
--   INSERT INTO drug_inventory (org_id, drug_id, quantity_on_hand, reorder_level, batch_number)
--   SELECT v_org_id, id, 100, 20, 'SEED-BATCH-001'
--   FROM drugs
--   ON CONFLICT (org_id, drug_id, batch_number) DO NOTHING;
-- END $$;

-- =============================================================================
-- After running this file:
--   1. Enable the dispensing view in your Supabase API (it's auto-exposed)
--   2. Seed drug_inventory with your actual stock levels
--   3. The decrement_drug_stock function needs SECURITY DEFINER to bypass RLS
--      — verify it was created successfully:
--      SELECT proname FROM pg_proc WHERE proname = 'decrement_drug_stock';
-- =============================================================================
