'use client';

import { useState, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import { MAX_FILE_SIZE } from '@/lib/webrtc/fileTransfer';

interface FileDropZoneProps {
  onFileDrop: (files: File[]) => void;
  disabled?: boolean;
}

const FileDropZone = memo(function FileDropZone({ onFileDrop, disabled }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const validateFiles = useCallback((files: FileList | File[]): File[] => {
    const validFiles: File[] = [];
    const fileArray = Array.from(files);
    
    for (const file of fileArray) {
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name} exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
        continue;
      }
      validFiles.push(file);
    }
    
    if (validFiles.length > 0) {
      setError(null);
    }
    return validFiles;
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const validFiles = validateFiles(e.dataTransfer.files);
    if (validFiles.length > 0) {
      setSelectedFiles(validFiles);
    }
  }, [validateFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const validFiles = validateFiles(e.target.files);
      if (validFiles.length > 0) {
        setSelectedFiles(validFiles);
      }
    }
  }, [validateFiles]);

  const handleSend = useCallback(() => {
    if (selectedFiles.length > 0) {
      onFileDrop(selectedFiles);
      setSelectedFiles([]);
    }
  }, [selectedFiles, onFileDrop]);

  const handleClear = useCallback(() => {
    setSelectedFiles([]);
    setError(null);
  }, []);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="w-full">
      <motion.div
        className="relative overflow-hidden rounded-xl transition-all duration-150"
        style={{
          border: isDragging 
            ? '1px solid #22D3EE' 
            : disabled 
              ? '1px dashed rgba(255,255,255,0.06)' 
              : '1px dashed rgba(255,255,255,0.12)',
          background: isDragging
            ? 'rgba(34, 211, 238, 0.06)'
            : disabled
              ? 'rgba(255, 255, 255, 0.01)'
              : 'rgba(255, 255, 255, 0.03)',
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        animate={{
          scale: isDragging ? 1.02 : 1,
        }}
      >
        <div className="p-8 flex flex-col items-center justify-center gap-4">
          <input
            type="file"
            id="file-input"
            className="hidden"
            onChange={handleFileSelect}
            disabled={disabled}
            multiple
          />
          
          {selectedFiles.length === 0 ? (
            <>
              <div className="text-5xl mb-2">📁</div>
              <p className="text-white/60 font-medium">
                {disabled ? 'No peer connected' : 'Drop files here or click to select'}
              </p>
              <p className="text-white/30 text-sm">
                Up to {MAX_FILE_SIZE / (1024 * 1024)}MB per file • Multiple files supported
              </p>
              {!disabled && (
                <label
                  htmlFor="file-input"
                  className="mt-2 px-6 py-2 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 text-cyan-400 rounded-lg cursor-pointer hover:from-cyan-500/20 hover:to-purple-500/20 transition-all"
                >
                  Choose Files
                </label>
              )}
            </>
          ) : (
            <div className="w-full">
              <div className="flex items-center justify-between mb-3">
                <p className="text-white/80 font-medium">
                  {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                </p>
                <p className="text-white/50 text-sm">{formatSize(totalSize)} total</p>
              </div>
              
              <div className="max-h-32 overflow-y-auto space-y-2 mb-4">
                {selectedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between p-2 bg-white/5 rounded"
                  >
                    <span className="text-white/70 text-sm truncate flex-1">{file.name}</span>
                    <span className="text-white/40 text-xs ml-2">{formatSize(file.size)}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleClear}
                  className="flex-1 px-4 py-2 bg-white/5 text-white/60 rounded-lg hover:bg-white/10 transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={handleSend}
                  disabled={disabled}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-purple-500 text-white rounded-lg hover:from-cyan-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send {selectedFiles.length > 1 ? 'All' : 'File'}
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
      </motion.div>
    </div>
  );
});

export default FileDropZone;
