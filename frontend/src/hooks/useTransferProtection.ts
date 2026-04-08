import { useEffect } from 'react';

export function useTransferProtection(activeTransfersCount: number): void {
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeTransfersCount > 0) {
        e.preventDefault();
        e.returnValue = 'You have active file transfers. They will be canceled if you leave.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    let wakeLock: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && activeTransfersCount > 0) {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
          console.log('[WakeLock] Screen locked active to prevent file transfer drop');
        } catch (err: unknown) {
          console.log('[WakeLock] System denied lock:', err instanceof Error ? err.message : 'Unknown error');
        }
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLock !== null) {
        await wakeLock.release();
        wakeLock = null;
        console.log('[WakeLock] Screen lock released');
      }
    };

    if (activeTransfersCount > 0) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [activeTransfersCount]);
}

