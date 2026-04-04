/**
 * File type icon mapping and utilities
 */

export interface FileInfo {
  icon: string;
  color: string;
  category: string;
}

const FILE_TYPE_MAP: Record<string, FileInfo> = {
  // Documents
  'pdf': { icon: '📄', color: '#ef4444', category: 'document' },
  'doc': { icon: '📝', color: '#3b82f6', category: 'document' },
  'docx': { icon: '📝', color: '#3b82f6', category: 'document' },
  'txt': { icon: '📃', color: '#6b7280', category: 'document' },
  'rtf': { icon: '📃', color: '#6b7280', category: 'document' },
  'odt': { icon: '📃', color: '#6b7280', category: 'document' },
  
  // Spreadsheets
  'xls': { icon: '📊', color: '#10b981', category: 'spreadsheet' },
  'xlsx': { icon: '📊', color: '#10b981', category: 'spreadsheet' },
  'csv': { icon: '📊', color: '#10b981', category: 'spreadsheet' },
  'ods': { icon: '📊', color: '#10b981', category: 'spreadsheet' },
  
  // Presentations
  'ppt': { icon: '📽️', color: '#f59e0b', category: 'presentation' },
  'pptx': { icon: '📽️', color: '#f59e0b', category: 'presentation' },
  'odp': { icon: '📽️', color: '#f59e0b', category: 'presentation' },
  
  // Images
  'jpg': { icon: '🖼️', color: '#8b5cf6', category: 'image' },
  'jpeg': { icon: '🖼️', color: '#8b5cf6', category: 'image' },
  'png': { icon: '🖼️', color: '#8b5cf6', category: 'image' },
  'gif': { icon: '🎞️', color: '#8b5cf6', category: 'image' },
  'svg': { icon: '🎨', color: '#8b5cf6', category: 'image' },
  'webp': { icon: '🖼️', color: '#8b5cf6', category: 'image' },
  'bmp': { icon: '🖼️', color: '#8b5cf6', category: 'image' },
  'ico': { icon: '🎨', color: '#8b5cf6', category: 'image' },
  
  // Videos
  'mp4': { icon: '🎬', color: '#ec4899', category: 'video' },
  'avi': { icon: '🎬', color: '#ec4899', category: 'video' },
  'mov': { icon: '🎬', color: '#ec4899', category: 'video' },
  'mkv': { icon: '🎬', color: '#ec4899', category: 'video' },
  'webm': { icon: '🎬', color: '#ec4899', category: 'video' },
  'flv': { icon: '🎬', color: '#ec4899', category: 'video' },
  
  // Audio
  'mp3': { icon: '🎵', color: '#06b6d4', category: 'audio' },
  'wav': { icon: '🎵', color: '#06b6d4', category: 'audio' },
  'flac': { icon: '🎵', color: '#06b6d4', category: 'audio' },
  'aac': { icon: '🎵', color: '#06b6d4', category: 'audio' },
  'ogg': { icon: '🎵', color: '#06b6d4', category: 'audio' },
  'wma': { icon: '🎵', color: '#06b6d4', category: 'audio' },
  
  // Archives
  'zip': { icon: '📦', color: '#f59e0b', category: 'archive' },
  'rar': { icon: '📦', color: '#f59e0b', category: 'archive' },
  '7z': { icon: '📦', color: '#f59e0b', category: 'archive' },
  'tar': { icon: '📦', color: '#f59e0b', category: 'archive' },
  'gz': { icon: '📦', color: '#f59e0b', category: 'archive' },
  
  // Code
  'js': { icon: '💻', color: '#eab308', category: 'code' },
  'ts': { icon: '💻', color: '#3b82f6', category: 'code' },
  'jsx': { icon: '💻', color: '#06b6d4', category: 'code' },
  'tsx': { icon: '💻', color: '#3b82f6', category: 'code' },
  'py': { icon: '🐍', color: '#10b981', category: 'code' },
  'html': { icon: '🌐', color: '#ef4444', category: 'code' },
  'css': { icon: '🎨', color: '#3b82f6', category: 'code' },
  'json': { icon: '📋', color: '#eab308', category: 'code' },
  'xml': { icon: '📋', color: '#6b7280', category: 'code' },
  'md': { icon: '📝', color: '#6b7280', category: 'code' },
  
  // Executables
  'exe': { icon: '⚙️', color: '#6b7280', category: 'executable' },
  'msi': { icon: '⚙️', color: '#6b7280', category: 'executable' },
  'dmg': { icon: '💿', color: '#6b7280', category: 'executable' },
  'iso': { icon: '💿', color: '#6b7280', category: 'executable' },
};

const DEFAULT_FILE_INFO: FileInfo = {
  icon: '📁',
  color: '#6b7280',
  category: 'unknown',
};

export function getFileInfo(filename: string): FileInfo {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return FILE_TYPE_MAP[ext] || DEFAULT_FILE_INFO;
}

export function isPreviewable(type: string): boolean {
  return type.startsWith('image/') || 
         type.startsWith('video/') || 
         type.startsWith('audio/') ||
         type === 'application/pdf' ||
         type === 'text/plain';
}

export function getFileCategory(type: string): string {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('text/')) return 'document';
  if (type.includes('pdf')) return 'document';
  if (type.includes('zip') || type.includes('archive') || type.includes('compressed')) return 'archive';
  return 'unknown';
}
