/**
 * Smart Dairy — WhatsApp Client (Frontend)
 *
 * Provides a clean API for the React UI to interact with the
 * WhatsApp server running on the backend. Uses Socket.io for
 * real-time QR code and status updates, and REST for send actions.
 *
 * Falls back gracefully when the server is not running (pure
 * browser mode — uses wa.me deep links instead).
 */

const SERVER_BASE = window.location.origin; // Same origin as the server

// ─── State ──────────────────────────────────────────────────────────

let _socket = null;
let _status = { state: 'disconnected', qrDataUrl: null, phoneNumber: null };
let _listeners = new Set();
let _socketConnected = false;

// ─── Socket.io Connection ───────────────────────────────────────────

/**
 * Initialize the Socket.io connection to the backend.
 * Safe to call multiple times — only connects once.
 */
export async function initWhatsAppClient() {
  if (_socket) return;

  try {
    // Dynamic import to avoid bundling socket.io-client when not needed
    const { io } = await import('socket.io-client');

    _socket = io(SERVER_BASE, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity,
    });

    _socket.on('connect', () => {
      _socketConnected = true;
      _notifyListeners();
    });

    _socket.on('disconnect', () => {
      _socketConnected = false;
      _status = { state: 'disconnected', qrDataUrl: null, phoneNumber: null };
      _notifyListeners();
    });

    // Real-time status updates from the server
    _socket.on('whatsapp:status', (data) => {
      _status = data;
      _notifyListeners();
    });

    _socket.on('whatsapp:qr', (data) => {
      _status = { ..._status, state: 'qr_pending', qrDataUrl: data.qrDataUrl };
      _notifyListeners();
    });

    _socket.on('whatsapp:connected', (data) => {
      _status = { ..._status, state: 'connected', qrDataUrl: null, phoneNumber: data.phoneNumber };
      _notifyListeners();
    });

    _socket.on('whatsapp:disconnected', () => {
      _status = { ..._status, state: 'disconnected', qrDataUrl: null, phoneNumber: null };
      _notifyListeners();
    });
  } catch (err) {
    console.warn('[WhatsApp Client] Socket.io not available:', err.message);
    _socketConnected = false;
  }
}

// ─── Status API ─────────────────────────────────────────────────────

/**
 * Get the current WhatsApp status.
 * @returns {{ state: string, qrDataUrl: string|null, phoneNumber: string|null }}
 */
export function getWhatsAppStatus() {
  return { ..._status, serverAvailable: _socketConnected };
}

/**
 * Check if the WhatsApp server backend is available.
 * @returns {boolean}
 */
export function isServerAvailable() {
  return _socketConnected;
}

/**
 * Subscribe to WhatsApp status changes.
 * @param {Function} callback - Called with the new status object
 * @returns {Function} Unsubscribe function
 */
export function onWhatsAppStatusChange(callback) {
  _listeners.add(callback);
  return () => _listeners.delete(callback);
}

function _notifyListeners() {
  const status = getWhatsAppStatus();
  _listeners.forEach((cb) => {
    try { cb(status); } catch { /* ignore listener errors */ }
  });
}

// ─── Actions ────────────────────────────────────────────────────────

/**
 * Initiate WhatsApp connection (triggers QR code generation on server).
 */
export async function connectWhatsApp() {
  try {
    const res = await fetch(`${SERVER_BASE}/api/whatsapp/connect`, { method: 'POST' });
    return await res.json();
  } catch (err) {
    return { success: false, message: `Server unavailable: ${err.message}` };
  }
}

/**
 * Disconnect WhatsApp and clear the session.
 */
export async function disconnectWhatsApp() {
  try {
    const res = await fetch(`${SERVER_BASE}/api/whatsapp/disconnect`, { method: 'POST' });
    return await res.json();
  } catch (err) {
    return { success: false, message: `Server unavailable: ${err.message}` };
  }
}

/**
 * Send a WhatsApp message via the server (background, no app opening).
 * @param {string} phone - Indian mobile number (10 digits)
 * @param {string} message - Message text
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function sendWhatsAppMessage(phone, message) {
  try {
    const res = await fetch(`${SERVER_BASE}/api/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message }),
    });
    return await res.json();
  } catch (err) {
    return { success: false, message: `Server unavailable: ${err.message}` };
  }
}

/**
 * Fetch server health status.
 */
export async function checkServerHealth() {
  try {
    const res = await fetch(`${SERVER_BASE}/api/health`);
    if (res.ok) return await res.json();
    return null;
  } catch {
    return null;
  }
}
