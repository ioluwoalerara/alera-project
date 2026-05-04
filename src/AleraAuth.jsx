// =============================================================================
// AleraAuth.jsx — Authentication context + provider
// =============================================================================
// Wraps the entire app. Every component can call useAuth() to get:
//   { session, user, claims, loading, signIn, signOut, error }
//
// claims shape (from JWT):
//   { org_id, staff_id, alera_role, org_name }
//
// The Supabase JWT hook (set up in Supabase dashboard) must inject these claims.
// See: supabase/functions/custom-claims/index.ts in the backend repo.
// =============================================================================

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  supabase,
  signIn  as sbSignIn,
  signOut as sbSignOut,
  getAleraClaims,
  getAleraClaimsFromDB,
  onAuthChange,
} from "./supabase.js";

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AleraAuthProvider>");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AleraAuthProvider({ children }) {
  const [session,  setSession]  = useState(null);
  const [claims,   setClaims]   = useState(null);
  const [loading,  setLoading]  = useState(true);   // true while checking existing session
  const [error,    setError]    = useState(null);

  // On mount: check for existing session (page refresh / returning user)
  useEffect(() => {
    // Clear any stale locks that cause deadlocks with Supabase auth
    if (typeof indexedDB !== "undefined") {
      try { indexedDB.deleteDatabase("supabase-"); } catch {}
    }
    supabase.auth.getSession().then(async ({ data }) => {
      const s = data?.session ?? null;
      setSession(s);
      let c = getAleraClaims(s);
      if (s && (!c || !c.alera_role)) c = await getAleraClaimsFromDB(s);
      setClaims(c);
      setLoading(false);
    }).catch(() => setLoading(false));

    // Subscribe to auth state changes (sign in, sign out, token refresh)
    const unsub = onAuthChange((event, s) => {
      setSession(s);
      setError(null);
      if (event === "SIGNED_OUT") {
        setSession(null);
        setClaims(null);
      } else {
        const c = getAleraClaims(s);
        if (c && c.alera_role) setClaims(c);
        // DB lookup happens in handleSignIn, not here
      }
    });

    return unsub;
  }, []);

  const handleSignIn = useCallback(async (email, password) => {
    setError(null);
    setLoading(true);
    const { user, session: s, error: err } = await sbSignIn(email, password);
    if (err) {
      setError(formatAuthError(err));
      setLoading(false);
      return { error: err };
    }
    setSession(s);
    // Try JWT claims first, then DB lookup with its own loading state
    let c = getAleraClaims(s);
    setLoading(false);
    if (!c || !c.alera_role) {
      getAleraClaimsFromDB(s).then(dbClaims => {
        if (dbClaims) setClaims(dbClaims);
      });
    } else {
      setClaims(c);
    }
    return { user, session: s };
  }, []);

  const handleSignOut = useCallback(async () => {
    await sbSignOut();
    setSession(null);
    setClaims(null);
  }, []);

  const value = {
    session,
    user:     session?.user ?? null,
    claims,
    loading,
    error,
    signIn:   handleSignIn,
    signOut:  handleSignOut,
    // Convenience getters
    isAuthenticated: !!session,
    orgId:      claims?.org_id     ?? null,
    staffId:    claims?.staff_id   ?? null,
    role:       claims?.alera_role ?? null,
    orgName:    claims?.org_name   ?? null,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAuthError(error) {
  const msg = error?.message ?? "";
  if (msg.includes("Invalid login credentials"))
    return "Incorrect email or password. Please try again.";
  if (msg.includes("Email not confirmed"))
    return "Please check your email and click the confirmation link before logging in.";
  if (msg.includes("Too many requests"))
    return "Too many login attempts. Please wait a moment and try again.";
  if (msg.includes("User not found"))
    return "No account found with that email address.";
  return msg || "Login failed. Please try again.";
}
