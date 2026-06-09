import { useState, useRef, useEffect, createContext, useContext } from "react";
import { ROLES, ROLE_META, PERMISSIONS, SCREEN_ACCESS, SCREEN_META, can, canRead } from "./AleraRoles.js";
import { useSyncStatus, retryFailed, clearFailedItems } from "./AleraSync.js";

// ─── Voice Engine ─────────────────────────────────────────────────────────────
const SPEECH_SUPPORTED =
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

/**
 * useVoiceInput(onResult)
 * Returns { listening, toggle, error, clearError }
 * Calls onResult(transcript) when speech ends.
 */
function useVoiceInput(onResult) {
  const [listening,  setListening]  = useState(false);
  const [error,      setError]      = useState(null);
  const stopRef = useRef(null);

  function toggle() {
    if (listening) {
      stopRef.current?.();
      stopRef.current = null;
      setListening(false);
      return;
    }
    if (!SPEECH_SUPPORTED) {
      setError("Voice not supported — try Chrome or Edge.");
      return;
    }
    setError(null);
    setListening(true);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r  = new SR();
    r.lang           = "en-NG";
    r.continuous     = false;
    r.interimResults = false;
    r.onresult = e => {
      const t = Array.from(e.results).map(res => res[0].transcript).join(" ").trim();
      if (t) onResult(t);
    };
    r.onerror = () => { setError("Couldn't hear anything. Try again."); };
    r.onend   = () => { setListening(false); stopRef.current = null; };
    r.start();
    stopRef.current = () => { try { r.stop(); } catch (_) {} };
  }

  useEffect(() => () => stopRef.current?.(), []);
  return { listening, toggle, error, clearError: () => setError(null) };
}

/**
 * MicBtn — microphone button that pulses red while listening.
 * Props: onResult(transcript), style (optional extra wrapper style)
 */
function MicBtn({ onResult, style }) {
  const { listening, toggle, error, clearError } = useVoiceInput(onResult);

  return (
    <div style={{ position: "relative", flexShrink: 0, ...style }}>
      <button
        type="button"
        onClick={toggle}
        title={listening ? "Stop recording" : "Dictate"}
        style={{
          width: 34, height: 34, borderRadius: "50%",
          border: `1.5px solid ${listening ? "#C0392B" : T.border}`,
          background: listening ? "#FDECEA" : "transparent",
          color: listening ? "#C0392B" : T.inkSub,
          cursor: "pointer", fontSize: 15,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.18s",
          animation: listening ? "micPulse 1s ease-in-out infinite" : "none",
          flexShrink: 0,
        }}
        onMouseEnter={e => { if (!listening) { e.currentTarget.style.borderColor = T.sage; e.currentTarget.style.color = T.sage; } }}
        onMouseLeave={e => { if (!listening) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.inkSub; } }}
      >
        🎙
      </button>
      {error && (
        <div onClick={clearError} style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
          transform: "translateX(-50%)",
          background: "#1A0A0A", color: "#F0A0A0",
          fontSize: 11, padding: "5px 10px", borderRadius: 7,
          whiteSpace: "nowrap", cursor: "pointer",
          border: "1px solid rgba(192,57,43,0.3)",
          fontFamily: "'DM Sans',sans-serif",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          zIndex: 999,
        }}>
          {error} ✕
        </div>
      )}
    </div>
  );
}

// ─── Role Context ─────────────────────────────────────────────────────────────
export const RoleContext = createContext(null);
export function useRole() { return useContext(RoleContext); }

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  ink: "#0D1117", inkSub: "#6E7891", inkMid: "#3D4558",
  paper: "#F7F5F1", paperDim: "#EFECE7", white: "#FFFFFF",
  sage: "#1A6650", sageMid: "#237A5F", sageLight: "#E6F3EE", sageBorder: "rgba(26,102,80,0.2)",
  border: "#E8E4DE", borderMid: "#D4D0CA",
  shadow: "0 1px 3px rgba(13,17,23,0.06), 0 4px 16px rgba(13,17,23,0.04)",
  radius: 12, radiusSm: 8, radiusLg: 16,
};

