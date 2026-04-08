'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import QRCode from 'qrcode';

// Browser-safe UUID generator (polyfill for crypto.randomUUID)
function generateUUID(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface QRCodeDisplayProps {
  clientId: string | null;
  signalingUrl: string;
  onClose: () => void;
}

interface QRPayload {
  peerId: string;
  serverUrl: string;
  sessionToken: string;
  timestamp: number;
}

export default function QRCodeDisplay({
  clientId,
  signalingUrl,
  onClose,
}: QRCodeDisplayProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const sessionToken = useRef(generateUUID().slice(0, 8));

  useEffect(() => {
    if (!clientId) return;

    const generateQR = async () => {
      const payload: QRPayload = {
        peerId: clientId,
        serverUrl: signalingUrl,
        sessionToken: sessionToken.current,
        timestamp: Date.now(),
      };

      const payloadString = JSON.stringify(payload);
      
      try {
        const dataUrl = await QRCode.toDataURL(payloadString, {
          width: 256,
          margin: 2,
          color: {
            dark: '#111111',
            light: '#ffffff',
          },
          errorCorrectionLevel: 'M',
        });
        setQrDataUrl(dataUrl);
      } catch (error) {
        console.error('Failed to generate QR code:', error);
      }
    };

    generateQR();
  }, [clientId, signalingUrl]);

  const handleCopyId = async () => {
    if (clientId) {
      await navigator.clipboard.writeText(clientId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shortId = clientId?.replace('client_', '').toUpperCase().slice(0, 6);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />

      {/* Modal */}
      <motion.div
        className="relative bg-[#111]/95 backdrop-blur-md rounded-2xl border border-[#27272a] p-6 max-w-sm w-full shadow-2xl"
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
      >

        {/* Content */}
        <div className="relative">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-[#ededed]">Connect via QR</h3>
            <button
              onClick={onClose}
              className="text-[#a1a1aa] hover:text-[#ededed] transition-colors p-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* QR Code */}
          <div className="flex justify-center mb-4">
            {qrDataUrl ? (
              <motion.div
                className="relative p-3 bg-white rounded-xl border border-[#27272a]"
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring' }}
              >
                <Image
                  src={qrDataUrl}
                  alt="Connection QR Code"
                  className="w-56 h-56 rounded-lg"
                  width={224}
                  height={224}
                  unoptimized
                />
              </motion.div>
            ) : (
              <div className="w-56 h-56 bg-[#1f1f1f] rounded-xl flex items-center justify-center border border-[#27272a]">
                <div className="w-8 h-8 border-2 border-[#ededed] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Peer ID */}
          <div className="text-center mb-4">
            <p className="text-[#a1a1aa] text-sm mb-2">Your Peer ID</p>
            <div className="flex items-center justify-center gap-2">
              <code className="px-4 py-2 bg-[#1f1f1f] rounded-lg font-mono text-[#ededed] text-lg tracking-wider border border-[#27272a]">
                {shortId || '...'}
              </code>
              <motion.button
                onClick={handleCopyId}
                className="p-2 text-[#a1a1aa] hover:text-[#ededed] bg-[#1f1f1f] rounded-lg border border-[#27272a] transition-colors"
                whileTap={{ scale: 0.9 }}
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
          </div>

          {/* Instructions */}
          <div className="p-3 bg-[#1f1f1f] rounded-xl border border-[#27272a]">
            <p className="text-[#a1a1aa] text-sm text-center">
              📱 Scan this QR code with another device to instantly connect
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
