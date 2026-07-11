/**
 * Smart Dairy — WhatsApp Server Module
 *
 * Uses @whiskeysockets/baileys to connect to WhatsApp's Multi-Device
 * protocol via WebSocket. Provides:
 *   - QR code generation for initial phone linking
 *   - Session persistence (scan once, reconnects automatically)
 *   - Rate-limited message sending with human-like delays
 *   - Connection state machine with event emission
 *
 * All communication is local. No cloud APIs or third-party services.
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  delay,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Constants ───────────────────────────────────────────────────────

const AUTH_DIR = path.join(__dirname, 'auth_info');
const MIN_SEND_DELAY_MS = 3000;   // Minimum 3s between messages
const MAX_SEND_DELAY_MS = 8000;   // Maximum 8s (human-like randomness)

// ─── Connection States ───────────────────────────────────────────────

export const WA_STATE = {
  DISCONNECTED: 'disconnected',
  QR_PENDING: 'qr_pending',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
};

// ─── WhatsApp Manager Class ──────────────────────────────────────────

class WhatsAppManager extends EventEmitter {
  constructor() {
    super();
    this.sock = null;
    this.state = WA_STATE.DISCONNECTED;
    this.qrDataUrl = null;
    this.phoneNumber = null;
    this.lastSendTime = 0;
    this._reconnectTimer = null;
    this._intentionalDisconnect = false;
  }

  /**
   * Get the current status object for API responses.
   */
  getStatus() {
    return {
      state: this.state,
      qrDataUrl: this.qrDataUrl,
      phoneNumber: this.phoneNumber,
    };
  }

  /**
   * Initiate a WhatsApp connection.
   * If already connected, returns immediately.
   * If auth_info exists, reconnects without QR scan.
   */
  async connect() {
    if (this.state === WA_STATE.CONNECTED) {
      return { success: true, message: 'Already connected' };
    }

    this._intentionalDisconnect = false;
    this._setState(WA_STATE.CONNECTING);

    try {
      const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

      this.sock = makeWASocket({
        auth: {
          creds: authState.creds,
          keys: makeCacheableSignalKeyStore(authState.keys, console.log),
        },
        printQRInTerminal: false,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });

      // ── Credential persistence ──
      this.sock.ev.on('creds.update', saveCreds);

      // ── Connection state updates ──
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // QR code received — convert to data URL and emit
        if (qr) {
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, {
              width: 280,
              margin: 2,
              color: { dark: '#1a1a2e', light: '#ffffff' },
            });
            this._setState(WA_STATE.QR_PENDING);
            this.emit('qr', this.qrDataUrl);
          } catch (err) {
            console.error('[WhatsApp] QR generation error:', err.message);
          }
        }

        // Connection opened
        if (connection === 'open') {
          this.qrDataUrl = null;
          // Extract phone number from credentials
          const jid = this.sock?.user?.id;
          if (jid) {
            this.phoneNumber = jid.split(':')[0].split('@')[0];
          }
          this._setState(WA_STATE.CONNECTED);
          this.emit('connected', { phoneNumber: this.phoneNumber });
          console.log(`[WhatsApp] Connected as +${this.phoneNumber}`);
        }

        // Connection closed
        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error instanceof Boom)
            ? lastDisconnect.error.output.statusCode
            : lastDisconnect?.error?.output?.statusCode;

          const loggedOut = statusCode === DisconnectReason.loggedOut;

          if (loggedOut) {
            // User logged out — clear session
            console.log('[WhatsApp] Logged out. Clearing session.');
            this._clearSession();
            this._setState(WA_STATE.DISCONNECTED);
            this.emit('disconnected', { reason: 'logged_out' });
          } else if (!this._intentionalDisconnect) {
            // Unexpected disconnect — attempt reconnection
            console.log(`[WhatsApp] Disconnected (code: ${statusCode}). Reconnecting in 5s...`);
            this._setState(WA_STATE.CONNECTING);
            this.emit('disconnected', { reason: 'connection_lost' });
            this._reconnectTimer = setTimeout(() => this.connect(), 5000);
          } else {
            this._setState(WA_STATE.DISCONNECTED);
            this.emit('disconnected', { reason: 'intentional' });
          }
        }
      });

      return { success: true, message: 'Connection initiated' };
    } catch (err) {
      console.error('[WhatsApp] Connection error:', err.message);
      this._setState(WA_STATE.DISCONNECTED);
      return { success: false, message: err.message };
    }
  }

  /**
   * Disconnect WhatsApp intentionally.
   */
  async disconnect() {
    this._intentionalDisconnect = true;

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this.sock) {
      try {
        await this.sock.logout();
      } catch {
        // Ignore — socket may already be closed
      }
      this.sock = null;
    }

    this._clearSession();
    this.phoneNumber = null;
    this.qrDataUrl = null;
    this._setState(WA_STATE.DISCONNECTED);
    this.emit('disconnected', { reason: 'intentional' });

    return { success: true, message: 'Disconnected and session cleared' };
  }

  /**
   * Send a text message to a phone number.
   * Enforces rate limiting with human-like random delays.
   *
   * @param {string} phone - Indian 10-digit number (no country code)
   * @param {string} text - Message body
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async sendMessage(phone, text) {
    if (this.state !== WA_STATE.CONNECTED || !this.sock) {
      return { success: false, message: 'WhatsApp not connected' };
    }

    // Normalize phone: remove spaces/dashes, add country code
    const cleaned = phone.replace(/[\s\-()]/g, '').replace(/^0+/, '');
    const withCountryCode = cleaned.startsWith('91') ? cleaned : `91${cleaned}`;
    const jid = `${withCountryCode}@s.whatsapp.net`;

    // Rate limiting: enforce minimum delay between sends
    const now = Date.now();
    const elapsed = now - this.lastSendTime;
    const randomDelay = MIN_SEND_DELAY_MS + Math.random() * (MAX_SEND_DELAY_MS - MIN_SEND_DELAY_MS);

    if (elapsed < randomDelay) {
      const waitMs = Math.ceil(randomDelay - elapsed);
      await delay(waitMs);
    }

    try {
      await this.sock.sendMessage(jid, { text });
      this.lastSendTime = Date.now();
      console.log(`[WhatsApp] Message sent to +${withCountryCode}`);
      return { success: true, message: `Sent to +${withCountryCode}` };
    } catch (err) {
      console.error(`[WhatsApp] Send error to +${withCountryCode}:`, err.message);
      return { success: false, message: err.message };
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────

  _setState(newState) {
    const oldState = this.state;
    this.state = newState;
    if (oldState !== newState) {
      this.emit('stateChange', { from: oldState, to: newState });
    }
  }

  _clearSession() {
    try {
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
    } catch (err) {
      console.error('[WhatsApp] Failed to clear session:', err.message);
    }
  }
}

// ─── Singleton export ────────────────────────────────────────────────

const whatsapp = new WhatsAppManager();
export default whatsapp;
