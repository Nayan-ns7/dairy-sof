import Dexie from 'dexie';

/**
 * Smart Dairy — Offline Database (IndexedDB via Dexie.js)
 *
 * All data lives locally in the browser. No network calls.
 * Tables use auto-increment primary keys (++id) with compound indexes
 * for fast range queries during billing aggregation and purchase lookup.
 */
const db = new Dexie('SmartDairyDB');

db.version(1).stores({
  // Dairy-level configuration (single row, id=1)
  dairyConfig: 'id, language, printerSize, snfMode, backupIntervalHrs, lastBackupTime',

  // Farmer profiles
  farmers: '++id, &code, name, mobile, milkType, isActive',

  // Rate chart definitions (multiple charts allowed)
  rateCharts: '++id, name, milkType, isActive, createdAt',

  // Daily milk purchase entries
  purchases: '++id, date, shift, farmerCode, farmerName, milkType, rateChartId, [date+shift], [farmerCode+date], createdAt',

  // Tanker dispatch records
  dispatches: '++id, date, shift, tankerNo, createdAt',

  // Store sales / cattle feed credit ledger
  storeSales: '++id, date, farmerCode, category, [farmerCode+date], createdAt',

  // Payment records (billing cycle settlements)
  payments: '++id, farmerCode, periodStart, periodEnd, paymentMode, [farmerCode+periodStart], createdAt',

  // Individual deduction line items linked to a payment
  deductions: '++id, paymentId, farmerCode, type, createdAt',

  // Backup history log
  backups: '++id, timestamp, auto',
});

db.version(2).stores({
  // Cattle records
  cattle: '++id, tagNo, name, breed, gender, status, farmerCode',

  // Milking yield tracking per cattle
  milkYields: '++id, date, shift, cattleId, [cattleId+date]',

  // Health log (vaccinations, treatments)
  healthRecords: '++id, date, cattleId, type',

  // Breeding log (insemination, checks)
  breedingRecords: '++id, date, cattleId, type, status',

  // Loans and advances given to farmers
  loans: '++id, farmerCode, date, amount, active, repaymentDeductionRate',

  // Repayments linked to a payment settlement
  repayments: '++id, loanId, paymentId, date, amount',
});

db.version(3).stores({
  // User accounts for offline authentication
  users: '++id, &username, role, isActive',

  // Immutable audit trail for sensitive operations
  auditLog: '++id, userId, username, action, timestamp',

  // Message sending log (WhatsApp/SMS tracking)
  messageLog: '++id, farmerCode, channel, messageType, timestamp',
});

/* ─── Default config seed ─── */

/**
 * Ensure a default dairyConfig row exists on first launch.
 * Also seeds the default admin user account.
 * Called once from App.jsx on mount.
 */
export async function ensureDefaults() {
  const existing = await db.dairyConfig.get(1);
  if (!existing) {
    await db.dairyConfig.put({
      id: 1,
      dairyName: '',
      address: '',
      phone: '',
      registrationNo: '',
      logo: null,
      defaultMilkType: 'cow',       // 'cow' | 'buffalo' | 'mixed'
      snfMode: 'clr',                // 'clr' (lactometer) | 'snf' (direct)
      decimalPrecision: 2,
      shiftMorningStart: '05:00',
      shiftMorningEnd: '12:00',
      shiftEveningStart: '15:00',
      shiftEveningEnd: '22:00',
      language: 'en',                // 'en' | 'hi'
      theme: 'light',                // 'light' | 'dark'
      printerSize: '3inch',          // '2inch' | '3inch' | 'a4'
      autoPrint: false,
      backupIntervalHrs: 5,
      lastBackupTime: null,
      // Hardware configuration for Web Serial API
      scaleBaudRate: 9600,
      analyzerBaudRate: 9600,
      // Quality control thresholds (0 = disabled)
      minFatThreshold: 0,
      minSnfThreshold: 0,
      // Rate bonus/penalty percentage (0 = none)
      rateBonusPercent: 0,
      createdAt: new Date().toISOString(),
    });
  }

  // Seed default admin user (only on first launch)
  const { ensureDefaultAdmin } = await import('./utils/auth.js');
  await ensureDefaultAdmin();
}

export default db;
