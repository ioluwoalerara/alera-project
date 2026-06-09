// ─── Alera Role & Permissions System ─────────────────────────────────────────
// Single source of truth for all role-based access control across the app.

export const ROLES = {
  DOCTOR:        "doctor",
  NURSE:         "nurse",
  RECEPTIONIST:  "receptionist",
  CASHIER:       "cashier",
  PHARMACIST:    "pharmacist",
  ADMIN:         "admin",
};

export const ROLE_META = {
  doctor: {
    label:      "Doctor",
    icon:       "🩺",
    color:      "#1854A8",
    bg:         "#E8F0FB",
    staffName:  "Dr. Chidi Okonkwo",
    desc:       "Full clinical access — consult, diagnose, prescribe",
  },
  nurse: {
    label:      "Nurse",
    icon:       "💉",
    color:      "#1A6650",
    bg:         "#E6F3EE",
    staffName:  "Nurse Amaka Eze",
    desc:       "Vitals, triage, encounter support — no prescribing",
  },
  receptionist: {
    label:      "Receptionist",
    icon:       "🗂",
    color:      "#5E3FAE",
    bg:         "#F0EBFF",
    staffName:  "Temi Adeyemi",
    desc:       "Patient registration, queue management, scheduling",
  },
  cashier: {
    label:      "Cashier",
    icon:       "💰",
    color:      "#C97A10",
    bg:         "#FEF5E7",
    staffName:  "Tunde Adeleke",
    desc:       "Billing, payments, cash drawer reconciliation",
  },
  pharmacist: {
    label:      "Pharmacist",
    icon:       "💊",
    color:      "#1A6650",
    bg:         "#E6F3EE",
    staffName:  "Pharm. Sola Bello",
    desc:       "View & dispense prescriptions only",
  },
  admin: {
    label:      "Admin",
    icon:       "⚙️",
    color:      "#0D1117",
    bg:         "#F7F5F1",
    staffName:  "Dr. Ngozi Obi (Owner)",
    desc:       "Full system access — staff, reports, all screens",
  },
};

// ─── Permissions Matrix ───────────────────────────────────────────────────────
// Each key is a capability. true = allowed, false = blocked, "read" = view only.

export const PERMISSIONS = {
  doctor: {
    // Registration
    canRegisterPatient:       false,
    canEditPatientDetails:    false,
    // Encounter
    canStartEncounter:        true,
    canTakeVitals:            true,
    // Clinical notes
    canWriteNotes:            true,
    canSignOffNote:           true,
    canViewNotes:             true,
    // Prescriptions
    canPrescribe:             true,
    canViewPrescriptions:     true,
    canDispense:              false,
    // Billing
    canViewBilling:           "read",
    canEditBilling:           false,
    canProcessPayment:        false,
    canAccessDrawer:          false,
    canReopenDrawer:          false,
    // Admin
    canManageStaff:           false,
    canViewReports:           "read",
    canAccessSettings:        false,
  },
  nurse: {
    canRegisterPatient:       false,
    canEditPatientDetails:    false,
    canStartEncounter:        true,
    canTakeVitals:            true,
    canWriteNotes:            true,
    canSignOffNote:           false,
    canViewNotes:             true,
    canPrescribe:             false,
    canViewPrescriptions:     true,
    canDispense:              false,
    canViewBilling:           false,
    canEditBilling:           false,
    canProcessPayment:        false,
    canAccessDrawer:          false,
    canReopenDrawer:          false,
    canManageStaff:           false,
    canViewReports:           false,
    canAccessSettings:        false,
  },
  receptionist: {
    canRegisterPatient:       true,
    canEditPatientDetails:    true,
    canStartEncounter:        true,
    canTakeVitals:            false,
    canWriteNotes:            false,
    canSignOffNote:           false,
    canViewNotes:             false,
    canPrescribe:             false,
    canViewPrescriptions:     false,
    canDispense:              false,
    canViewBilling:           "read",
    canEditBilling:           false,
    canProcessPayment:        false,
    canAccessDrawer:          false,
    canReopenDrawer:          false,
    canManageStaff:           false,
    canViewReports:           false,
    canAccessSettings:        false,
  },
  cashier: {
    canRegisterPatient:       false,
    canEditPatientDetails:    false,
    canStartEncounter:        false,
    canTakeVitals:            false,
    canWriteNotes:            false,
    canSignOffNote:           false,
    canViewNotes:             false,
    canPrescribe:             false,
    canViewPrescriptions:     false,
    canDispense:              false,
    canViewBilling:           true,
    canEditBilling:           true,
    canProcessPayment:        true,
    canAccessDrawer:          true,
    canReopenDrawer:          false,
    canManageStaff:           false,
    canViewReports:           "read",
    canAccessSettings:        false,
  },
  pharmacist: {
    canRegisterPatient:       false,
    canEditPatientDetails:    false,
    canStartEncounter:        false,
    canTakeVitals:            false,
    canWriteNotes:            false,
    canSignOffNote:           false,
    canViewNotes:             false,
    canPrescribe:             false,
    canViewPrescriptions:     true,
    canDispense:              true,
    canViewBilling:           false,
    canEditBilling:           false,
    canProcessPayment:        false,
    canAccessDrawer:          false,
    canReopenDrawer:          false,
    canManageStaff:           false,
    canViewReports:           false,
    canAccessSettings:        false,
  },
  admin: {
    canRegisterPatient:       true,
    canEditPatientDetails:    true,
    canStartEncounter:        true,
    canTakeVitals:            true,
    canWriteNotes:            true,
    canSignOffNote:           true,
    canViewNotes:             true,
    canPrescribe:             true,
    canViewPrescriptions:     true,
    canDispense:              true,
    canViewBilling:           true,
    canEditBilling:           true,
    canProcessPayment:        true,
    canAccessDrawer:          true,
    canReopenDrawer:          true,
    canManageStaff:           true,
    canViewReports:           true,
    canAccessSettings:        true,
  },
};

