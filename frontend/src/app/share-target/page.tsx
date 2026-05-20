'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ShareTargetPage() {
  const router = useRouter();

  useEffect(() => {
    // The Service Worker should have intercepted the POST. 
    // This page is just a fallback to ensure the user lands back in the app.
    router.replace('/?shared=true');
  }, [router]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center">
      <div className="w-16 h-16 rounded-full border-t-2 border-blue-500 animate-spin mb-6" />
      <h1 className="text-xl font-bold text-white mb-2">Processing Share...</h1>
      <p className="text-gray-400 text-sm">Hold on, we&apos;re bringing your files into Lynkless.</p>
    </div>
  );
}
