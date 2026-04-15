'use client';

import { memo, useState, useCallback, useEffect } from 'react';
import { getSounds } from '@/lib/utils/sounds';

export const SoundToggle = memo(function SoundToggle() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('lynkless-sounds-enabled');
    return saved !== 'false';
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Bolt: Use requestAnimationFrame to defer the mount state update and avoid
    // synchronous setState within an effect that triggers cascading renders.
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    getSounds().setEnabled(enabled);
  }, [enabled]);

  const toggleSound = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem('lynkless-sounds-enabled', String(next));
    getSounds().setEnabled(next);
  }, [enabled]);

  if (!mounted) {
    return (
      <div className="p-2 w-8 h-8" />
    );
  }

  return (
    <button
      onClick={toggleSound}
      className="p-2 rounded-lg hover:bg-[#1f1f1f] transition-colors"
      title={enabled ? 'Mute sounds' : 'Unmute sounds'}
    >
      {enabled ? (
        <svg className="w-4 h-4 text-[#a1a1aa]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-[#a1a1aa]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
        </svg>
      )}
    </button>
  );
});
