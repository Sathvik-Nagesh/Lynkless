'use client';

import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConnectionFingerprintProps {
  fingerprint: string | null;
  peerId: string | null;
  isConnected: boolean;
}

const ConnectionFingerprint = memo(function ConnectionFingerprint({
  fingerprint,
  peerId,
  isConnected,
}: ConnectionFingerprintProps) {
  const [closedForFingerprint, setClosedForFingerprint] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Derive visibility: show if connected with fingerprint, unless manually closed for THIS fingerprint
  const showVerify = isConnected && !!fingerprint && closedForFingerprint !== fingerprint;

  const handleCopy = async () => {
    if (fingerprint) {
      await navigator.clipboard.writeText(fingerprint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shortPeerId = peerId?.replace('client_', '').toUpperCase().slice(0, 6);

  if (!isConnected || !fingerprint) return null;

  return (
    <AnimatePresence>
      {showVerify && (
        <motion.div
          className="bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-md rounded-xl border border-green-500/30 p-4"
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {/* Verified icon */}
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              
              <div>
                <h4 className="text-sm font-medium text-green-400 mb-1">
                  Secure Connection Established
                </h4>
                <p className="text-xs text-gray-400 mb-2">
                  Connected to <span className="text-cyan-400 font-mono">{shortPeerId}</span>
                </p>
                
                {/* Fingerprint display */}
                <div className="flex items-center gap-2">
                  <code className="px-3 py-1.5 bg-gray-800 rounded-lg font-mono text-lg tracking-wider text-white border border-gray-700">
                    {fingerprint}
                  </code>
                  <motion.button
                    onClick={handleCopy}
                    className="p-1.5 text-gray-400 hover:text-white transition-colors"
                    whileTap={{ scale: 0.9 }}
                    title="Copy fingerprint"
                  >
                    {copied ? (
                      <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </motion.button>
                </div>
                
                <p className="text-xs text-gray-500 mt-2">
                  🔒 Verify this code matches on both devices
                </p>
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={() => setClosedForFingerprint(fingerprint)}
              className="text-gray-500 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Verification tip */}
          <div className="mt-3 p-2 bg-gray-800/50 rounded-lg border border-gray-700/50">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                Both peers should see identical codes. If they differ, the connection may be compromised.
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

export default ConnectionFingerprint;
