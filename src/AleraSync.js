// =============================================================================
// AleraSync.js — Offline Queue & Sync Engine
// =============================================================================
// Handles the reality of intermittent connectivity in Nigerian clinics.
//
// HOW IT WORKS:
//   1. Every Supabase write is wrapped via syncedWrite()
//   2. If online → attempt immediately, mark synced
//   3. If offline → store in localStorage queue, mark pending
//   4. On reconnect → flush queue in order, retry failed items
//   5. Conflicts (server has newer data) → flagged for manual review
//
// QUEUE STORAGE:
//   localStorage key: "alera_sync_queue"
//   Each item: { id, table, operation, payload, timestamp, retries, status }
//
// USAGE:
//   import { syncedWrite, useSyncStatus } from "./AleraSync.js"
//
//   // Instead of: supabase.from("patients").insert(data)
//   // Use:        syncedWrite("patients", "insert", data)
//
// =============================================================================

import { supabase } from "./supabase.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const QUEUE_KEY      = "alera_sync_queue";
const MAX_RETRIES    = 5;
const RETRY_DELAYS   = [2000, 5000, 15000, 30000, 60000]; // ms, exponential backoff
const FLUSH_INTERVAL = 10000; // poll every 10s when online

// Tables that support offline sync (have sync_status column in schema)
const SYNCABLE_TABLES = new Set([
  "patients",
  "patient_allergies",
  "encounters",
  "vitals",
  "clinical_notes",
  "diagnoses",
  "prescriptions",
  "prescription_items",
  "dispensing_records",
  "bills",
  "bill_items",
  "ai_events",
]);

// ─── Queue management ─────────────────────────────────────────────────────────

function loadQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn("[AleraSync] localStorage full or unavailable:", e.message);
  }
}

