const rooms = require('./rooms');

// Map to track which room each client is in
const clientRooms = new Map();
// Map to track all connected clients by their ID
const clients = new Map();
// Presence registry for nearby discovery (grouped by IP)
const presenceByIp = new Map();
// Map to track pending connection requests
const pendingRequests = new Map();

/**
 * Normalize IP address for consistent comparison
 */
function normalizeIp(ip) {
  if (!ip) return '0.0.0.0';

  // Handle IPv6 localhost variants
  if (ip === '::1' || ip === '::ffff:127.0.0.1' || ip === '127.0.0.1') {
    return '127.0.0.1';
  }

  // Extract IPv4 from IPv6-mapped address (e.g., ::ffff:192.168.1.1 -> 192.168.1.1)
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }

  return ip;
}

/**
 * Extract client IP address from request
 */
function getClientIp(req) {
  // Check for forwarded IP (when behind proxy/load balancer)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return normalizeIp(forwarded.split(',')[0].trim());
  }
  // Fall back to direct connection IP
  return normalizeIp(req.socket.remoteAddress);
}

/**
 * Extract subnet from IP address (first 3 octets for IPv4)
 */
function getSubnet(ip) {
  // Handle IPv6 localhost
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    return 'localhost';
  }

  // Extract IPv4 from IPv6-mapped address
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  // Get first 3 octets for /24 subnet
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }

  // Fallback to full IP
  return ip;
}

/**
 * Add client to presence registry by subnet
 */
function addToPresence(clientId, clientIp) {
  const subnet = getSubnet(clientIp);
  if (!presenceByIp.has(subnet)) {
    presenceByIp.set(subnet, new Set());
  }
  presenceByIp.get(subnet).add(clientId);
}

/**
 * Remove client from presence registry
 */
function removeFromPresence(clientId, clientIp) {
  const subnet = getSubnet(clientIp);
  const ipClients = presenceByIp.get(subnet);
  if (ipClients) {
    ipClients.delete(clientId);
    if (ipClients.size === 0) {
      presenceByIp.delete(subnet);
    }
  }
}

/**
 * Get nearby peers (same subnet, excluding self)
 */
function getNearbyPeers(clientId, clientIp) {
  const subnet = getSubnet(clientIp);
  const ipClients = presenceByIp.get(subnet);
  if (!ipClients) return [];

  const nearby = [];
  ipClients.forEach((id) => {
    if (id !== clientId) {
      nearby.push({
        id,
        isNearby: true,
        isLocal: true,
      });
    }
  });
  return nearby;
}

/**
 * Broadcast nearby peers update to all clients in same subnet
 */
function broadcastNearbyUpdate(clientIp, excludeClientId = null) {
  const subnet = getSubnet(clientIp);
  const ipClients = presenceByIp.get(subnet);
  if (!ipClients) return;

  ipClients.forEach((id) => {
    if (id !== excludeClientId) {
      const ws = clients.get(id);
      if (ws) {
        const nearbyPeers = getNearbyPeers(id, clientIp);
        sendToClient(ws, {
          type: 'nearby-peers',
          peers: nearbyPeers,
        });
      }
    }
  });
}

/**
 * Initialize WebSocket handlers
 * @param {WebSocketServer} wss - WebSocket server instance
 */
