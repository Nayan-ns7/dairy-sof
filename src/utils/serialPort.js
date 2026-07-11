/**
 * Smart Dairy — Web Serial API Hardware Integration
 *
 * Provides browser-native COM port connectivity for:
 *  - Weighing scales (weight data)
 *  - Milk analyzers (FAT, SNF, CLR readings)
 *
 * Falls back gracefully when Web Serial API is not available.
 * Zero external dependencies.
 */

// ─── Feature Detection ──────────────────────────────────────────────

/**
 * Check if the Web Serial API is available in this browser.
 * @returns {boolean}
 */
export function isSerialSupported() {
  return 'serial' in navigator;
}

// ─── Connection Management ──────────────────────────────────────────

/**
 * Connect to a serial device (scale or analyzer).
 * Requires a user gesture (button click) to trigger the port picker.
 *
 * @param {Object} options
 * @param {number} [options.baudRate=9600] - Serial baud rate
 * @param {function} options.onData - Callback receiving parsed data chunks
 * @param {function} [options.onError] - Callback for errors
 * @param {function} [options.onDisconnect] - Callback when port disconnects
 * @returns {Promise<SerialController>} Controller object with disconnect()
 */
export async function connectDevice({ baudRate = 9600, onData, onError, onDisconnect }) {
  if (!isSerialSupported()) {
    throw new Error('Web Serial API is not supported in this browser. Use Chrome or Edge.');
  }

  // Prompt user to select a COM port
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate });

  let isReading = true;
  let reader = null;
  let buffer = '';

  // Start reading in a background loop
  const readLoop = async () => {
    try {
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      reader = textDecoder.readable.getReader();

      while (isReading) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          // Process complete lines (delimited by \r\n or \n)
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || ''; // Keep incomplete last line in buffer
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              onData(trimmed);
            }
          }
        }
      }

      reader.releaseLock();
      await readableStreamClosed.catch(() => { /* port closed */ });
    } catch (err) {
      if (isReading && onError) {
        onError(err);
      }
    }
  };

  readLoop();

  // Handle unexpected disconnection
  const handleDisconnect = (event) => {
    if (event.target === port) {
      isReading = false;
      if (onDisconnect) onDisconnect();
      navigator.serial.removeEventListener('disconnect', handleDisconnect);
    }
  };
  navigator.serial.addEventListener('disconnect', handleDisconnect);

  // Return a controller to manage the connection
  return {
    port,
    disconnect: async () => {
      isReading = false;
      try {
        if (reader) reader.cancel();
      } catch { /* ignore */ }
      try {
        await port.close();
      } catch { /* ignore */ }
      navigator.serial.removeEventListener('disconnect', handleDisconnect);
    },
  };
}

// ─── Data Parsers ────────────────────────────────────────────────────

/**
 * Common data formats from Indian dairy AMCU machines:
 *
 * Weighing scales:
 *   "WT: 12.50 KG"     → { weight: 12.5 }
 *   "12.50"             → { weight: 12.5 }
 *   "W=12.50"           → { weight: 12.5 }
 *   "+012.50 KG"        → { weight: 12.5 }
 *
 * Milk analyzers:
 *   "FAT: 4.50"         → { fat: 4.5 }
 *   "SNF: 8.65"         → { snf: 8.65 }
 *   "CLR: 27"           → { clr: 27 }
 *   "F=4.50 S=8.65"     → { fat: 4.5, snf: 8.65 }
 *   "FAT=4.50,SNF=8.65,CLR=27"  → { fat: 4.5, snf: 8.65, clr: 27 }
 */

/**
 * Parse a raw line from a weighing scale.
 * @param {string} line - Raw serial data line
 * @returns {{ weight: number } | null}
 */
export function parseWeighingData(line) {
  // Try pattern: "WT: 12.50 KG" or "WT=12.50"
  let match = line.match(/WT[:\s=]+([+-]?\d+\.?\d*)/i);
  if (match) return { weight: parseFloat(match[1]) };

  // Try pattern: "W=12.50"
  match = line.match(/W[=:]\s*([+-]?\d+\.?\d*)/i);
  if (match) return { weight: parseFloat(match[1]) };

  // Try pattern: "+012.50 KG" or "12.50 KG"
  match = line.match(/([+-]?\d+\.?\d*)\s*(?:KG|kg|Kg)/);
  if (match) return { weight: parseFloat(match[1]) };

  // Try bare number (for simple scales)
  match = line.match(/^[+-]?(\d+\.?\d*)$/);
  if (match) return { weight: parseFloat(match[1]) };

  return null;
}

/**
 * Parse a raw line from a milk analyzer.
 * @param {string} line - Raw serial data line
 * @returns {{ fat?: number, snf?: number, clr?: number } | null}
 */
export function parseAnalyzerData(line) {
  const result = {};
  let found = false;

  // FAT
  const fatMatch = line.match(/FAT[:\s=]+(\d+\.?\d*)/i) ||
                   line.match(/F[=:]\s*(\d+\.?\d*)/i);
  if (fatMatch) { result.fat = parseFloat(fatMatch[1]); found = true; }

  // SNF
  const snfMatch = line.match(/SNF[:\s=]+(\d+\.?\d*)/i) ||
                   line.match(/S[=:]\s*(\d+\.?\d*)/i);
  if (snfMatch) { result.snf = parseFloat(snfMatch[1]); found = true; }

  // CLR
  const clrMatch = line.match(/CLR[:\s=]+(\d+\.?\d*)/i) ||
                   line.match(/C[=:]\s*(\d+\.?\d*)/i);
  if (clrMatch) { result.clr = parseFloat(clrMatch[1]); found = true; }

  return found ? result : null;
}

/**
 * Parse any serial line — tries both scale and analyzer patterns.
 * @param {string} line
 * @returns {{ weight?: number, fat?: number, snf?: number, clr?: number } | null}
 */
export function parseSerialData(line) {
  const weight = parseWeighingData(line);
  const analyzer = parseAnalyzerData(line);

  if (!weight && !analyzer) return null;
  return { ...(weight || {}), ...(analyzer || {}) };
}
