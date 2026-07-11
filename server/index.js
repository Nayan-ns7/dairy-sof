/**
 * Smart Dairy — Local Server
 *
 * An Express HTTP server that:
 *   1. Serves the built React app (dist/) as static files
 *   2. Provides REST API endpoints for WhatsApp operations
 *   3. Pushes real-time WhatsApp status/QR updates via Socket.io
 *   4. Auto-opens Chrome on startup
 *
 * This is the "n8n-like" heart of Smart Dairy. Users double-click
 * a shortcut → this server starts → Chrome opens → dairy software ready.
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';
import whatsapp, { WA_STATE } from './whatsapp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Configuration ───────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3000', 10);
const DIST_DIR = path.join(__dirname, '..', 'dist');
const HOST = 'localhost';

// ─── Express App Setup ──────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);

// Socket.io for real-time WhatsApp status push
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// ─── API Routes ─────────────────────────────────────────────────────

/**
 * GET /api/whatsapp/status
 * Returns the current WhatsApp connection state.
 */
app.get('/api/whatsapp/status', (req, res) => {
  res.json(whatsapp.getStatus());
});

/**
 * POST /api/whatsapp/connect
 * Initiates a WhatsApp connection (triggers QR code generation).
 */
app.post('/api/whatsapp/connect', async (req, res) => {
  try {
    const result = await whatsapp.connect();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/whatsapp/disconnect
 * Disconnects WhatsApp and clears the session (will need re-scan).
 */
app.post('/api/whatsapp/disconnect', async (req, res) => {
  try {
    const result = await whatsapp.disconnect();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/whatsapp/send
 * Send a WhatsApp message to a phone number.
 * Body: { phone: "9876543210", message: "Hello farmer!" }
 */
app.post('/api/whatsapp/send', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ success: false, message: 'phone and message are required' });
  }

  try {
    const result = await whatsapp.sendMessage(phone, message);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/health
 * Simple health check endpoint.
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    whatsapp: whatsapp.state,
  });
});

// ─── Static File Serving (React App) ────────────────────────────────

// Serve the built Vite app
app.use(express.static(DIST_DIR));

// SPA fallback: all non-API routes serve index.html
app.get('*', (req, res) => {
  const indexPath = path.join(DIST_DIR, 'index.html');
  res.sendFile(indexPath);
});

// ─── Socket.io: Real-time WhatsApp Events ───────────────────────────

io.on('connection', (socket) => {
  // Send current status immediately on connect
  socket.emit('whatsapp:status', whatsapp.getStatus());

  socket.on('disconnect', () => {
    // Client disconnected — no cleanup needed
  });
});

// Forward WhatsApp events to all connected Socket.io clients
whatsapp.on('qr', (qrDataUrl) => {
  io.emit('whatsapp:qr', { qrDataUrl });
});

whatsapp.on('connected', (data) => {
  io.emit('whatsapp:connected', data);
  io.emit('whatsapp:status', whatsapp.getStatus());
});

whatsapp.on('disconnected', (data) => {
  io.emit('whatsapp:disconnected', data);
  io.emit('whatsapp:status', whatsapp.getStatus());
});

whatsapp.on('stateChange', (data) => {
  io.emit('whatsapp:stateChange', data);
  io.emit('whatsapp:status', whatsapp.getStatus());
});

// ─── Server Startup ─────────────────────────────────────────────────

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error('  ╔══════════════════════════════════════════╗');
    console.error('  ║  [ERROR] Port 3000 is already in use!    ║');
    console.error('  ╠══════════════════════════════════════════╣');
    console.error('  ║  Please close any other running          ║');
    console.error('  ║  instances of Smart Dairy and retry.     ║');
    console.error('  ╚══════════════════════════════════════════╝');
    console.error('');
    process.exit(1);
  } else {
    console.error(`\n  [ERROR] Server startup failed: ${err.message}\n`);
    process.exit(1);
  }
});

httpServer.listen(PORT, HOST, async () => {
  const url = `http://${HOST}:${PORT}`;
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║          🥛 Smart Dairy Server           ║');
  console.log('  ╠══════════════════════════════════════════╣');
  console.log(`  ║  Local:   ${url.padEnd(30)} ║`);
  console.log(`  ║  Status:  Running                        ║`);
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log('  Press Ctrl+C to stop the server.');
  console.log('');

  // Auto-open Chrome with the app
  try {
    await open(url, { app: { name: 'chrome' } });
  } catch {
    // Chrome not found — try default browser
    try {
      await open(url);
    } catch {
      console.log(`  Could not auto-open browser. Please open: ${url}`);
    }
  }

  // Auto-connect WhatsApp if session exists
  const authInfoPath = path.join(__dirname, 'auth_info', 'creds.json');
  const hasSession = await import('fs').then(fs => fs.existsSync(authInfoPath)).catch(() => false);
  if (hasSession) {
    console.log('  [WhatsApp] Found existing session. Auto-connecting...');
    whatsapp.connect().catch(err => {
      console.error('  [WhatsApp] Auto-connect failed:', err.message);
    });
  }
});

// ─── Graceful Shutdown ──────────────────────────────────────────────

async function shutdown() {
  console.log('\n  Shutting down Smart Dairy Server...');

  if (whatsapp.state === WA_STATE.CONNECTED && whatsapp.sock) {
    try {
      whatsapp.sock.end(undefined);
    } catch {
      // Ignore
    }
  }

  httpServer.close(() => {
    console.log('  Server stopped. Goodbye! 🥛');
    process.exit(0);
  });

  // Force exit after 5s if graceful shutdown fails
  setTimeout(() => process.exit(0), 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