function initializeHandlers(wss) {
  wss.on('connection', (ws, req) => {
    const clientIp = getClientIp(req);
    
    // Parse persistent ID if provided by frontend
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let clientId = url.searchParams.get('id');
    
    // Validate format (prevent injection/weird characters)
    if (!clientId || !/^client_[a-zA-Z0-9_-]{5,50}$/.test(clientId)) {
      clientId = generateClientId();
    }
    
    // If somehow an exact collision happens and they are still connected, generate a new one
    if (clients.has(clientId)) {
      const existingWs = clients.get(clientId);
      if (existingWs.readyState === 1) { // 1 = OPEN
        clientId = generateClientId();
      }
    }

    // Store client reference
    ws.clientId = clientId;
    ws.clientIp = clientIp;
    clients.set(clientId, ws);

    // Add to presence registry
    addToPresence(clientId, clientIp);

    console.log(`Client connected: ${clientId} from ${clientIp}`);

    // Send client their ID and initial nearby peers
    const nearbyPeers = getNearbyPeers(clientId, clientIp);
    sendToClient(ws, {
      type: 'connected',
      clientId,
      nearbyPeers,
    });

    // Notify other nearby clients about new peer
    broadcastNearbyUpdate(clientIp, clientId);

    // Handle incoming messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await handleMessage(ws, message);
      } catch (error) {
        console.error('Failed to parse message:', error);
        sendToClient(ws, {
          type: 'error',
          message: 'Invalid message format',
        });
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      handleDisconnect(ws);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`Client ${clientId} error:`, error);
      handleDisconnect(ws);
    });

    // Heartbeat to keep connection alive
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
  });

  // Heartbeat interval
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });
}

/**
 * Generate unique client ID
 */
function generateClientId() {
  return 'client_' + Math.random().toString(36).substring(2, 15);
}

/**
 * Send message to a specific client
 */
function sendToClient(ws, data) {
  if (ws.readyState === 1) { // WebSocket.OPEN
    ws.send(JSON.stringify(data));
  }
}

/**
 * Handle incoming WebSocket messages
 */
async function handleMessage(ws, message) {
  const { type, ...payload } = message;

  switch (type) {
    case 'create-room':
      await handleCreateRoom(ws, payload);
      break;

    case 'join-room':
      await handleJoinRoom(ws, payload);
      break;

    case 'leave-room':
      handleLeaveRoom(ws);
      break;

    // Connection approval flow
    case 'connection-request':
      handleConnectionRequest(ws, payload);
      break;

    case 'connection-accepted':
      handleConnectionAccepted(ws, payload);
      break;

    case 'connection-rejected':
      handleConnectionRejected(ws, payload);
      break;

    case 'offer':
      handleOffer(ws, payload);
      break;

    case 'answer':
      handleAnswer(ws, payload);
      break;

    case 'ice-candidate':
      handleIceCandidate(ws, payload);
      break;

    case 'chat':
      handleChat(ws, payload);
      break;

    case 'get-users':
      handleGetUsers(ws);
      break;

    case 'get-nearby':
      handleGetNearby(ws);
      break;

    default:
      sendToClient(ws, {
        type: 'error',
        message: `Unknown message type: ${type}`,
      });
  }
}

/**
 * Handle connection request (peer approval)
 */
function handleConnectionRequest(ws, { targetId }) {
  if (ws.clientId === targetId) {
    sendToClient(ws, {
      type: 'connection-request-failed',
      targetId,
      reason: 'Cannot connect to yourself',
    });
    return;
  }
  const targetWs = clients.get(targetId);

  if (!targetWs) {
    sendToClient(ws, {
      type: 'connection-request-failed',
      targetId,
      reason: 'Peer not found',
    });
    return;
  }

  // Store pending request
  const requestId = `${ws.clientId}->${targetId}`;
  pendingRequests.set(requestId, {
    fromId: ws.clientId,
    toId: targetId,
    timestamp: Date.now(),
  });

  // Notify sender that request was sent
  sendToClient(ws, {
    type: 'connection-request-sent',
    targetId,
  });

  // Notify target about incoming request
  sendToClient(targetWs, {
    type: 'connection-request',
    fromId: ws.clientId,
    isNearby: ws.clientIp === targetWs.clientIp,
  });

  console.log(`Connection request: ${ws.clientId} -> ${targetId}`);
}

/**
 * Handle connection accepted
 */
