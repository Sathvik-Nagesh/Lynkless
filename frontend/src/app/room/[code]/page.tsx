'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.code as string;

  useEffect(() => {
    // Store the room code and redirect to main page
    // The main page will handle the join logic
    if (roomCode) {
      sessionStorage.setItem('pendingRoomCode', roomCode.toUpperCase());
      router.push('/');
    }
  }, [roomCode, router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        className="text-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="w-20 h-20 rounded-full bg-[#111] border border-[#27272a] flex items-center justify-center mx-auto mb-6">
          <motion.svg
            className="w-10 h-10 text-[#ededed]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </motion.svg>
        </div>
        
        <h1 className="text-2xl font-bold text-[#ededed] mb-2">
          Joining Room: <span className="text-[#ededed]">{roomCode}</span>
        </h1>
        <p className="text-[#a1a1aa]">Connecting you to the room...</p>
      </motion.div>
    </main>
  );
}
