/**
 * Smart Dairy — Offline Authentication Utility
 * 
 * Uses the browser-native Web Crypto API (PBKDF2 with SHA-256) for
 * password and PIN hashing. Zero external dependencies.
 * 
 * Security model:
 *  - Check 1: Password login (PBKDF2, 100k iterations)
 *  - Check 2: 4-digit Security PIN for sensitive operations
 *  - Session stored in sessionStorage (cleared on tab/browser close)
 *  - Immutable audit trail for all sensitive actions
 */
import db from '../db';

// ─── Constants ───────────────────────────────────────────────────────
const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const SESSION_KEY = 'smartDairySession';
const LOCKOUT_KEY = 'smartDairyLockout';
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30000; // 30 seconds

// Role hierarchy (higher number = more privileges)
export const ROLES = {
  operator: { level: 1, label: 'Operator' },
  manager:  { level: 2, label: 'Manager' },
  admin:    { level: 3, label: 'Admin' },
};

// Page-level access control map
export const PAGE_ACCESS = {
  dashboard:    'operator',
  purchase:     'operator',
  farmers:      'manager',
  'rate-chart': 'admin',
  payments:     'manager',
  'store-sales': 'manager',
  dispatches:   'operator',
  livestock:    'operator',
  loans:        'manager',
  settings:     'admin',
};

// ─── Crypto Helpers ──────────────────────────────────────────────────

/**
 * Generate a cryptographically strong random salt.
 * @returns {string} Hex-encoded salt
 */
export function generateSalt() {
  const saltBuffer = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return bufferToHex(saltBuffer);
}

/**
 * Hash a password or PIN using PBKDF2 with SHA-256.
 * @param {string} input - The password or PIN string
 * @param {string} saltHex - Hex-encoded salt
 * @returns {Promise<string>} Hex-encoded derived key
 */
export async function hashPassword(input, saltHex) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(input),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const salt = hexToBuffer(saltHex);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    HASH_BYTES * 8
  );
  return bufferToHex(new Uint8Array(derivedBits));
}

/**
 * Verify an input against a stored hash.
 * @param {string} input - The password or PIN to verify
 * @param {string} storedHash - The stored hex-encoded hash
 * @param {string} saltHex - The stored hex-encoded salt
 * @returns {Promise<boolean>} True if match
 */
export async function verifyPassword(input, storedHash, saltHex) {
  const computedHash = await hashPassword(input, saltHex);
  return timingSafeEqual(computedHash, storedHash);
}

// ─── Session Management ──────────────────────────────────────────────

/**
 * Store the current user session.
 * @param {{ id: number, username: string, role: string }} user
 */
export function setCurrentUser(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    id: user.id,
    username: user.username,
    role: user.role,
    loginAt: new Date().toISOString(),
  }));
}

/**
 * Get the current logged-in user, or null.
 * @returns {{ id: number, username: string, role: string, loginAt: string } | null}
 */
export function getCurrentUser() {
  const data = sessionStorage.getItem(SESSION_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Clear the session (logout).
 */
export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Check if the current user has at least the required role level.
 * @param {string} requiredRole - 'operator' | 'manager' | 'admin'
 * @returns {boolean}
 */
export function hasRole(requiredRole) {
  const user = getCurrentUser();
  if (!user) return false;
  const userLevel = ROLES[user.role]?.level || 0;
  const requiredLevel = ROLES[requiredRole]?.level || 99;
  return userLevel >= requiredLevel;
}

/**
 * Check if a specific page is accessible to the current user.
 * @param {string} pageId
 * @returns {boolean}
 */
export function canAccessPage(pageId) {
  const requiredRole = PAGE_ACCESS[pageId] || 'admin';
  return hasRole(requiredRole);
}

// ─── Lockout Management ──────────────────────────────────────────────

/**
 * Check if the login is currently locked out.
 * @returns {{ locked: boolean, remainingMs: number }}
 */
export function checkLockout() {
  const data = sessionStorage.getItem(LOCKOUT_KEY);
  if (!data) return { locked: false, remainingMs: 0 };
  try {
    const { lockedUntil } = JSON.parse(data);
    const remaining = lockedUntil - Date.now();
    if (remaining > 0) {
      return { locked: true, remainingMs: remaining };
    }
    sessionStorage.removeItem(LOCKOUT_KEY);
    return { locked: false, remainingMs: 0 };
  } catch {
    sessionStorage.removeItem(LOCKOUT_KEY);
    return { locked: false, remainingMs: 0 };
  }
}

/**
 * Record a failed login attempt. Triggers lockout after MAX_ATTEMPTS.
 * @returns {{ locked: boolean, attemptsLeft: number }}
 */
export function recordFailedAttempt() {
  const data = sessionStorage.getItem(LOCKOUT_KEY);
  let attempts = 0;
  if (data) {
    try {
      const parsed = JSON.parse(data);
      attempts = parsed.attempts || 0;
    } catch { /* ignore */ }
  }
  attempts++;
  if (attempts >= MAX_ATTEMPTS) {
    sessionStorage.setItem(LOCKOUT_KEY, JSON.stringify({
      attempts,
      lockedUntil: Date.now() + LOCKOUT_DURATION_MS,
    }));
    return { locked: true, attemptsLeft: 0 };
  }
  sessionStorage.setItem(LOCKOUT_KEY, JSON.stringify({ attempts }));
  return { locked: false, attemptsLeft: MAX_ATTEMPTS - attempts };
}

/**
 * Clear failed attempt counter (on successful login).
 */
export function clearLockout() {
  sessionStorage.removeItem(LOCKOUT_KEY);
}

// ─── Audit Trail ─────────────────────────────────────────────────────

/**
 * Log an action to the immutable audit trail.
 * @param {string} action - e.g. 'LOGIN', 'DELETE_ENTRY', 'MODIFY_RATE_CHART'
 * @param {string} [target] - e.g. 'Purchase #42', 'Rate Chart Cow-FAT'
 */
export async function logAudit(action, target = '') {
  const user = getCurrentUser();
  await db.auditLog.add({
    userId: user?.id || 0,
    username: user?.username || 'system',
    action,
    target,
    timestamp: new Date().toISOString(),
  });
}

// ─── Default Admin Seeding ───────────────────────────────────────────

/**
 * Ensure a default admin user exists on first launch.
 * Called from ensureDefaults() in db.js.
 */
export async function ensureDefaultAdmin() {
  const count = await db.users.count();
  if (count > 0) return;

  const passwordSalt = generateSalt();
  const pinSalt = generateSalt();
  const passwordHash = await hashPassword('admin123', passwordSalt);
  const pinHash = await hashPassword('0000', pinSalt);

  await db.users.add({
    username: 'admin',
    displayName: 'Administrator',
    role: 'admin',
    passwordHash,
    passwordSalt,
    pinHash,
    pinSalt,
    isActive: true,
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  });
}

// ─── Internal Helpers ────────────────────────────────────────────────

function bufferToHex(buffer) {
  return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
