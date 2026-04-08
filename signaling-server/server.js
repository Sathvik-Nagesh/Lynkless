const http = require('http');
const { WebSocketServer } = require('ws');
const { initializeHandlers } = require('./websocketHandlers');

// Configuration
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) {
    // Browsers typically send Origin. For non-browser clients only allow in non-production.
    return NODE_ENV !== 'production';
  }

  if (allowedOrigins.length > 0) {
    return allowedOrigins.includes(origin);
  }

  if (NODE_ENV !== 'production') {
    return true;
  }

  return /^https?:\/\/localhost(:\d+)?$/i.test(origin);
}

// Create HTTP server
const server = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    return;
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // Default response
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    name: 'Lynkless Signaling Server',
    version: '1.0.0',
    description: 'WebSocket signaling server for P2P connections',
    websocket: `ws://${req.headers.host}`,
  }));
});

// Create WebSocket server
const wss = new WebSocketServer({ 
  server,
  maxPayload: 256 * 1024, // 256KB signaling payload cap
  // Verify origin for security (allow all in development)
  verifyClient: (info) => {
    return isOriginAllowed(info.origin);
  }
});

// Initialize WebSocket handlers
initializeHandlers(wss);

// Start server
server.listen(PORT, HOST, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 Lynkless Signaling Server                            ║
║                                                           ║
║   HTTP: http://${HOST}:${PORT}                              ║
║   WebSocket: ws://${HOST}:${PORT}                           ║
║                                                           ║
║   Status: Running                                         ║
║   Health: http://${HOST}:${PORT}/health                     ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

  // Self-ping every 10 minutes to prevent Render.com free tier from sleeping
  // Use fetch() (native in Node 18+) so it works with both http:// and https://
  if (NODE_ENV === 'production' && process.env.RENDER_EXTERNAL_URL) {
    const keepAliveUrl = `${process.env.RENDER_EXTERNAL_URL}/health`;
    setInterval(async () => {
      try {
        const res = await fetch(keepAliveUrl);
        console.log(`[KeepAlive] Self-ping status: ${res.status}`);
      } catch (err) {
        console.warn('[KeepAlive] Self-ping failed:', err.message);
      }
    }, 10 * 60 * 1000); // Every 10 minutes
    console.log(`[KeepAlive] Self-ping enabled → ${keepAliveUrl}`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  wss.clients.forEach((client) => {
    client.close();
  });
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  wss.clients.forEach((client) => {
    client.close();
  });
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