// ─── AI Guide System Prompt Builder ──────────────────────────────────────────
function buildSystemPrompt(role, screen, encounterState) {
  const meta    = ROLE_META[role];
  const perms   = PERMISSIONS[role];
  const screens = SCREEN_ACCESS[role];

  return `You are the Alera AI Guide — a built-in assistant embedded inside Alera Health EMR, a Nigerian clinic management system.

Your ONLY job is to help the current user navigate their work inside Alera. You are NOT a general medical assistant. You guide people through the software.

CURRENT USER:
- Role: ${meta.label} (${meta.staffName})
- Current screen: ${screen}
- Screens they can access: ${screens.join(", ")}
- Key permissions: ${Object.entries(perms).filter(([,v]) => v === true).map(([k]) => k).join(", ")}

ENCOUNTER STATE:
${JSON.stringify(encounterState, null, 2)}

INSTRUCTIONS:
- Be extremely concise. Max 3-4 sentences per response unless giving a step-by-step plan.
- Always respond in the context of what the user can actually do given their role.
- If they ask to do something their role doesn't allow, tell them who to ask instead.
- When giving a workflow plan, use numbered steps. Keep each step to one short sentence.
- Use plain, simple English. This is for clinic staff in Nigeria — avoid jargon.
- If the screen context is relevant, reference it (e.g. "On the Billing screen, look for...").
- When a goal is given, map it to the exact screens and steps needed in Alera.
- Always end multi-step plans with: "I'll check off each step as you complete it."
- For clinical questions (dosing, diagnosis), you can give brief guidance but always say "confirm with the doctor."
- Be warm but efficient. These are busy healthcare workers.`;
}

// ─── Contextual Screen Hints ──────────────────────────────────────────────────
const SCREEN_HINTS = {
  registration: {
    doctor:       "Patients are usually registered by the receptionist. You can view details here.",
    nurse:        "Patient details are here. Check allergies and update vitals when the patient arrives.",
    receptionist: "Start by searching the patient's phone number. If they're new, fill in their details.",
    cashier:      "You don't have access to registration. Head to Billing to process payments.",
    pharmacist:   "Registration isn't part of your workflow. Go to Prescriptions to view dispensing queue.",
    admin:        "You have full access. Register new patients or edit existing records here.",
  },
  encounter: {
    doctor:       "Start the encounter, confirm vitals, then move to Clinical Notes when ready.",
    nurse:        "Take and record the patient's vitals here. The doctor will review before proceeding.",
    receptionist: "Check the patient in and assign them to a doctor. You can't access clinical details.",
    cashier:      "Encounters aren't part of your workflow.",
    pharmacist:   "Encounters aren't part of your workflow.",
    admin:        "Full encounter access. You can start, edit, or close any encounter.",
  },
  notes: {
    doctor:       "Write your SOAP note here. Use the AI suggestions to speed up — you still sign off.",
    nurse:        "You can add observations but cannot sign off the final note. The doctor does that.",
    receptionist: "Clinical notes aren't accessible for your role.",
    cashier:      "Clinical notes aren't accessible for your role.",
    pharmacist:   "Clinical notes aren't accessible for your role.",
    admin:        "Full notes access. You can write, edit, and sign off clinical notes.",
  },
  prescription: {
    doctor:       "AI has pre-loaded a suggested regimen based on the diagnosis. Review and verify each drug.",
    nurse:        "You can view the prescription but cannot add or change medications.",
    receptionist: "Prescriptions aren't accessible for your role.",
    cashier:      "Prescriptions aren't accessible for your role.",
    pharmacist:   "Review the prescription queue here. Confirm each item before dispensing.",
    admin:        "Full prescription access. You can prescribe, edit, and dispense.",
  },
  billing: {
    doctor:       "You can view the bill but cannot edit or process payment — the cashier handles that.",
    nurse:        "Billing isn't part of your workflow.",
    receptionist: "You can view the bill summary but cannot process payment.",
    cashier:      "Process payment here. Choose the payment method and mark as paid when done. Use the Cash Drawer tab at end of day.",
    pharmacist:   "Billing isn't part of your workflow.",
    admin:        "Full billing access including cash drawer, NHIS claims, and payment history.",
  },
};

