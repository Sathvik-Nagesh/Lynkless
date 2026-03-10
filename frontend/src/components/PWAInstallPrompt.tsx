'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

// Dynamic import for lucide-react to avoid SSR issues
const X = dynamic(() => import('lucide-react').then(mod => ({ default: mod.X })), { ssr: false });
const Download = dynamic(() => import('lucide-react').then(mod => ({ default: mod.Download })), { ssr: false });

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(
          (registration) => {
            console.log('[PWA] Service Worker registered:', registration);
          },
          (error) => {
            console.error('[PWA] Service Worker registration failed:', error);
          }
        );
      });
    }

    // Handle install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Check if user has dismissed before
      const hasDismissed = localStorage.getItem('pwa-install-dismissed');
      if (!hasDismissed) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('[PWA] User choice:', outcome);

    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa-install-dismissed', 'true');
    setShowPrompt(false);
  };

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50"
        >
          <div className="bg-[#111]/95 backdrop-blur-xl rounded-2xl border border-[#27272a] p-5 shadow-2xl">
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 text-[#a1a1aa] hover:text-[#ededed] transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#ededed] flex items-center justify-center flex-shrink-0">
                <Download size={20} className="text-black" />
              </div>

              <div className="flex-1">
                <h3 className="text-[#ededed] font-semibold mb-1">
                  Install Lynkless
                </h3>
                <p className="text-[#a1a1aa] text-sm mb-4">
                  Add to your home screen for quick access and offline support.
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={handleInstall}
                    className="px-4 py-2 bg-[#ededed] text-black text-sm font-medium rounded-lg hover:bg-[#d4d4d8] transition-all"
                  >
                    Install
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="px-4 py-2 text-[#a1a1aa] text-sm font-medium hover:text-[#ededed] transition-colors"
                  >
                    Not now
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