function handleConnectionAccepted(ws, { targetId }) {
  const requesterWs = clients.get(targetId);
  const requestId = `${targetId}->${ws.clientId}`;

  // Remove from pending requests
  pendingRequests.delete(requestId);

  if (!requesterWs) {
    sendToClient(ws, {
      type: 'error',
      message: 'Requester no longer available',
    });
    return;
  }

  // Notify requester that connection was accepted
  sendToClient(requesterWs, {
    type: 'connection-accepted',
    fromId: ws.clientId,
    isNearby: ws.clientIp === requesterWs.clientIp,
  });

  console.log(`Connection accepted: ${ws.clientId} accepted ${targetId}`);
}

/**
 * Handle connection rejected
 */
function handleConnectionRejected(ws, { targetId }) {
  const requesterWs = clients.get(targetId);
  const requestId = `${targetId}->${ws.clientId}`;

  // Remove from pending requests
  pendingRequests.delete(requestId);

  if (!requesterWs) {
    return; // Requester already gone
  }

  // Notify requester that connection was rejected
  sendToClient(requesterWs, {
    type: 'connection-rejected',
    fromId: ws.clientId,
  });

  console.log(`Connection rejected: ${ws.clientId} rejected ${targetId}`);
}

/**
 * Handle get nearby peers request
 */
function handleGetNearby(ws) {
  const nearbyPeers = getNearbyPeers(ws.clientId, ws.clientIp);
  sendToClient(ws, {
    type: 'nearby-peers',
    peers: nearbyPeers,
  });
}

/**
 * Handle room creation
 */
async function handleCreateRoom(ws, { password }) {
  try {
    // Leave existing room if any
    if (clientRooms.has(ws.clientId)) {
      handleLeaveRoom(ws);
    }

    const result = await rooms.createRoom(password, ws.clientId, ws.clientIp);
    clientRooms.set(ws.clientId, result.code);

    sendToClient(ws, {
      type: 'room-created',
      code: result.code,
      hasPassword: result.hasPassword,
    });

    console.log(`Room ${result.code} created by ${ws.clientId}`);
  } catch (error) {
    console.error('Failed to create room:', error);
    sendToClient(ws, {
      type: 'error',
      message: 'Failed to create room',
    });
  }
}

/**
 * Handle room joining
 */
async function handleJoinRoom(ws, { code, password }) {
  try {
    // Leave existing room if any
    if (clientRooms.has(ws.clientId)) {
      handleLeaveRoom(ws);
    }

    const result = await rooms.joinRoom(code, password, ws.clientId, ws.clientIp);

    if (result.error) {
      sendToClient(ws, {
        type: 'join-error',
        error: result.error,
      });
      return;
    }

    clientRooms.set(ws.clientId, result.code);

    // Notify the joining user
    sendToClient(ws, {
      type: 'room-joined',
      code: result.code,
      users: result.users,
    });

    // Notify existing users about the new user
    const room = rooms.getRoom(result.code);
    if (room) {
      room.users.forEach((user, id) => {
        if (id !== ws.clientId) {
          const peerWs = clients.get(id);
          if (peerWs) {
            sendToClient(peerWs, {
              type: 'user-joined',
              userId: ws.clientId,
              isNearby: user.ip === ws.clientIp,
            });
          }
        }
      });
    }

    console.log(`Client ${ws.clientId} joined room ${result.code}`);
  } catch (error) {
    console.error('Failed to join room:', error);
    sendToClient(ws, {
      type: 'error',
      message: 'Failed to join room',
    });
  }
}

/**
 * Handle leaving a room
 */
function handleLeaveRoom(ws) {
  const roomCode = clientRooms.get(ws.clientId);
  if (!roomCode) return;

  // Notify other users before leaving
  const room = rooms.getRoom(roomCode);
  if (room) {
    room.users.forEach((user, id) => {
      if (id !== ws.clientId) {
        const peerWs = clients.get(id);
        if (peerWs) {
          sendToClient(peerWs, {
            type: 'user-left',
            userId: ws.clientId,
          });
        }
      }
    });
  }

  const roomDeleted = rooms.leaveRoom(roomCode, ws.clientId);
  clientRooms.delete(ws.clientId);

  sendToClient(ws, {
    type: 'left-room',
    code: roomCode,
  });

  console.log(`Client ${ws.clientId} left room ${roomCode}${roomDeleted ? ' (room deleted)' : ''}`);
}

