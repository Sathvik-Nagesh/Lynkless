'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

const X = dynamic(() => import('lucide-react').then(mod => ({ default: mod.X })), { ssr: false });
const Send = dynamic(() => import('lucide-react').then(mod => ({ default: mod.Send })), { ssr: false });
const FileIcon = dynamic(() => import('lucide-react').then(mod => ({ default: mod.FileIcon })), { ssr: false });

interface FilePreviewModalProps {
  files: File[];
  peerCount: number;
  onConfirm: (password?: string, shouldZip?: boolean, compressImages?: boolean) => void;
  onCancel: () => void;
}

export default function FilePreviewModal({ files, peerCount, onConfirm, onCancel }: FilePreviewModalProps) {
  const [previews, setPreviews] = useState<{ [key: string]: string }>({});
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [shouldZip, setShouldZip] = useState(files.length > 1);
  const [compressImages, setCompressImages] = useState(false);

  // E2EE & Zipping Memory safety limit (e.g., 250MB) 
  const MEMORY_LIMIT = 250 * 1024 * 1024;
  const isTooLargeForE2EE = files.some(f => f.size > MEMORY_LIMIT);
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const isTooLargeForZip = totalSize > MEMORY_LIMIT;
  const hasImages = files.some(f => f.type.startsWith('image/'));

  // Generate preview for images
  const getPreview = (file: File) => {
    if (previews[file.name]) return previews[file.name];
    
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviews(prev => ({ ...prev, [file.name]: url }));
      return url;
    }
    return null;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onCancel}
        />

        {/* Modal */}
        <motion.div
          className="relative bg-[#111] rounded-2xl border border-[#27272a] p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl flex flex-col"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h3 className="text-xl font-bold text-[#ededed]">
              Send {files.length} {files.length === 1 ? 'File' : 'Files'}?
            </h3>
            <button
              onClick={onCancel}
              className="text-[#a1a1aa] hover:text-[#ededed] transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Preview Grid */}
          <div className="overflow-y-auto mb-4 space-y-2 flex-grow">
            {files.map((file, index) => {
              const preview = getPreview(file);
              const isVideo = file.type.startsWith('video/');

              return (
                <motion.div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-3 p-3 bg-[#1f1f1f] rounded-xl border border-[#27272a]"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  {/* Preview/Icon */}
                  <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-[#27272a] flex items-center justify-center">
                    {preview ? (
                      <img
                        src={preview}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    ) : isVideo ? (
                      <div className="text-3xl">🎥</div>
                    ) : (
                      <FileIcon size={32} className="text-[#a1a1aa]" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[#ededed] font-medium truncate" title={(file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name}>
                      {(file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name}
                    </p>
                    <p className="text-[#a1a1aa] text-sm">
                      {formatSize(file.size)} • {file.type || 'Unknown type'}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="flex-shrink-0">
            {/* Summary */}
            <div className="p-4 bg-[#1f1f1f] border border-[#27272a] rounded-xl mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-[#a1a1aa]">Total Size:</span>
                <span className="text-[#ededed] font-semibold">{formatSize(totalSize)}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-[#a1a1aa]">Recipients:</span>
                <span className="text-[#ededed] font-semibold">
                  {peerCount} {peerCount === 1 ? 'peer' : 'peers'}
                </span>
              </div>
            </div>

            {/* Options */}
            <div className="mb-4 space-y-3">
              {files.length > 1 && (
                <div className="flex flex-col gap-1">
                  <label className={`flex items-center gap-2 text-sm cursor-pointer w-fit ${isTooLargeForZip ? 'text-[#a1a1aa] cursor-not-allowed' : 'text-[#ededed]'}`}>
                    <input 
                      type="checkbox" 
                      className="rounded border-[#27272a] bg-[#111]"
                      checked={shouldZip && !isTooLargeForZip}
                      disabled={isTooLargeForZip}
                      onChange={(e) => setShouldZip(e.target.checked)}
                    />
                    <span>Bundle into strict ZIP archive</span>
                  </label>
                  {isTooLargeForZip && (
                    <span className="text-xs text-[#f59e0b] ml-6">
                      ⚠️ Disabled to prevent crash. ZIP bundling is limited to 250MB.
                    </span>
                  )}
                </div>
              )}
              
              {hasImages && (
                <label className="flex items-center gap-2 text-sm text-[#ededed] cursor-pointer w-fit">
                  <input 
                    type="checkbox" 
                    className="rounded border-[#27272a] bg-[#111]"
                    checked={compressImages}
                    onChange={(e) => setCompressImages(e.target.checked)}
                  />
                  <span>Compress Images (Faster Transfer)</span>
                </label>
              )}
              
              <div className="flex flex-col gap-1">
                <label className={`flex items-center gap-2 text-sm cursor-pointer w-fit ${isTooLargeForE2EE ? 'text-[#a1a1aa] cursor-not-allowed' : 'text-[#ededed]'}`}>
                  <input 
                    type="checkbox" 
                    className="rounded border-[#27272a] bg-[#111]"
                    checked={usePassword && !isTooLargeForE2EE}
                    disabled={isTooLargeForE2EE}
                    onChange={(e) => setUsePassword(e.target.checked)}
                  />
                  <span>Protect with password (E2EE)</span>
                </label>
                {isTooLargeForE2EE && (
                  <span className="text-xs text-[#f59e0b] ml-6">
                    ⚠️ Disabled to prevent browser crash. E2EE is limited to files &lt; 250MB.
                  </span>
                )}
              </div>

              <AnimatePresence>
                {usePassword && !isTooLargeForE2EE && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <input
                      type="text"
                      placeholder="Enter password to encrypt files"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-[#111] border border-[#27272a] rounded-xl px-4 py-3 text-sm text-[#ededed] focus:outline-none focus:border-[#ededed] mt-2"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 px-6 py-3 text-[#a1a1aa] font-medium rounded-xl hover:bg-[#1f1f1f] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm(usePassword && !isTooLargeForE2EE ? password : undefined, shouldZip && !isTooLargeForZip, compressImages)}
                className="flex-1 px-6 py-3 bg-[#ededed] text-black font-semibold rounded-xl hover:bg-[#d4d4d8] transition-all flex items-center justify-center gap-2"
              >
                <Send size={18} />
                {shouldZip && !isTooLargeForZip ? 'Zip & Send' : `Send ${files.length > 1 ? 'All' : 'File'}`}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