// ─── AI Guide Panel ────────────────────────────────────────────────────────────
function AiGuidePanel({ role, screen, encounterState, onClose, initialGoal }) {
  const [messages,   setMessages]   = useState([]);
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [plan,       setPlan]       = useState(null);   // [{step, done}]
  const bottomRef = useRef(null);
  const meta = ROLE_META[role];

  // On open — show contextual hint + initial goal if provided
  useEffect(() => {
    const hint = SCREEN_HINTS[screen]?.[role] || "How can I help you?";
    const welcome = {
      role: "assistant",
      content: `👋 Hi ${meta.staffName.split(" ")[0]}. You're on the **${SCREEN_META[screen]?.label || screen}** screen.\n\n${hint}`,
    };
    setMessages([welcome]);
    if (initialGoal) {
      setTimeout(() => sendMessage(initialGoal, [welcome]), 300);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text, existingMessages) {
    const userMsg = { role: "user", content: text };
    const history = [...(existingMessages || messages), userMsg];
    setMessages(history);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("https://zrstwfjnkpfobsboprzs.supabase.co/functions/v1/claude-proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpyc3R3Zmpua3Bmb2JzYm9wcnpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjAwNjgsImV4cCI6MjA4ODQzNjA2OH0.K7C2_ScRsysaemOsDyaF67Y--ONEJREAMJNFXtvBmVc",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: buildSystemPrompt(role, screen, encounterState),
          messages: history.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = data.content?.find(b => b.type === "text")?.text || "I couldn't process that. Please try again.";

      // Parse numbered plan if present
      const planMatch = reply.match(/(?:^|\n)(\d+\.\s.+)/gm);
      if (planMatch && planMatch.length >= 2) {
        setPlan(planMatch.map(s => ({ step: s.replace(/^\d+\.\s/, "").trim(), done: false })));
      }

      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection issue. Check your network and try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    if (!input.trim() || loading) return;
    sendMessage(input.trim());
  }

  function togglePlanStep(i) {
    setPlan(p => p.map((s, idx) => idx === i ? { ...s, done: !s.done } : s));
  }

  // Render message content with basic markdown (bold, newlines)
  function renderContent(text) {
    return text.split("\n").map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <div key={i} style={{ marginBottom: line === "" ? 6 : 2 }}>
          {parts.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p)}
        </div>
      );
    });
  }

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0,
      width: 360, background: T.white,
      borderLeft: `1px solid ${T.border}`,
      boxShadow: "-4px 0 24px rgba(13,17,23,0.1)",
      display: "flex", flexDirection: "column",
      zIndex: 200, animation: "slideLeft 0.25s ease",
      fontFamily: "'DM Sans',sans-serif",
    }}>
      <style>{`@keyframes slideLeft { from{transform:translateX(20px);opacity:0} to{transform:translateX(0);opacity:1} }`}</style>

      {/* Header */}
      <div style={{ padding: "16px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10, background: T.ink }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: `${meta.color}25`, border: `1px solid ${meta.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{meta.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13.5, color: "#fff" }}>Alera AI Guide</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{meta.label} · {SCREEN_META[screen]?.label || screen}</div>
        </div>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.14s" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}>✕</button>
      </div>

      {/* Plan tracker */}
      {plan && plan.length > 0 && (
        <div style={{ padding: "12px 16px", background: T.sageLight, borderBottom: `1px solid ${T.sageBorder}` }}>
          <div style={{ fontSize: 10, color: T.sage, fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, marginBottom: 8, letterSpacing: "0.5px" }}>
            YOUR PLAN · {plan.filter(s => s.done).length}/{plan.length} DONE
          </div>
          {plan.map((s, i) => (
            <div key={i} onClick={() => togglePlanStep(i)} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6, cursor: "pointer" }}>
              <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${s.done ? T.sage : T.sageBorder}`, background: s.done ? T.sage : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, transition: "all 0.14s" }}>
                {s.done && <span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: 12.5, color: s.done ? T.inkSub : T.ink, textDecoration: s.done ? "line-through" : "none", lineHeight: 1.45 }}>{s.step}</span>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 14, display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "85%", padding: "10px 13px", borderRadius: 11,
              background: m.role === "user" ? T.ink : T.paper,
              color: m.role === "user" ? "#fff" : T.ink,
              fontSize: 13, lineHeight: 1.6,
              borderBottomRightRadius: m.role === "user" ? 3 : 11,
              borderBottomLeftRadius: m.role === "assistant" ? 3 : 11,
            }}>
              {renderContent(m.content)}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 5, padding: "10px 13px", width: "fit-content" }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: T.inkSub, animation: `pulse 1s ease ${i * 0.15}s infinite` }} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      <div style={{ padding: "8px 14px", display: "flex", gap: 6, flexWrap: "wrap", borderTop: `1px solid ${T.border}` }}>
        {["What should I do next?", "Walk me through this screen", "I'm stuck"].map(q => (
          <button key={q} onClick={() => { setInput(q); }} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.paperDim, color: T.inkMid, fontSize: 11.5, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.12s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.sage; e.currentTarget.style.color = T.sage; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.inkMid; }}>{q}</button>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding: "12px 14px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Ask anything or describe your goal…"
          style={{ flex: 1, padding: "10px 12px", border: `1.5px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: T.ink, outline: "none", transition: "border-color 0.14s", background: T.white }}
          onFocus={e => { e.target.style.borderColor = T.sage; e.target.style.boxShadow = `0 0 0 3px ${T.sageLight}`; }}
          onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = "none"; }}
        />
        <MicBtn onResult={transcript => {
          setInput(transcript);
          // Small delay so input state updates before send
          setTimeout(() => sendMessage(transcript), 50);
        }} />
        <button onClick={handleSend} disabled={!input.trim() || loading} style={{ width: 38, height: 38, borderRadius: T.radiusSm, border: "none", background: input.trim() && !loading ? T.sage : T.paperDim, color: input.trim() && !loading ? "#fff" : T.inkSub, cursor: input.trim() && !loading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, transition: "all 0.14s", flexShrink: 0 }}>↑</button>
      </div>
    </div>
  );
}