/**
 * Handle WebRTC offer forwarding
 */
function handleOffer(ws, { targetId, offer }) {
  const targetWs = clients.get(targetId);
  if (targetWs) {
    sendToClient(targetWs, {
      type: 'offer',
      fromId: ws.clientId,
      offer,
      isNearby: ws.clientIp === targetWs.clientIp,
    });
  } else {
    sendToClient(ws, {
      type: 'error',
      message: 'Target user not found',
    });
  }
}

/**
 * Handle WebRTC answer forwarding
 */
function handleAnswer(ws, { targetId, answer }) {
  const targetWs = clients.get(targetId);
  if (targetWs) {
    sendToClient(targetWs, {
      type: 'answer',
      fromId: ws.clientId,
      answer,
    });
  } else {
    sendToClient(ws, {
      type: 'error',
      message: 'Target user not found',
    });
  }
}

/**
 * Handle ICE candidate forwarding
 */
function handleIceCandidate(ws, { targetId, candidate }) {
  const targetWs = clients.get(targetId);
  if (targetWs) {
    sendToClient(targetWs, {
      type: 'ice-candidate',
      fromId: ws.clientId,
      candidate,
    });
  }
}

/**
 * Handle chat message broadcast to room
 */
function handleChat(ws, { message }) {
  const roomCode = clientRooms.get(ws.clientId);
  if (!roomCode) {
    sendToClient(ws, {
      type: 'error',
      message: 'Not in a room',
    });
    return;
  }

  const room = rooms.getRoom(roomCode);
  if (room) {
    room.users.forEach((user, id) => {
      if (id !== ws.clientId) {
        const peerWs = clients.get(id);
        if (peerWs) {
          sendToClient(peerWs, {
            type: 'chat',
            fromId: ws.clientId,
            message,
            timestamp: Date.now(),
          });
        }
      }
    });
  }
}

/**
 * Handle get users request
 */
function handleGetUsers(ws) {
  const roomCode = clientRooms.get(ws.clientId);
  if (!roomCode) {
    sendToClient(ws, {
      type: 'error',
      message: 'Not in a room',
    });
    return;
  }

  const users = rooms.getRoomUsers(roomCode, ws.clientId, ws.clientIp);
  sendToClient(ws, {
    type: 'users-list',
    users,
  });
}

/**
 * Handle client disconnect
 */
function handleDisconnect(ws) {
  console.log(`Client disconnected: ${ws.clientId}`);

  // Clean up pending requests involving this client
  pendingRequests.forEach((request, requestId) => {
    if (request.fromId === ws.clientId || request.toId === ws.clientId) {
      pendingRequests.delete(requestId);

      // Notify the other party
      const otherId = request.fromId === ws.clientId ? request.toId : request.fromId;
      const otherWs = clients.get(otherId);
      if (otherWs) {
        sendToClient(otherWs, {
          type: 'peer-disconnected',
          peerId: ws.clientId,
        });
      }
    }
  });

  // Leave any room the client was in
  if (clientRooms.has(ws.clientId)) {
    handleLeaveRoom(ws);
  }

  // Remove from presence registry and notify nearby
  removeFromPresence(ws.clientId, ws.clientIp);
  broadcastNearbyUpdate(ws.clientIp);

  // Remove client from clients map
  clients.delete(ws.clientId);
}

// Clean up stale pending requests periodically (older than 60 seconds)
setInterval(() => {
  const now = Date.now();
  pendingRequests.forEach((request, requestId) => {
    if (now - request.timestamp > 60000) {
      pendingRequests.delete(requestId);
    }
  });
}, 30000);

module.exports = {
  initializeHandlers,
  getClientIp,
};
