'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

export function ServerWakeupGame() {
  const [score, setScore] = useState(0);
  const [position, setPosition] = useState({ x: 50, y: 50 });

  const handleClick = () => {
    setScore(s => s + 1);
    setPosition({
      x: 10 + Math.random() * 80, // %
      y: 10 + Math.random() * 80, // %
    });
  };

  return (
    <div className="w-full bg-[#111] border border-[#27272a] rounded-xl overflow-hidden mt-4 relative" style={{ height: '140px' }}>
      <div className="absolute inset-0 p-3 flex flex-col pointer-events-none">
        <p className="text-[#a1a1aa] text-xs font-medium">Server is starting...</p>
        <p className="text-[#ededed] text-sm font-semibold">Catch the node! Score: {score}</p>
        {score > 10 && <p className="text-[#10b981] text-[10px] mt-1">You&apos;re fast! Just a few more seconds.</p>}
      </div>
      
      <motion.button
        className="absolute w-8 h-8 rounded-full bg-[#3b82f6] flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.5)] cursor-pointer outline-none pointer-events-auto"
        style={{ left: `${position.x}%`, top: `${position.y}%`, x: '-50%', y: '-50%' }}
        onClick={handleClick}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
      >
        <span className="text-[10px]">⚡</span>
      </motion.button>
    </div>
  );
}