// ─── Main Shell ───────────────────────────────────────────────────────────────
// ─── More Dropdown ───────────────────────────────────────────────────────────
function MoreDropdown({ screens, activeScreen, onScreenChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const hasActive = screens.includes(activeScreen);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: "6px 12px", borderRadius: T.radiusSm, border: "none",
          background: hasActive ? T.ink : "transparent",
          color: hasActive ? "#fff" : T.inkSub,
          fontSize: 12, fontWeight: 400, cursor: "pointer",
          fontFamily: "'DM Sans',sans-serif",
          display: "flex", alignItems: "center", gap: 4,
          transition: "all 0.14s",
        }}
        onMouseEnter={e => { if (!hasActive) { e.currentTarget.style.background = T.paperDim; e.currentTarget.style.color = T.inkMid; } }}
        onMouseLeave={e => { if (!hasActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.inkSub; } }}
      >
        More ▾
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0,
          background: T.white, border: `1px solid ${T.border}`,
          borderRadius: T.radius, boxShadow: "0 8px 24px rgba(13,17,23,0.12)",
          zIndex: 100, minWidth: 170, overflow: "hidden", padding: 4,
        }}>
          {screens.map(s => {
            const sm = SCREEN_META[s];
            const active = activeScreen === s;
            return (
              <button key={s} onClick={() => { onScreenChange(s); setOpen(false); }} style={{
                width: "100%", padding: "8px 14px", border: "none",
                background: active ? T.paperDim : "transparent",
                color: active ? T.ink : T.inkSub,
                fontSize: 13, fontWeight: active ? 600 : 400,
                cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                textAlign: "left", display: "flex", alignItems: "center", gap: 8,
                borderRadius: T.radiusSm,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = T.paperDim; e.currentTarget.style.color = T.ink; }}
                onMouseLeave={e => { e.currentTarget.style.background = active ? T.paperDim : "transparent"; e.currentTarget.style.color = active ? T.ink : T.inkSub; }}
              >
                <span>{sm.icon}</span>
                <span>{sm.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AleraShell({ role, onLogout, children, activeScreen, onScreenChange, encounterState: encounterStateProp, hasActivePatient }) {
  const [guideOpen,   setGuideOpen]   = useState(false);
  const [goalInput,   setGoalInput]   = useState("");
  const [initialGoal, setInitialGoal] = useState(null);
  const sync = useSyncStatus();
  const [showSyncPanel, setShowSyncPanel] = useState(false);

  // Use live encounter state from AleraApp if available, else blank defaults
  const encounterState = encounterStateProp ?? {
    patientRegistered: false,
    encounterStarted:  false,
    noteWritten:       false,
    prescriptionDone:  false,
    billPaid:          false,
  };

  const meta    = ROLE_META[role];
  const screens = SCREEN_ACCESS[role];

  function handleGoalSubmit(e) {
    e.preventDefault();
    if (!goalInput.trim()) return;
    setInitialGoal(goalInput.trim());
    setGoalInput("");
    setGuideOpen(true);
  }

  function openGuide() {
    setInitialGoal(null);
    setGuideOpen(true);
  }

  return (
    <RoleContext.Provider value={{ role, permissions: PERMISSIONS[role], can: (p) => can(role, p), canRead: (p) => canRead(role, p) }}>
      <div style={{ minHeight: "100vh", background: T.paper, fontFamily: "'DM Sans',sans-serif" }}>
        {/* Offline Banner */}
        {!sync.online && (
          <div style={{
            background: "#B83232", color: "#fff", padding: "8px 16px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
            position: "sticky", top: 0, zIndex: 200,
          }}>
            <span>⚠</span>
            <span>You're offline — changes are being saved locally and will sync when you reconnect</span>
          </div>
        )}

        {/* Sync Panel Modal */}
        {showSyncPanel && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(13,17,23,0.5)",
            zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
            padding: "70px 16px 0",
          }} onClick={() => setShowSyncPanel(false)}>
            <div onClick={e => e.stopPropagation()} style={{
              background: T.white, borderRadius: T.radiusLg, width: 360,
              boxShadow: "0 24px 64px rgba(13,17,23,0.2)", overflow: "hidden",
              fontFamily: "'DM Sans',sans-serif",
            }}>
              <div style={{ padding: "16px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 15, color: T.ink }}>
                  Sync Status
                </div>
                <button onClick={() => setShowSyncPanel(false)} style={{ background: "none", border: "none", cursor: "pointer", color: T.inkSub, fontSize: 18 }}>✕</button>
              </div>
              <div style={{ padding: "14px 18px" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  {[
                    { label: `${sync.pending} pending`, color: T.amber },
                    { label: `${sync.failed} failed`, color: T.rose },
                  ].map(({ label, color }) => (
                    <div key={label} style={{ flex: 1, padding: "8px 10px", background: T.paperDim, borderRadius: T.radiusSm, textAlign: "center" }}>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color }}>{label.split(" ")[0]}</div>
                      <div style={{ fontSize: 11, color: T.inkSub }}>{label.split(" ")[1]}</div>
                    </div>
                  ))}
                </div>
                {sync.failed > 0 && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button onClick={() => { retryFailed(); }} style={{
                      flex: 1, padding: "8px", background: T.sageLight, color: T.sage,
                      border: `1px solid ${T.sageBorder}`, borderRadius: T.radiusSm,
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                    }}>↺ Retry Failed</button>
                    <button onClick={() => { clearFailedItems(); setShowSyncPanel(false); }} style={{
                      flex: 1, padding: "8px", background: T.roseLight, color: T.rose,
                      border: "1px solid rgba(184,50,50,0.2)", borderRadius: T.radiusSm,
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                    }}>🗑 Clear Failed</button>
                  </div>
                )}
                <div style={{ fontSize: 12, color: T.inkSub, textAlign: "center" }}>
                  {sync.online ? "✅ Connected to Alera servers" : "⚠ Offline — changes saved locally"}
                </div>
              </div>
            </div>
          </div>
        )}

        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          ::-webkit-scrollbar { width: 4px; }
          ::-webkit-scrollbar-thumb { background: #D4D0CA; border-radius: 4px; }
          @keyframes syncPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
          @keyframes pulse   { 0%,100%{opacity:0.4} 50%{opacity:1} }
          @keyframes spin    { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
          @keyframes micPulse { 0%,100%{box-shadow:0 0 0 0 rgba(192,57,43,0.4)} 50%{box-shadow:0 0 0 5px rgba(192,57,43,0)} }
        `}</style>

        {/* ── Top nav ── */}
        <header style={{
          position: "sticky", top: 0, zIndex: 100,
          background: T.white, height: 56,
          borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center",
          padding: "0 20px", gap: 16,
          boxShadow: "0 1px 0 rgba(13,17,23,0.04)",
        }}>
          {/* Logo */}
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: T.ink, letterSpacing: -0.5, flexShrink: 0 }}>
            al<span style={{ color: T.sage }}>era</span>
          </div>

          <div style={{ width: 1, height: 18, background: T.border, flexShrink: 0 }} />

          {/* Screen nav — responsive with More dropdown */}
          {/* Screen nav — responsive with More dropdown */}
          <nav style={{ display: "flex", gap: 2, flexShrink: 0, alignItems: "center" }}>
            {screens.slice(0, 5).map(s => {
              const sm = SCREEN_META[s];
              const active = activeScreen === s;
              return (
                <button key={s} onClick={() => onScreenChange(s)} style={{
                  padding: "6px 12px", borderRadius: T.radiusSm, border: "none",
                  background: active ? T.ink : "transparent",
                  color: active ? "#fff" : T.inkSub,
                  fontSize: 12, fontWeight: active ? 600 : 400,
                  cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                  transition: "all 0.14s", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
                }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.paperDim; e.currentTarget.style.color = T.inkMid; } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.inkSub; } }}
                >
                  <span style={{ fontSize: 13 }}>{sm.icon}</span>
                  <span>{sm.shortLabel}</span>
                </button>
              );
            })}
            {screens.length > 5 && (
              <MoreDropdown
                screens={screens.slice(5)}
                activeScreen={activeScreen}
                onScreenChange={onScreenChange}
              />
            )}
          </nav>

          {/* ── AI Goal Input — always visible ── */}
          <form onSubmit={handleGoalSubmit} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, maxWidth: 420, margin: "0 auto" }}>
            <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
              <span style={{ position: "absolute", left: 11, fontSize: 14, color: T.inkSub, pointerEvents: "none" }}>✦</span>
              <input
                value={goalInput}
                onChange={e => setGoalInput(e.target.value)}
                placeholder="What do you want to do?"
                style={{
                  width: "100%", padding: "8px 12px 8px 32px",
                  border: `1.5px solid ${T.border}`, borderRadius: 20,
                  fontSize: 13, fontFamily: "'DM Sans',sans-serif",
                  color: T.ink, outline: "none", background: T.paper,
                  transition: "all 0.15s",
                }}
                onFocus={e => { e.target.style.borderColor = T.sage; e.target.style.background = T.white; e.target.style.boxShadow = `0 0 0 3px ${T.sageLight}`; }}
                onBlur={e => { e.target.style.borderColor = T.border; e.target.style.background = T.paper; e.target.style.boxShadow = "none"; }}
              />
            </div>
            <MicBtn onResult={transcript => {
              setGoalInput(transcript);
              // Auto-open guide with the spoken goal
              setInitialGoal(transcript);
              setGoalInput("");
              if (!guideOpen) setGuideOpen(true);
            }} />
            {goalInput.trim() && (
              <button type="submit" style={{ padding: "7px 14px", borderRadius: 20, border: "none", background: T.sage, color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.14s", flexShrink: 0 }}
                onMouseEnter={e => { e.currentTarget.style.background = T.sageMid; }}
                onMouseLeave={e => { e.currentTarget.style.background = T.sage; }}>Ask AI →</button>
            )}
          </form>

          {/* Right side */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {/* AI Guide button */}
            <button onClick={openGuide} style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "6px 13px", borderRadius: 20,
              border: `1.5px solid ${guideOpen ? T.sage : T.border}`,
              background: guideOpen ? T.sageLight : "transparent",
              color: guideOpen ? T.sage : T.inkSub,
              fontSize: 12.5, fontWeight: 500, cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif", transition: "all 0.14s",
            }}
              onMouseEnter={e => { if (!guideOpen) { e.currentTarget.style.borderColor = T.sage; e.currentTarget.style.color = T.sage; } }}
              onMouseLeave={e => { if (!guideOpen) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.inkSub; } }}
            >
              <span style={{ fontSize: 14 }}>✦</span> AI Guide
            </button>

            {/* Role pill */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 20, background: meta.bg, border: `1px solid ${meta.color}30` }}>
              <span style={{ fontSize: 14 }}>{meta.icon}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: meta.color }}>{meta.label}</span>
            </div>

            {/* Sync status indicator */}
            {(() => {
              const { label, pending, failed, online } = sync;
              const cfg = {
                synced:  { dot: "#27856A", text: "Synced",           title: "All data saved",                                    pulse: false },
                syncing: { dot: "#C97A10", text: `Syncing ${pending}…`, title: `${pending} item(s) pending sync`,               pulse: true  },
                error:   { dot: "#B83232", text: `${failed} failed`,  title: `${failed} item(s) failed to sync — click to retry`, pulse: false },
                offline: { dot: "#B83232", text: "Offline",           title: "No internet — changes will sync when back online",  pulse: false },
              }[label] ?? { dot: "#6E7891", text: "—", title: "", pulse: false };

              return (
                <div
                  onClick={() => setShowSyncPanel(true)}
                  title={cfg.title}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 10px", borderRadius: 20,
                    background: label === "offline" ? "#FDECEA" : label === "error" ? "#FDECEA" : label === "syncing" ? "#FEF5E7" : "#E6F3EE",
                    border: `1px solid ${label === "offline" || label === "error" ? "rgba(184,50,50,0.2)" : label === "syncing" ? "rgba(201,122,16,0.2)" : "rgba(26,102,80,0.2)"}`,
                    cursor: "pointer",
                  }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%", background: cfg.dot, display: "inline-block", flexShrink: 0,
                    ...(cfg.pulse ? { animation: "syncPulse 1.2s ease-in-out infinite" } : {}),
                  }} />
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: cfg.dot, fontFamily: "'JetBrains Mono',monospace" }}>
                    {cfg.text}
                  </span>
                </div>
              );
            })()}

            {/* Logout */}
            <button onClick={onLogout} style={{ padding: "6px 12px", borderRadius: T.radiusSm, border: `1px solid ${T.border}`, background: "transparent", color: T.inkSub, fontSize: 12.5, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.14s" }}
              onMouseEnter={e => { e.currentTarget.style.background = T.paperDim; e.currentTarget.style.color = T.inkMid; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.inkSub; }}
            >Switch role</button>
          </div>
        </header>

        {/* ── Contextual banner — role-specific hint for current screen ── */}
        {(() => {
          const hint = SCREEN_HINTS[activeScreen]?.[role];
          const isLimited = !can(role, "canWriteNotes") && activeScreen === "notes"
            || !can(role, "canPrescribe") && activeScreen === "prescription"
            || !canRead(role, "canViewBilling") && activeScreen === "billing";
          if (!isLimited) return null;
          return (
            <div style={{ background: "#FEF5E7", borderBottom: "1px solid rgba(201,122,16,0.2)", padding: "9px 24px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#C97A10" }}>
              <span>⚠</span>
              <span style={{ fontWeight: 500 }}>Limited access:</span>
              <span>{hint}</span>
            </div>
          );
        })()}

        {/* ── Main content ── */}
        <main style={{ paddingRight: guideOpen ? 360 : 0, transition: "padding-right 0.25s ease" }}>
          {children}
        </main>

        {/* ── AI Guide Panel ── */}
        {guideOpen && (
          <AiGuidePanel
            role={role}
            screen={activeScreen}
            encounterState={encounterState}
            onClose={() => { setGuideOpen(false); setInitialGoal(null); }}
            initialGoal={initialGoal}
          />
        )}
      </div>
    </RoleContext.Provider>
  );
}

// ─── App Entry Point ──────────────────────────────────────────────────────────
// Wire everything together: Login → Shell → Screens
// Import this in your main App.jsx or index.jsx

export function AleraApp() {
  const [role,         setRole]         = useState(null);
  const [activeScreen, setActiveScreen] = useState(null);

  function handleLogin(selectedRole) {
    setRole(selectedRole);
    // Default to first accessible screen for this role
    const defaultScreen = SCREEN_ACCESS[selectedRole]?.[0] || "encounter";
    setActiveScreen(defaultScreen);
  }

  function handleLogout() {
    setRole(null);
    setActiveScreen(null);
  }

  // Lazy import screens — replace with your actual screen components
  if (!role) {
    // Return login — import AleraLogin separately in your app
    return (
      <div style={{ minHeight: "100vh", background: "#0D1117", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif", color: "#fff" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 32, marginBottom: 8 }}>al<span style={{ color: "#27856A" }}>era</span></div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Import AleraLogin and pass onLogin={"{handleLogin}"} to get started.</div>
        </div>
      </div>
    );
  }

  return (
    <AleraShell role={role} onLogout={handleLogout} activeScreen={activeScreen} onScreenChange={setActiveScreen}>
      {/* Slot your screen components here based on activeScreen */}
      <div style={{ padding: 32, color: "#0D1117", fontFamily: "'DM Sans',sans-serif" }}>
        <div style={{ fontSize: 13, color: "#6E7891", marginBottom: 8, fontFamily: "'JetBrains Mono',monospace" }}>ACTIVE SCREEN</div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 22 }}>
          {SCREEN_META[activeScreen]?.label || activeScreen}
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: "#6E7891" }}>
          Wire your screen components here. Pass <code>useRole()</code> inside each screen to access role permissions.
        </div>
      </div>
    </AleraShell>
  );
}
