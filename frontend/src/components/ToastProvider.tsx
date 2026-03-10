'use client';

import { useState, useCallback, createContext, useContext, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
  success: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const TOAST_COLORS: Record<ToastType, { bg: string; border: string; icon: string; text: string }> = {
  success: {
    bg: '#111',
    border: '#27272a',
    icon: '#10b981',
    text: '#ededed',
  },
  error: {
    bg: '#111',
    border: '#27272a',
    icon: '#ef4444',
    text: '#ededed',
  },
  warning: {
    bg: '#111',
    border: '#27272a',
    icon: '#f59e0b',
    text: '#ededed',
  },
  info: {
    bg: '#111',
    border: '#27272a',
    icon: '#ededed',
    text: '#ededed',
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration: number = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type, duration }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none max-w-sm w-full"
        style={{ maxWidth: 'min(380px, calc(100vw - 48px))' }}
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => {
            const colors = TOAST_COLORS[toast.type];
            return (
              <motion.div
                key={toast.id}
                className="pointer-events-auto rounded-xl px-4 py-3 backdrop-blur-xl shadow-2xl cursor-pointer"
                style={{
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  backdropFilter: 'blur(20px)',
                }}
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 100, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                onClick={() => dismissToast(toast.id)}
                layout
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5" style={{ color: colors.icon }}>
                    {TOAST_ICONS[toast.type]}
                  </div>
                  <p className="text-sm font-medium leading-snug" style={{ color: colors.text }}>
                    {toast.message}
                  </p>
                </div>

                {/* Progress bar */}
                <motion.div
                  className="absolute bottom-0 left-0 h-0.5 rounded-full"
                  style={{ background: colors.icon }}
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: toast.duration / 1000, ease: 'linear' }}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
