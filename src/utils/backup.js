/**
 * Backup & Restore Utilities for Smart Dairy
 *
 * Exports the entire IndexedDB database as a single JSON file.
 * Imports a JSON backup file to restore all tables.
 * Manages auto-backup scheduling (every 5 hours).
 */
import db from '../db';
import { timestampForFilename, formatBytes } from './formatters';

const BACKUP_VERSION = 1;
const TABLE_NAMES = [
  'dairyConfig',
  'farmers',
  'rateCharts',
  'purchases',
  'dispatches',
  'storeSales',
  'payments',
  'deductions',
  'backups',
];

/**
 * Export the full database to a JSON blob and trigger a download.
 * @param {boolean} [isAuto=false] — Whether this is an automatic backup
 * @returns {Promise<void>}
 */
export async function exportBackup(isAuto = false) {
  const data = { version: BACKUP_VERSION, timestamp: new Date().toISOString(), tables: {} };

  for (const tableName of TABLE_NAMES) {
    data.tables[tableName] = await db[tableName].toArray();
  }

  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const sizeBytes = blob.size;

  // Trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `smart-dairy-backup-${timestampForFilename()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Log the backup
  await db.backups.add({
    timestamp: new Date().toISOString(),
    sizeBytes,
    fileName: a.download,
    auto: isAuto,
  });

  // Update last backup time
  await db.dairyConfig.update(1, { lastBackupTime: new Date().toISOString() });
}

/**
 * Import a backup JSON file and restore all tables.
 * This REPLACES all existing data.
 * @param {File} file — The .json backup file
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function importBackup(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate structure
    if (!data.version || !data.tables) {
      return { success: false, error: 'Invalid backup file format.' };
    }

    // Clear all tables and restore from backup
    await db.transaction('rw', TABLE_NAMES.map((n) => db[n]), async () => {
      for (const tableName of TABLE_NAMES) {
        await db[tableName].clear();
        if (data.tables[tableName] && Array.isArray(data.tables[tableName])) {
          await db[tableName].bulkAdd(data.tables[tableName]);
        }
      }
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to import backup.' };
  }
}

/**
 * Check if an auto-backup is due (every 5 hours).
 * Call this on app mount and on a periodic interval.
 * @returns {Promise<boolean>} — true if backup was triggered
 */
export async function checkAutoBackup() {
  const config = await db.dairyConfig.get(1);
  if (!config) return false;

  const intervalMs = (config.backupIntervalHrs || 5) * 60 * 60 * 1000;
  const lastBackup = config.lastBackupTime ? new Date(config.lastBackupTime).getTime() : 0;
  const now = Date.now();

  if (now - lastBackup >= intervalMs) {
    await exportBackup(true);
    return true;
  }
  return false;
}

/**
 * Get the backup history (last 20 entries, most recent first).
 * @returns {Promise<Array>}
 */
export async function getBackupHistory() {
  return db.backups.orderBy('timestamp').reverse().limit(20).toArray();
}
