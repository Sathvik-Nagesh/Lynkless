'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MAX_FILE_SIZE } from '@/lib/webrtc/fileTransfer';

interface FileDropZoneProps {
  onFileDrop: (file: File) => void;
  disabled?: boolean;
}

export default function FileDropZone({ onFileDrop, disabled }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const validateFile = useCallback((file: File): boolean => {
    if (file.size > MAX_FILE_SIZE) {
      setError(`File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
      return false;
    }
    setError(null);
    return true;
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
  }, [validateFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
  }, [validateFile]);

  const handleSend = useCallback(() => {
    if (selectedFile) {
      onFileDrop(selectedFile);
      setSelectedFile(null);
    }
  }, [selectedFile, onFileDrop]);

  const handleClear = useCallback(() => {
    setSelectedFile(null);
    setError(null);
  }, []);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

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
            ? 'rgba(34, 211, 238, 0.05)' 
            : disabled
              ? 'var(--bg-surface)'
              : 'var(--bg-surface)',
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <AnimatePresence mode="wait">
          {selectedFile ? (
            <motion.div
              key="file-preview"
              className="p-5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #22D3EE 0%, #6366F1 100%)' }}
                >
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#E6EDF3] font-medium truncate text-sm">{selectedFile.name}</p>
                  <p className="text-[#64748B] text-xs">{formatSize(selectedFile.size)}</p>
                </div>
                <button
                  onClick={handleClear}
                  className="p-2 text-[#64748B] hover:text-[#E6EDF3] transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <motion.button
                onClick={handleSend}
                disabled={disabled}
                className="mt-4 w-full py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: disabled ? 'var(--bg-hover)' : '#22D3EE',
                  color: disabled ? '#64748B' : '#0B0F14',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
                whileHover={disabled ? {} : { transform: 'translateY(-1px)', boxShadow: '0 4px 12px rgba(34, 211, 238, 0.2)' }}
                whileTap={disabled ? {} : { transform: 'translateY(0)' }}
              >
                {disabled ? 'Connect to a peer first' : 'Send File'}
              </motion.button>
            </motion.div>
          ) : (
            <motion.label
              key="drop-zone"
              className={`flex flex-col items-center justify-center p-8 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <input
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                disabled={disabled}
              />
              
              <motion.div
                className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
                style={{ 
                  background: isDragging 
                    ? 'rgba(34, 211, 238, 0.15)' 
                    : 'rgba(34, 211, 238, 0.08)'
                }}
                animate={{
                  y: isDragging ? -4 : 0,
                  scale: isDragging ? 1.05 : 1,
                }}
                transition={{ duration: 0.15 }}
              >
                <svg 
                  className="w-6 h-6" 
                  style={{ color: '#22D3EE' }} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </motion.div>
              
              <p className="text-sm text-center mb-1">
                {isDragging ? (
                  <span style={{ color: '#22D3EE' }}>Drop your file here</span>
                ) : (
                  <span className="text-[#94A3B8]">
                    <span style={{ color: '#22D3EE' }} className="font-medium">Click to upload</span> or drag and drop
                  </span>
                )}
              </p>
              <p className="text-[#64748B] text-xs">Maximum file size: 500MB</p>
            </motion.label>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.p
            className="mt-2 text-xs flex items-center gap-2"
            style={{ color: '#EF4444' }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
