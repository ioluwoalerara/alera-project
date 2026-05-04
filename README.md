# Alera EMR

Nigeria's fastest clinic platform — voice-native, AI-powered, offline-capable.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start dev server (opens at http://localhost:5173)
npm run dev
```

That's it. The app opens automatically in your browser.

---

## Project Structure

```
alera-project/
├── index.html          ← Vite HTML entry point
├── vite.config.js      ← Vite config (React plugin, port 5173)
├── package.json        ← Dependencies
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx                    ← React root mount
    ├── AleraApp.jsx                ← Root component, routes screens, holds patient state
    ├── AleraShell.jsx              ← Nav chrome, AI Guide panel, RoleContext
    ├── AleraLogin.jsx              ← Role picker screen
    ├── AleraRoles.js               ← Role definitions, permissions, screen access
    ├── AleraPatientRegistration.jsx
    ├── AleraEncounter.jsx
    ├── AleraClinicalNoteEditor.jsx ← SOAP notes with real Web Speech API voice
    ├── AleraPrescriptionScreen.jsx
    ├── AleraBillingDashboard.jsx
    ├── AleraVisitExit.jsx
    ├── AleraDrugSchema.js          ← Drug database, interactions
    ├── AleraSafetyEngine.js        ← Drug safety checks (not yet wired to screen)
    └── AleraParser.js              ← Natural language Rx parser ("amox 500 tds 5d")
```

## Patient Data Flow

```
Login (role) 
  → Registration   onComplete(form)           → patient.name, phone, etc.
  → Encounter      onComplete({vitals, …})    → patient.vitals, assignedDoctor
  → Notes          onComplete({soap, …})      → patient.soap, diagnosis
  → Prescription   onComplete({rxList})       → patient.rxList
  → Billing        onComplete()
  → Exit
```

Each role only sees the screens they're allowed to access.

## Voice

- **Per-field dictation** — tap 🎙 on any SOAP field, speak, tap again to stop
- **Full note by voice** — dictate freely, Claude parses into all 4 SOAP fields
- Uses **Web Speech API** (`lang: en-NG`) — works in Chrome and Edge
- Falls back gracefully with an error message in unsupported browsers

## AI Features

- **AI Guide** — context-aware assistant in the right panel (powered by Claude API)
- **Clinical suggestions** — diagnosis hints, ICD-10 codes, risk flags from subjective text
- **Rx parser** — type `amox 500 tds 5d` and get a full structured prescription

## Environment

The Anthropic API key must be available at build time or injected by your server.  
The AI Guide and full-note-by-voice features call `https://api.anthropic.com/v1/messages` directly from the browser — for production, proxy this through your backend.

## Build for Production

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build locally
```

## What's Not Done Yet

- [ ] `AleraVisitExit` — expects nested `encounter.patient` shape; currently receives flat patient object
- [ ] `AleraSafetyEngine` — drug interaction/allergy checks exist but aren't wired to `AleraPrescriptionScreen`
- [ ] `AleraPrescriptionEngine` — standalone component, overlaps with `AleraPrescriptionScreen`; needs merge decision
- [ ] Offline support — PWA manifest + service worker not yet added
- [ ] Real auth — login is role-picker only, no passwords or JWT
