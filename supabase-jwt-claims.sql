-- =============================================================================
-- ALERA — SUPABASE JWT CUSTOM CLAIMS
-- =============================================================================
-- Run this in Supabase SQL Editor AFTER the main alera-schema.sql
--
-- This hooks into Supabase Auth to inject Alera-specific claims into
-- every JWT token. These claims are read by:
--   - Row-Level Security policies (auth_org_id(), auth_staff_id(), auth_alera_role())
--   - The React app (AleraAuth.jsx getAleraClaims())
--
-- Claims injected:
--   org_id      → UUID of the user's organisation
--   staff_id    → UUID of the staff record
--   alera_role  → staff role string (doctor, nurse, pharmacist, etc.)
--   org_name    → organisation display name
-- =============================================================================

-- ── 1. Function: look up claims for a given auth.users.id ────────────────────

CREATE OR REPLACE FUNCTION get_alera_claims(user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff  staff%ROWTYPE;
  v_org    organisations%ROWTYPE;
BEGIN
  -- Find staff record linked to this auth user
  SELECT * INTO v_staff
  FROM staff
  WHERE auth_user_id = user_id
    AND is_active = TRUE
  LIMIT 1;

  IF v_staff.id IS NULL THEN
    -- No staff record found — return empty claims
    -- This covers the edge case of a new user who hasn't been set up yet
    RETURN jsonb_build_object(
      'org_id',     NULL,
      'staff_id',   NULL,
      'alera_role', NULL,
      'org_name',   NULL
    );
  END IF;

  -- Fetch the org name
  SELECT * INTO v_org
  FROM organisations
  WHERE id = v_staff.org_id
    AND is_active = TRUE;

  RETURN jsonb_build_object(
    'org_id',     v_staff.org_id,
    'staff_id',   v_staff.id,
    'alera_role', v_staff.role::TEXT,
    'org_name',   COALESCE(v_org.name, 'Unknown Organisation')
  );
END;
$$;


-- ── 2. Hook: called by Supabase Auth on every token mint/refresh ─────────────
-- This is the Supabase Auth Hook (JWT Claims Customisation).
-- Set this up in: Supabase Dashboard → Authentication → Hooks → Custom Claims
-- Hook type: "Customize Access Token (JWT Claims)"
-- Function: auth.custom_access_token_hook

CREATE OR REPLACE FUNCTION auth.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_user_id  UUID;
  v_claims   JSONB;
  v_metadata JSONB;
BEGIN
  v_user_id := (event ->> 'user_id')::UUID;
  v_claims   := get_alera_claims(v_user_id);

  -- Merge Alera claims into the existing claims object
  v_metadata := COALESCE(event -> 'claims', '{}'::JSONB) || v_claims;

  RETURN jsonb_set(event, '{claims}', v_metadata);
END;
$$;

-- Grant the hook function permission to read staff + organisations
GRANT EXECUTE ON FUNCTION auth.custom_access_token_hook TO supabase_auth_admin;
GRANT SELECT ON TABLE public.staff TO supabase_auth_admin;
GRANT SELECT ON TABLE public.organisations TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION get_alera_claims TO supabase_auth_admin;


-- ── 3. Admin helper: create a staff account ───────────────────────────────────
-- Use this when onboarding a new clinic staff member.
-- Run in Supabase SQL Editor or from a server-side admin script.
-- Never expose this to the frontend.
--
-- Usage example:
--   SELECT create_staff_account(
--     'doctor.chidi@lagosclinic.ng',
--     'SecureP@ssw0rd',
--     'Chidi',
--     'Okonkwo',
--     'doctor',
--     '00000000-0000-0000-0000-000000000001'  -- org_id of Alera Demo Clinic
--   );

CREATE OR REPLACE FUNCTION create_staff_account(
  p_email       TEXT,
  p_password    TEXT,
  p_first_name  TEXT,
  p_last_name   TEXT,
  p_role        staff_role,
  p_org_id      UUID,
  p_mdcn        TEXT DEFAULT NULL,
  p_speciality  TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Create Supabase auth user
  -- Note: in production, use Supabase Admin API (supabase.auth.admin.createUser)
  -- from a server-side script rather than this SQL function.
  -- This is provided as a reference pattern only.

  -- Insert staff record (auth_user_id linked after user creation)
  INSERT INTO staff (
    org_id, first_name, last_name, email, role,
    mdcn_number, speciality, is_active
  ) VALUES (
    p_org_id, p_first_name, p_last_name, p_email, p_role,
    p_mdcn, p_speciality, TRUE
  );

  RETURN json_build_object(
    'success', true,
    'message', format('Staff record created for %s %s (%s). Link auth_user_id after creating Supabase auth user.', p_first_name, p_last_name, p_role)
  );
END;
$$;


-- ── 4. Verify setup ──────────────────────────────────────────────────────────
-- Run this to confirm the claims function works for a given email:
--
-- SELECT get_alera_claims(
--   (SELECT id FROM auth.users WHERE email = 'doctor@yourclinic.ng')
-- );
--
-- Expected output:
-- { "org_id": "...", "staff_id": "...", "alera_role": "doctor", "org_name": "..." }


-- =============================================================================
-- SETUP CHECKLIST
-- =============================================================================
-- After running this file in Supabase SQL Editor:
--
-- 1. Supabase Dashboard → Authentication → Hooks
--    → Add hook: "Customize Access Token (JWT Claims)"
--    → Schema: auth
--    → Function: custom_access_token_hook
--
-- 2. For each staff member:
--    a. Create auth user: Dashboard → Authentication → Users → Add User
--       (or use Supabase Admin API from server)
--    b. Update staff record: UPDATE staff SET auth_user_id = '<uuid>' WHERE email = '...'
--
-- 3. Test by signing in via the Alera app and checking the JWT at jwt.io
--    The payload should contain org_id, staff_id, alera_role, org_name
-- =============================================================================
