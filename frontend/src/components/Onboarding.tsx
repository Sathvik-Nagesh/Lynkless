'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Shield, Lock, ArrowRight, X } from 'lucide-react';

export default function Onboarding() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('lynkless-onboarding-seen');
    if (!hasSeenOnboarding) {
      setTimeout(() => setShow(true), 1000);
    }
  }, []);

  const handleComplete = () => {
    localStorage.setItem('lynkless-onboarding-seen', 'true');
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[100]"
            onClick={handleComplete}
          />

          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="fixed inset-0 flex items-center justify-center z-[101] p-4 pointer-events-none"
          >
            <div className="bg-[#111] rounded-[40px] border border-white/10 p-10 max-w-lg w-full shadow-[0_0_80px_rgba(0,0,0,0.8)] relative overflow-hidden pointer-events-auto">
              {/* Animated Gradient Border */}
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600" />
              
              <button 
                onClick={handleComplete}
                className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/5 text-[#52525b] hover:text-white transition-all"
              >
                <X size={20} />
              </button>

              <div className="flex flex-col items-center text-center">
                <motion.div 
                  initial={{ rotate: -10, scale: 0.5 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: "spring", damping: 12 }}
                  className="w-24 h-24 rounded-[32px] bg-white flex items-center justify-center mb-8 shadow-2xl relative"
                >
                  <Zap size={48} className="text-black fill-black" />
                  <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-[10px] font-black px-2 py-1 rounded-full border-2 border-[#111] uppercase tracking-tighter">
                    P2P v2.1
                  </div>
                </motion.div>
                
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tighter italic">
                  WELCOME TO LYNKLESS
                </h2>
                <p className="text-[#a1a1aa] mb-12 text-lg leading-relaxed max-w-sm">
                  Decentralized file sharing for the paranoid. <br />
                  <span className="text-[#ededed] font-bold">Pure P2P. Zero Clouds. Total Privacy.</span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 w-full mb-12">
                  <div className="flex flex-col items-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                      <Lock size={24} />
                    </div>
                    <span className="text-xs font-black tracking-widest text-[#52525b] uppercase">Secured</span>
                  </div>
                  <div className="flex flex-col items-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-yellow-500/10 flex items-center justify-center text-yellow-400">
                      <Zap size={24} />
                    </div>
                    <span className="text-xs font-black tracking-widest text-[#52525b] uppercase">Direct</span>
                  </div>
                  <div className="flex flex-col items-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                      <Shield size={24} />
                    </div>
                    <span className="text-xs font-black tracking-widest text-[#52525b] uppercase">Private</span>
                  </div>
                </div>

                <button
                  onClick={handleComplete}
                  className="w-full py-5 bg-white text-black font-black rounded-[20px] hover:bg-[#d4d4d8] transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 text-xl shadow-xl shadow-white/5 group"
                >
                  Start Transferring
                  <ArrowRight size={22} className="group-hover:translate-x-1 transition-transform" />
                </button>
                
                <p className="mt-8 text-[#52525b] text-sm font-medium">
                  Compatible with Chrome, Safari, Firefox, and PWA.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