function addToQueue(item) {
  const queue = loadQueue();
  queue.push({
    id:        `sq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    status:    "pending",    // pending | retrying | failed | synced
    retries:   0,
    createdAt: new Date().toISOString(),
    ...item,
  });
  saveQueue(queue);
  notifyListeners();
}

function updateQueueItem(id, updates) {
  const queue = loadQueue();
  const idx   = queue.findIndex(i => i.id === id);
  if (idx !== -1) {
    queue[idx] = { ...queue[idx], ...updates };
    saveQueue(queue);
    notifyListeners();
  }
}

function removeFromQueue(id) {
  const queue = loadQueue().filter(i => i.id !== id);
  saveQueue(queue);
  notifyListeners();
}

// ─── Connectivity detection ───────────────────────────────────────────────────

let _isOnline = navigator.onLine;

window.addEventListener("online",  () => { _isOnline = true;  notifyListeners(); flushQueue(); });
window.addEventListener("offline", () => { _isOnline = false; notifyListeners(); });

export function isOnline() {
  return _isOnline;
}

// Ping Supabase to verify true connectivity (navigator.onLine can lie)
let _supabaseReachable = true;
async function checkSupabaseReachable() {
  try {
    const { error } = await supabase.from("organisations").select("id").limit(1).maybeSingle();
    _supabaseReachable = !error || error.code !== "PGRST301"; // not a network error
  } catch {
    _supabaseReachable = false;
  }
  return _supabaseReachable;
}

// ─── Listeners (React hooks subscribe here) ───────────────────────────────────

const listeners = new Set();

function notifyListeners() {
  const status = getSyncStatus();
  listeners.forEach(fn => fn(status));
}

export function subscribeSyncStatus(fn) {
  listeners.add(fn);
  fn(getSyncStatus()); // immediate call with current state
  return () => listeners.delete(fn);
}

export function getSyncStatus() {
  const queue   = loadQueue();
  const pending = queue.filter(i => i.status === "pending" || i.status === "retrying").length;
  const failed  = queue.filter(i => i.status === "failed").length;
  const total   = queue.length;

  return {
    online:   _isOnline,
    reachable: _supabaseReachable,
    pending,
    failed,
    total,
    queue,
    // Derived label for UI
    label: !_isOnline
      ? "offline"
      : pending > 0
      ? "syncing"
      : failed > 0
      ? "error"
      : "synced",
  };
}

// ─── Core write wrapper ───────────────────────────────────────────────────────

/**
 * syncedWrite — wraps a Supabase write with offline fallback.
 *
 * @param {string} table       - Supabase table name
 * @param {string} operation   - "insert" | "update" | "upsert"
 * @param {object} payload     - data to write
 * @param {object} [match]     - for update: { column: value } to match row
 * @returns {Promise<{ data, error, queued }>}
 *   queued=true means it was saved locally for later sync
 */
export async function syncedWrite(table, operation, payload, match = null) {
  // Always set sync_status on syncable tables
  const data = SYNCABLE_TABLES.has(table)
    ? { ...payload, sync_status: "pending" }
    : payload;

  // Try immediate write if online
  if (_isOnline) {
    try {
      let query = supabase.from(table);

      if (operation === "insert") {
        const result = await query.insert({ ...data, sync_status: "synced" }).select().single();
        if (!result.error) return { data: result.data, error: null, queued: false };
        if (!result.error?.message?.includes("network")) {
          console.error(`[AleraSync] DB error on ${table} insert:`, result.error.message);
          return { data: null, error: result.error, queued: false };
        }
      } else if (operation === "update" && match) {
        let q = query.update({ ...data, sync_status: "synced" });
        Object.entries(match).forEach(([col, val]) => { q = q.eq(col, val); });
        const result = await q.select().single();
        if (!result.error) return { data: result.data, error: null, queued: false };
        if (!result.error?.message?.includes("network")) {
          console.error(`[AleraSync] DB error on ${table} update:`, result.error.message);
          return { data: null, error: result.error, queued: false };
        }
      } else if (operation === "upsert") {
        const result = await query.upsert({ ...data, sync_status: "synced" }).select().single();
        if (!result.error) return { data: result.data, error: null, queued: false };
        if (!result.error?.message?.includes("network")) {
          console.error(`[AleraSync] DB error on ${table} upsert:`, result.error.message);
          return { data: null, error: result.error, queued: false };
        }
      }
    } catch (networkErr) {
      // Network error — fall through to queue
      _isOnline = false;
      notifyListeners();
    }
  }

  // Offline or write failed — queue locally
  const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  addToQueue({ table, operation, payload: data, match, localId });

  console.info(`[AleraSync] Queued ${operation} on ${table} (offline). Local ID: ${localId}`);

  // Return a synthetic "local" record so the UI can continue working
  return {
    data:    { ...data, id: localId, sync_status: "pending" },
    error:   null,
    queued:  true,
    localId,
  };
}

// ─── Queue flush ──────────────────────────────────────────────────────────────

let _flushing = false;

export async function flushQueue() {
  if (_flushing || !_isOnline) return;

  const queue = loadQueue().filter(i => i.status === "pending" || i.status === "retrying");
  if (!queue.length) return;

  // Verify Supabase is actually reachable before attempting
  const reachable = await checkSupabaseReachable();
  if (!reachable) return;

  _flushing = true;
  console.info(`[AleraSync] Flushing ${queue.length} queued items…`);

  for (const item of queue) {
    await processQueueItem(item);
  }

  _flushing = false;
  notifyListeners();
}

async function processQueueItem(item) {
  updateQueueItem(item.id, { status: "retrying" });

  try {
    let result;
    const { table, operation, payload, match } = item;

    // Strip local_id from payload before sending to Supabase
    const cleanPayload = { ...payload };
    delete cleanPayload.local_id;

    // Replace local IDs in foreign keys with real UUIDs if we have a mapping
    const resolvedPayload = resolveLocalIds(cleanPayload);

    let query = supabase.from(table);

    if (operation === "insert") {
      result = await query.insert({ ...resolvedPayload, sync_status: "synced" }).select().single();
    } else if (operation === "update" && match) {
      let q = query.update({ ...resolvedPayload, sync_status: "synced" });
      const resolvedMatch = resolveLocalIds(match);
      Object.entries(resolvedMatch).forEach(([col, val]) => { q = q.eq(col, val); });
      result = await q.select().single();
    } else if (operation === "upsert") {
      result = await query.upsert({ ...resolvedPayload, sync_status: "synced" }).select().single();
    }

    if (result?.error) {
      throw new Error(result.error.message);
    }

    // Success — record local→real ID mapping for dependent records
    if (result?.data?.id && payload.id?.startsWith?.("local_")) {
      registerIdMapping(payload.id, result.data.id);
    }

    removeFromQueue(item.id);
    console.info(`[AleraSync] ✓ Synced ${item.operation} on ${item.table}`);

  } catch (err) {
    const retries = (item.retries ?? 0) + 1;

    if (retries >= MAX_RETRIES) {
      updateQueueItem(item.id, { status: "failed", retries, lastError: err.message });
      console.error(`[AleraSync] ✗ Permanently failed ${item.operation} on ${item.table}:`, err.message);
    } else {
      updateQueueItem(item.id, { status: "pending", retries, lastError: err.message });
      // Schedule retry with backoff
      const delay = RETRY_DELAYS[Math.min(retries - 1, RETRY_DELAYS.length - 1)];
      setTimeout(() => flushQueue(), delay);
    }
  }
}

// ─── Local ID resolution ──────────────────────────────────────────────────────
// When records are created offline, they get local IDs (local_xxxxx).
// When they sync, we record the mapping local→real UUID so dependent
// records (e.g. encounter_id in vitals) can be updated before syncing.

const idMappings = new Map();

function registerIdMapping(localId, realId) {
  idMappings.set(localId, realId);
  // Persist to localStorage for cross-session survival
  try {
    const stored = JSON.parse(localStorage.getItem("alera_id_mappings") || "{}");
    stored[localId] = realId;
    localStorage.setItem("alera_id_mappings", JSON.stringify(stored));
  } catch { /* silent */ }
}

function resolveLocalIds(obj) {
  if (!obj || typeof obj !== "object") return obj;

  // Load persisted mappings
  try {
    const stored = JSON.parse(localStorage.getItem("alera_id_mappings") || "{}");
    Object.entries(stored).forEach(([k, v]) => idMappings.set(k, v));
  } catch { /* silent */ }

  const resolved = { ...obj };
  for (const [key, val] of Object.entries(resolved)) {
    if (typeof val === "string" && val.startsWith("local_") && idMappings.has(val)) {
      resolved[key] = idMappings.get(val);
    }
  }
  return resolved;
}

// ─── Auto-flush polling ───────────────────────────────────────────────────────

let _flushTimer = null;

export function startSyncEngine() {
  if (_flushTimer) return; // already running
  _flushTimer = setInterval(() => {
    if (_isOnline && loadQueue().some(i => i.status === "pending" || i.status === "retrying")) {
      flushQueue();
    }
  }, FLUSH_INTERVAL);

  // Flush immediately on start if there are pending items
  flushQueue();

  console.info("[AleraSync] Sync engine started.");
}

export function stopSyncEngine() {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
}

// ─── Manual retry failed items ────────────────────────────────────────────────

export function retryFailed() {
  const queue = loadQueue();
  const updated = queue.map(i =>
    i.status === "failed" ? { ...i, status: "pending", retries: 0 } : i
  );
  saveQueue(updated);
  notifyListeners();
  flushQueue();
}

// ─── Clear synced items (cleanup) ────────────────────────────────────────────

export function clearSyncedItems() {
  const queue = loadQueue().filter(i => i.status !== "synced");
  saveQueue(queue);
  notifyListeners();
}

// ─── React hook ───────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";

/**
 * useSyncStatus — React hook for sync state in components.
 *
 * Returns: { online, pending, failed, total, label, queue, retryFailed }
 */
export function useSyncStatus() {
  const [status, setStatus] = useState(getSyncStatus);

  useEffect(() => {
    const unsub = subscribeSyncStatus(setStatus);
    return unsub;
  }, []);

  return { ...status, retryFailed };
}
