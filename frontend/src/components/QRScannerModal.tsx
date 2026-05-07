'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface QRPayload {
  peerId: string;
  serverUrl: string;
  sessionToken: string;
  timestamp: number;
}

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (payload: QRPayload) => void;
}

export default function QRScannerModal({
  isOpen,
  onClose,
  onScan,
}: QRScannerModalProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>(0);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      
      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasPermission(false);
        setError('Camera access not available. Try using HTTPS or a supported browser.');
        return;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      
      streamRef.current = stream;
      setHasPermission(true);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanning(true);
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setHasPermission(false);
      
      // More specific error messages
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          setError('Camera permission denied. Please allow camera access in your browser settings.');
        } else if (err.name === 'NotFoundError') {
          setError('No camera found on this device.');
        } else if (err.name === 'NotReadableError') {
          setError('Camera is already in use by another application.');
        } else {
          setError('Camera access failed. Please check browser permissions.');
        }
      } else {
        setError('Camera access not available. Try HTTPS connection or manual input.');
      }
    }
  }, []);

  // Scan for QR codes
  useEffect(() => {
    if (!scanning || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Dynamically import jsQR for scanning
    let jsQR: ((data: Uint8ClampedArray, width: number, height: number) => { data: string } | null) | null = null;
    
    import('jsqr').then((module) => {
      jsQR = module.default;
    }).catch(() => {
      // jsQR not available - we'll use a fallback approach
      console.log('jsQR not available, using manual input fallback');
    });

    const scan = () => {
      if (!scanning) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA && jsQR) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        
        if (code?.data) {
          try {
            const payload = JSON.parse(code.data) as QRPayload;
            if (payload.peerId && payload.serverUrl) {
              stopCamera();
              onScan(payload);
              onClose();
              return;
            }
          } catch {
            // Not a valid QR payload, continue scanning
          }
        }
      }
      
      animationRef.current = requestAnimationFrame(scan);
    };

    scan();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [scanning, onScan, onClose, stopCamera]);

  useEffect(() => {
    if (isOpen) {
      // Bolt: Use requestAnimationFrame to defer state update and avoid cascading render
      requestAnimationFrame(() => {
        startCamera();
      });
    } else {
      requestAnimationFrame(() => {
        stopCamera();
      });
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  const handleManualInput = async () => {
    const input = prompt('Enter the peer ID:');
    if (input) {
      // Create a synthetic payload for manual connection
      const payload: QRPayload = {
        peerId: input.startsWith('client_') ? input : `client_${input.toLowerCase()}`,
        serverUrl: process.env.NEXT_PUBLIC_SIGNALING_URL || 'ws://localhost:8080',
        sessionToken: 'manual',
        timestamp: Date.now(),
      };
      stopCamera();
      onScan(payload);
      onClose();
    }
  };

  if (!isOpen) return null;

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
          onClick={() => {
            stopCamera();
            onClose();
          }}
        />

        {/* Modal */}
        <motion.div
          className="relative bg-[#111]/95 backdrop-blur-md rounded-2xl border border-[#27272a] p-6 max-w-sm w-full shadow-2xl"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-[#ededed]">Scan QR Code</h3>
            <button
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="text-[#a1a1aa] hover:text-[#ededed] transition-colors p-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Camera View */}
          <div className="relative rounded-xl overflow-hidden bg-[#1f1f1f] mb-4 border border-[#27272a] aspect-square flex items-center justify-center">
            {hasPermission === false && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 z-20 bg-[#1f1f1f]">
                <svg className="w-12 h-12 text-[#a1a1aa] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-[#a1a1aa] text-sm text-center">{error || 'Camera not available'}</p>
                <button
                  onClick={startCamera}
                  className="mt-3 px-4 py-2 bg-[#ededed] text-black rounded-lg text-sm hover:bg-[#d4d4d8] transition-colors font-medium"
                >
                  Try Again
                </button>
              </div>
            )}
            
            <video
              ref={videoRef}
              className={`w-full h-full object-cover transition-opacity duration-300 ${scanning ? 'opacity-100' : 'opacity-0'}`}
              playsInline
              muted
            />

            {!scanning && hasPermission !== false && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#1f1f1f]">
                <div className="w-8 h-8 border-2 border-[#ededed] border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Scanning overlay */}
            {scanning && (
              <div className="absolute inset-0 pointer-events-none z-10">
                {/* Corner brackets */}
                <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-[#ededed]" />
                <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-[#ededed]" />
                <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-[#ededed]" />
                <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-[#ededed]" />
                
                {/* Scanning line */}
                <motion.div
                  className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-[#ededed] to-transparent"
                  animate={{ top: ['10%', '90%', '10%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
              </div>
            )}
          </div>

          {/* Hidden canvas for QR scanning */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Instructions */}
          <div className="space-y-3">
            <p className="text-[#a1a1aa] text-sm text-center">
              Point camera at another device&apos;s QR code
            </p>
            
            {/* Manual input fallback */}
            <button
              onClick={handleManualInput}
              className="w-full py-2 bg-[#1f1f1f] text-[#ededed] rounded-lg text-sm hover:bg-[#27272a] transition-colors border border-[#27272a]"
            >
              Enter Peer ID Manually
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