// ─── Screen Access Map ────────────────────────────────────────────────────────
// Which screens each role can access. Used by AleraShell to build the nav.

export const SCREEN_ACCESS = {
  doctor:       ["home", "chart", "appointments", "revenue", "consent", "queue", "encounter", "notes", "prescription", "billing", "analytics"],
  nurse:        ["home", "chart", "appointments", "consent", "queue", "encounter", "notes", "analytics"],
  receptionist: ["home", "chart", "appointments", "consent", "registration", "queue", "encounter", "analytics"],
  cashier:      ["home", "chart", "appointments", "queue", "billing", "nhis", "analytics"],
  pharmacist:   ["home", "chart", "appointments", "queue", "prescription", "dispensing", "analytics"],
  admin:        ["home", "chart", "appointments", "revenue", "consent", "registration", "queue", "encounter", "notes", "prescription", "billing", "nhis", "dispensing", "admin", "analytics"],
};

export const SCREEN_META = {
  registration:  { label: "Registration",  icon: "🗂",  shortLabel: "Register"   },
  queue:         { label: "Queue",          icon: "🕐",  shortLabel: "Queue"      },
  encounter:     { label: "Encounter",      icon: "🩺",  shortLabel: "Encounter"  },
  notes:         { label: "Clinical Notes", icon: "📋",  shortLabel: "Notes"      },
  prescription:  { label: "Prescription",   icon: "💊",  shortLabel: "Rx"         },
  billing:       { label: "Billing",        icon: "💰",  shortLabel: "Billing"    },
  admin:         { label: "Admin",          icon: "⚙️",  shortLabel: "Admin"      },
  nhis:          { label: "NHIS Claims",    icon: "🏥",  shortLabel: "NHIS"       },
  dispensing:    { label: "Dispensing",     icon: "💊",  shortLabel: "Dispense"   },
  chart:         { label: "Patient Chart",  icon: "📋",  shortLabel: "Chart"       },
  home:          { label: "Home",             icon: "🏠",  shortLabel: "Home"       },
  appointments:  { label: "Appointments",    icon: "📅",  shortLabel: "Appts"      },
  analytics:     { label: "Analytics",       icon: "📊",  shortLabel: "Analytics"  },
  revenue:       { label: "Revenue Intel",   icon: "📈",  shortLabel: "Revenue"    },
  consent:       { label: "Patient Network",  icon: "🌐",  shortLabel: "Network"    },
};

// ─── Helper ───────────────────────────────────────────────────────────────────
export function can(role, permission) {
  return PERMISSIONS[role]?.[permission] ?? false;
}

export function canRead(role, permission) {
  const val = PERMISSIONS[role]?.[permission];
  return val === true || val === "read";
}
