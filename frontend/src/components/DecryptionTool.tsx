'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { E2EEHelper } from '@/lib/webrtc/e2ee';
import { useToast } from '@/components/ToastProvider';

export default function DecryptionTool() {
  const [encryptedFile, setEncryptedFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setEncryptedFile(e.target.files[0]);
    }
  };

  const handleDecrypt = async () => {
    if (!encryptedFile || !password) return;
    
    setIsDecrypting(true);
    try {
      const plainFile = await E2EEHelper.decryptFile(encryptedFile, password);
      
      // Auto-download decrypted file
      const url = URL.createObjectURL(plainFile);
      const a = document.createElement('a');
      a.href = url;
      a.download = plainFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast('File successfully decrypted!', 'success');
      setEncryptedFile(null);
      setPassword('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      showToast('Decryption failed. Incorrect password?', 'error');
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <div className="panel-elevated p-6 mt-6">
      <div className="flex items-center gap-3 mb-5">
        <div 
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div className="text-left">
          <span className="font-semibold text-[#E6EDF3] text-base block">Decryption Tool</span>
          <span className="text-[10px] text-[#64748B]">Decrypt received .encrypted files</span>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileSelect} 
            accept=".encrypted"
            className="hidden"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-4 px-4 bg-[#0F172A] border border-dashed border-[#334155] rounded-xl text-sm text-[#94A3B8] hover:border-[#10B981] hover:text-[#10B981] transition-colors"
          >
            {encryptedFile ? encryptedFile.name : 'Click to select .encrypted file'}
          </button>
        </div>

        <AnimatePresence>
          {encryptedFile && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3"
            >
              <input
                type="password"
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0F172A] border border-[#334155]/50 rounded-xl px-4 py-3 text-sm text-[#E6EDF3] focus:outline-none focus:border-[#10B981]"
              />
              <button
                onClick={handleDecrypt}
                disabled={!password || isDecrypting}
                className="w-full py-3 bg-gradient-to-r from-[#10B981] to-[#059669] text-white font-semibold rounded-xl hover:from-[#059669] hover:to-[#047857] disabled:opacity-50 transition-all flex justify-center items-center gap-2"
              >
                {isDecrypting ? 'Decrypting...' : 'Decrypt File'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
