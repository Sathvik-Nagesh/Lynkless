const bcrypt = require("bcryptjs");
const crypto = require("crypto");

// In-memory room storage
const rooms = new Map();

// Room auto-expiry time (1 hour)
const ROOM_EXPIRY_MS = 60 * 60 * 1000;
const MAX_USERS_PER_ROOM = 10;

/**
 * Generate a 6-digit room code
 */
function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

/**
 * Create a new room
 * @param {string|null} password - Optional password for the room
 * @param {string} creatorId - ID of the room creator
 * @param {string} creatorIp - IP address of the creator
 * @returns {object} Room data
 */
async function createRoom(password = null, creatorId, creatorIp) {
  let code;
  // Ensure unique code
  do {
    code = generateRoomCode();
  } while (rooms.has(code));

  const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

  const room = {
    code,
    hasPassword: !!password,
    passwordHash: hashedPassword,
    users: new Map(),
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };

  // Add creator to the room
  room.users.set(creatorId, {
    id: creatorId,
    ip: creatorIp,
    joinedAt: Date.now(),
    isCreator: true,
  });

  rooms.set(code, room);

  // Set up auto-expiry
  scheduleRoomCleanup(code);

  return {
    code,
    hasPassword: room.hasPassword,
    userCount: room.users.size,
  };
}

/**
 * Join an existing room
 * @param {string} code - Room code
 * @param {string|null} password - Password if room is protected
 * @param {string} userId - ID of the joining user
 * @param {string} userIp - IP address of the user
 * @returns {object|null} Room data or null if failed
 */
async function joinRoom(code, password, userId, userIp) {
  if (!code || typeof code !== "string") {
    return { error: "INVALID_ROOM_CODE" };
  }

  const room = rooms.get(code.toUpperCase());

  if (!room) {
    return { error: "ROOM_NOT_FOUND" };
  }

  // Verify password if room is protected
  if (room.hasPassword) {
    if (!password) {
      return { error: "PASSWORD_REQUIRED" };
    }
    const isValid = await bcrypt.compare(password, room.passwordHash);
    if (!isValid) {
      return { error: "INVALID_PASSWORD" };
    }
  }

  if (room.users.size >= MAX_USERS_PER_ROOM && !room.users.has(userId)) {
    return { error: "ROOM_FULL" };
  }

  // Add user to room
  room.users.set(userId, {
    id: userId,
    ip: userIp,
    joinedAt: Date.now(),
    isCreator: false,
  });

  room.lastActivity = Date.now();

  // Get list of other users with their "nearby" status
  const otherUsers = [];
  room.users.forEach((user, id) => {
    if (id !== userId) {
      otherUsers.push({
        id: user.id,
        isNearby: user.ip === userIp,
        isCreator: user.isCreator,
      });
    }
  });

  return {
    code: room.code,
    hasPassword: room.hasPassword,
    users: otherUsers,
  };
}

/**
 * Get a room by code
 */
function getRoom(code) {
  return rooms.get(code.toUpperCase());
}

/**
 * Remove a user from a room
 * @param {string} code - Room code
 * @param {string} userId - User ID to remove
 * @returns {boolean} True if room was deleted (empty)
 */
function leaveRoom(code, userId) {
  const room = rooms.get(code.toUpperCase());

  if (!room) return false;

  room.users.delete(userId);
  room.lastActivity = Date.now();

  // Delete room if empty
  if (room.users.size === 0) {
    rooms.delete(code.toUpperCase());
    return true;
  }

  return false;
}

/**
 * Get all users in a room
 */
function getRoomUsers(code, requesterId, requesterIp) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return [];

  const users = [];
  room.users.forEach((user, id) => {
    users.push({
      id: user.id,
      isNearby: user.ip === requesterIp,
      isCreator: user.isCreator,
      isSelf: id === requesterId,
    });
  });

  return users;
}

/**
 * Check if user is in a room
 */
function isUserInRoom(code, userId) {
  const room = rooms.get(code.toUpperCase());
  return room ? room.users.has(userId) : false;
}

/**
 * Schedule room cleanup after expiry
 */
function scheduleRoomCleanup(code) {
  setTimeout(() => {
    const room = rooms.get(code);
    if (room && Date.now() - room.lastActivity >= ROOM_EXPIRY_MS) {
      rooms.delete(code);
      console.log(`Room ${code} expired and was deleted`);
    }
  }, ROOM_EXPIRY_MS);
}

/**
 * Clean up all expired rooms (run periodically)
 */
function cleanupExpiredRooms() {
  const now = Date.now();
  rooms.forEach((room, code) => {
    if (now - room.lastActivity >= ROOM_EXPIRY_MS) {
      rooms.delete(code);
      console.log(`Room ${code} cleaned up due to inactivity`);
    }
  });
}

// Run cleanup every 10 minutes
setInterval(cleanupExpiredRooms, 10 * 60 * 1000);

module.exports = {
  createRoom,
  joinRoom,
  getRoom,
  leaveRoom,
  getRoomUsers,
  isUserInRoom,
  generateRoomCode,
};
