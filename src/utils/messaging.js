/**
 * Smart Dairy — 1-Click Messaging Utility
 *
 * Generates deep links for WhatsApp (wa.me) and SMS (sms:) protocols.
 * When clicked, these links open the respective installed app with
 * a pre-composed message — the user only needs to tap "Send".
 *
 * Works fully offline — no API keys or cloud services needed.
 */
import db from '../db';
import { formatCurrency, formatNumber } from './formatters';

// ─── Deep Link Generators ────────────────────────────────────────────

/**
 * Compose a WhatsApp deep link URL.
 * @param {string} phone - Indian mobile number (10 digits, no country code)
 * @param {string} message - The message body
 * @returns {string} wa.me URL
 */
export function composeWhatsAppUrl(phone, message) {
  // Normalize phone: remove spaces, dashes, leading 0, add 91 prefix
  const cleaned = phone.replace(/[\s\-()]/g, '').replace(/^0+/, '');
  const withCountryCode = cleaned.startsWith('91') ? cleaned : `91${cleaned}`;
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${withCountryCode}?text=${encoded}`;
}

/**
 * Compose an SMS deep link URI.
 * @param {string} phone - Indian mobile number
 * @param {string} message - The message body
 * @returns {string} sms: URI
 */
export function composeSmsUrl(phone, message) {
  const cleaned = phone.replace(/[\s\-()]/g, '').replace(/^0+/, '');
  const withCountryCode = cleaned.startsWith('91') ? cleaned : `91${cleaned}`;
  const encoded = encodeURIComponent(message);
  // Use ?body= for Android/iOS compatibility; &body= for some older devices
  return `sms:+${withCountryCode}?body=${encoded}`;
}

// ─── Message Templates ───────────────────────────────────────────────

/**
 * Build a milk purchase entry receipt message.
 * @param {{ dairyName: string, address?: string }} config
 * @param {Object} entry - The purchase entry record
 * @returns {string}
 */
export function buildMilkEntryMessage(config, entry) {
  const lines = [
    `🥛 *${config?.dairyName || 'Smart Dairy'}*`,
    `━━━━━━━━━━━━━━━━`,
    `📅 Date: ${entry.date}`,
    `⏰ Shift: ${entry.shift === 'morning' ? 'Morning ☀️' : 'Evening 🌙'}`,
    ``,
    `👤 Farmer: ${entry.farmerCode} - ${entry.farmerName}`,
    `🥛 Milk: ${entry.milkType === 'cow' ? 'Cow 🐄' : entry.milkType === 'buffalo' ? 'Buffalo 🐃' : 'Mixed'}`,
    `⚖️ Qty: ${formatNumber(entry.qty, 1)} Kg`,
    `📊 FAT: ${formatNumber(entry.fat, 1)}%`,
    `📊 SNF: ${formatNumber(entry.snf, 1)}%`,
    `💰 Rate: ₹${formatNumber(entry.rate, 2)}/Ltr`,
    ``,
    `━━━━━━━━━━━━━━━━`,
    `💵 *Amount: ${formatCurrency(entry.amount)}*`,
    `━━━━━━━━━━━━━━━━`,
    ``,
    `Thank you for your milk supply! 🙏`,
  ];
  return lines.join('\n');
}

/**
 * Build a payment settlement notification message.
 * @param {{ dairyName: string }} config
 * @param {Object} payment - The payment record
 * @returns {string}
 */
export function buildPaymentMessage(config, payment) {
  const lines = [
    `🏦 *${config?.dairyName || 'Smart Dairy'}*`,
    `━━━━━━━━━━━━━━━━`,
    `📋 *Payment Statement*`,
    ``,
    `👤 Farmer: ${payment.farmerCode} - ${payment.farmerName}`,
    `📅 Period: ${payment.periodStart} to ${payment.periodEnd}`,
    ``,
    `⚖️ Total Qty: ${formatNumber(payment.totalQty || 0, 1)} Kg`,
    `💰 Gross Amt: ${formatCurrency(payment.grossAmount || 0)}`,
  ];

  if (payment.totalDeductions > 0) {
    lines.push(`🔻 Deductions: ${formatCurrency(payment.totalDeductions)}`);
  }

  lines.push(
    ``,
    `━━━━━━━━━━━━━━━━`,
    `💵 *Net Payable: ${formatCurrency(payment.netPayable || payment.grossAmount || 0)}*`,
    `━━━━━━━━━━━━━━━━`,
    ``,
    `Mode: ${payment.paymentMode || 'Cash'}`,
    ``,
    `Thank you! 🙏`,
  );
  return lines.join('\n');
}

// ─── Send Actions ────────────────────────────────────────────────────

import { sendWhatsAppMessage, isServerAvailable } from './whatsappClient';

/**
 * Send a WhatsApp message — smart routing.
 * If the WhatsApp server is connected, sends in background (no app opening).
 * Otherwise, falls back to the wa.me deep-link (opens WhatsApp app).
 *
 * @param {string} phone - Farmer's mobile number
 * @param {string} message - The formatted message
 * @param {string} [messageType='milk_entry'] - For logging
 * @param {string} [farmerCode] - For logging
 * @returns {Promise<{success: boolean, method: string, message?: string}>}
 */
export async function sendViaWhatsApp(phone, message, messageType = 'milk_entry', farmerCode = '') {
  // Try server-side send first (background, no app opening)
  if (isServerAvailable()) {
    const result = await sendWhatsAppMessage(phone, message);
    await logMessage(farmerCode, 'whatsapp_server', messageType);
    return { ...result, method: 'server' };
  }

  // Fallback: open wa.me deep link (requires user to tap Send)
  const url = composeWhatsAppUrl(phone, message);
  window.open(url, '_blank');
  await logMessage(farmerCode, 'whatsapp_deeplink', messageType);
  return { success: true, method: 'deeplink', message: 'Opened in WhatsApp app' };
}

/**
 * Open SMS app with a pre-composed message.
 * @param {string} phone - Farmer's mobile number
 * @param {string} message - The formatted message
 * @param {string} [messageType='milk_entry'] - For logging
 * @param {string} [farmerCode] - For logging
 */
export async function sendViaSms(phone, message, messageType = 'milk_entry', farmerCode = '') {
  const url = composeSmsUrl(phone, message);
  window.open(url, '_blank');
  await logMessage(farmerCode, 'sms', messageType);
}

// ─── Message Logging ─────────────────────────────────────────────────

/**
 * Log a sent message to IndexedDB for tracking.
 */
async function logMessage(farmerCode, channel, messageType) {
  try {
    await db.messageLog.add({
      farmerCode,
      channel,
      messageType,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Non-critical — don't break the flow if logging fails
  }
}

/**
 * Get the message log history.
 * @param {number} [limit=50]
 * @returns {Promise<Array>}
 */
export async function getMessageLog(limit = 50) {
  return db.messageLog.orderBy('timestamp').reverse().limit(limit).toArray();
}
