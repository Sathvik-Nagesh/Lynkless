const http = require('http');
const { WebSocketServer } = require('ws');
const { initializeHandlers } = require('./websocketHandlers');

// Configuration
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

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
  // Verify origin for security (allow all in development)
  verifyClient: (info) => {
    // In production, you might want to validate origin
    return true;
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
