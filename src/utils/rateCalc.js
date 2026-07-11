/**
 * Rate Calculation Utilities for Smart Dairy
 *
 * Standard Indian dairy formula for SNF from Lactometer Reading (CLR):
 *   SNF = (CLR / 4) + (0.21 × FAT) + 0.36
 */

/**
 * Calculate SNF from CLR (Lactometer Reading) and FAT%.
 * @param {number} clr — Corrected Lactometer Reading
 * @param {number} fat — FAT percentage
 * @returns {number} — SNF percentage (rounded to precision)
 */
export function calcSnfFromClr(clr, fat, precision = 2) {
  const snf = clr / 4 + 0.21 * fat + 0.36;
  return Number(snf.toFixed(precision));
}

/**
 * Generate a rate chart matrix.
 *
 * @param {object} params
 * @param {number} params.baseRate — Base rate in ₹/liter
 * @param {number} params.baseFat — Base FAT% (e.g. 6.0)
 * @param {number} params.baseSnf — Base SNF% (e.g. 8.5)
 * @param {number} params.fatRate — Rate change per 0.1% FAT deviation (e.g. 0.50)
 * @param {number} params.snfRate — Rate change per 0.1% SNF deviation (e.g. 0.30)
 * @param {number} [params.fatMin=3.0] — Minimum FAT% in the chart
 * @param {number} [params.fatMax=10.0] — Maximum FAT% in the chart
 * @param {number} [params.snfMin=7.0] — Minimum SNF% in the chart
 * @param {number} [params.snfMax=10.0] — Maximum SNF% in the chart
 * @param {number} [params.step=0.1] — Step increment for FAT/SNF rows/cols
 * @param {number} [params.precision=2] — Decimal precision for rates
 * @returns {{ fatValues: number[], snfValues: number[], matrix: number[][] }}
 */
export function generateRateMatrix({
  baseRate,
  baseFat,
  baseSnf,
  fatRate,
  snfRate,
  fatMin = 3.0,
  fatMax = 10.0,
  snfMin = 7.0,
  snfMax = 10.0,
  step = 0.1,
  precision = 2,
}) {
  const fatValues = [];
  const snfValues = [];

  // Build FAT and SNF axis values
  for (let f = fatMin; f <= fatMax + 0.001; f = Math.round((f + step) * 10) / 10) {
    fatValues.push(Number(f.toFixed(1)));
  }
  for (let s = snfMin; s <= snfMax + 0.001; s = Math.round((s + step) * 10) / 10) {
    snfValues.push(Number(s.toFixed(1)));
  }

  // Build the matrix: rate = baseRate + fatDiff * fatRate + snfDiff * snfRate
  const matrix = fatValues.map((fat) => {
    return snfValues.map((snf) => {
      const fatDiff = Math.round((fat - baseFat) * 10); // number of 0.1% steps
      const snfDiff = Math.round((snf - baseSnf) * 10);
      const rate = baseRate + fatDiff * fatRate + snfDiff * snfRate;
      return Number(Math.max(0, rate).toFixed(precision));
    });
  });

  return { fatValues, snfValues, matrix };
}

/**
 * Look up a rate from a pre-generated matrix.
 *
 * @param {object} chart — The rate chart object from IndexedDB
 * @param {number} fat — Actual FAT% from the milk sample
 * @param {number} snf — Actual SNF% from the milk sample
 * @returns {number} — Rate in ₹/liter (0 if out of range)
 */
export function lookupRate(chart, fat, snf) {
  if (!chart?.matrix) return 0;

  const { fatValues, snfValues, matrix } = chart.matrix;

  // Find the nearest FAT and SNF index (clamp to chart bounds)
  const fatRounded = Number(Math.round(fat * 10) / 10).toFixed(1);
  const snfRounded = Number(Math.round(snf * 10) / 10).toFixed(1);

  let fatIdx = fatValues.findIndex((v) => Number(v).toFixed(1) === fatRounded);
  let snfIdx = snfValues.findIndex((v) => Number(v).toFixed(1) === snfRounded);

  // Clamp to bounds if out of range
  if (fatIdx < 0) {
    fatIdx = fat < fatValues[0] ? 0 : fatValues.length - 1;
  }
  if (snfIdx < 0) {
    snfIdx = snf < snfValues[0] ? 0 : snfValues.length - 1;
  }

  return matrix[fatIdx]?.[snfIdx] ?? 0;
}
