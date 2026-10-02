/**
 * Cute Indian Dessert Name Generator
 * Generates fun, random combinations of Indian sweet names for peer identification
 */

const SWEETS = [
  // Traditional Indian Sweets
  'Gulab', 'Jamun', 'Rasgulla', 'Jalebi', 'Barfi', 'Ladoo',
  'Peda', 'Kheer', 'Halwa', 'Mysore', 'Sandesh', 'Kalakand',
  'Patties', 'Kaju', 'Soan', 'Papdi', 'Chikki', 'Modak',
  
  // Fusion/Fun
  'Kulfi', 'Falooda', 'Shrikhand', 'Basundi', 'Phirni',
  'Malpua', 'Imarti', 'Balushahi', 'Gujiya', 'Chandrakala'
];

const ADJECTIVES = [
  'Sweet', 'Crispy', 'Soft', 'Sticky', 'Golden', 'Silver',
  'Royal', 'Spicy', 'Nutty', 'Creamy', 'Fluffy', 'Crunchy',
  'Sugary', 'Honeyed', 'Glazed', 'Frosted', 'Sprinkled',
  'Topped', 'Layered', 'Filled', 'Wrapped', 'Dusted'
];

const COLORS = [
  'Pink', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple',
  'Brown', 'White', 'Red', 'Saffron', 'Rose', 'Pistachio'
];

/**
 * Generate a cute random name for a peer
 * Format: ColorSweetAdjective or AdjectiveColorSweet
 * Examples: "PinkGulabCrispy", "SoftOrangeJalebi"
 */
export function generateCuteName(peerId: string): string {
  // Use peerId as seed for consistent naming
  const seed = hashCode(peerId);
  
  const sweet = SWEETS[Math.abs(seed) % SWEETS.length];
  const adjective = ADJECTIVES[Math.abs(seed >> 4) % ADJECTIVES.length];
  const color = COLORS[Math.abs(seed >> 8) % COLORS.length];
  
  // Randomly choose format
  const format = Math.abs(seed >> 12) % 2;
  
  if (format === 0) {
    return `${color}${sweet}${adjective}`;
  } else {
    return `${adjective}${color}${sweet}`;
  }
}

/**
 * Internal cache for peer emojis to avoid redundant hash calculations
 */
const emojiCache = new Map<string, string>();

/**
 * Internal cache for short display names to avoid redundant string allocations and regex execution
 */
const shortNameCache = new Map<string, string>();

/**
 * Get emoji for a peer based on their name
 */
export function getEmojiForPeer(name: string): string {
  if (emojiCache.has(name)) {
    return emojiCache.get(name)!;
  }

  const emojis = ['🍬', '🍭', '🧁', '🍰', '🎂', '🍮', '🍩', '🍪', '🥮', '🍡', '🧇', '🥞'];
  const hash = hashCode(name);
  const emoji = emojis[Math.abs(hash) % emojis.length];

  emojiCache.set(name, emoji);
  return emoji;
}

/**
 * Simple string hash function for consistent random generation
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Get short display name (first letter of each word + emoji)
 * Example: "PinkGulabCrispy" -> "PGC 🍬"
 * Optimized with Map caching and allocation-free char code matching for uppercase letters.
 */
export function getShortDisplayName(fullName: string): string {
  if (shortNameCache.has(fullName)) {
    return shortNameCache.get(fullName)!;
  }

  const emoji = getEmojiForPeer(fullName);

  // Fast extraction of uppercase initials without regex match() or array allocation
  let initials = '';
  for (let i = 0; i < fullName.length; i++) {
    const code = fullName.charCodeAt(i);
    if (code >= 65 && code <= 90) { // A-Z
      initials += fullName[i];
    }
  }

  const result = `${initials} ${emoji}`;
  shortNameCache.set(fullName, result);
  return result;
}

/**
 * Store mapping of peerId to cute name
 */
const nameCache = new Map<string, string>();

/**
 * Get or generate cute name for a peer
 */
export function getPeerName(peerId: string): string {
  if (!nameCache.has(peerId)) {
    nameCache.set(peerId, generateCuteName(peerId));
  }
  return nameCache.get(peerId)!;
}

/**
 * Clear name cache
 */
export function clearNameCache(): void {
  nameCache.clear();
  emojiCache.clear();
  shortNameCache.clear();
}
