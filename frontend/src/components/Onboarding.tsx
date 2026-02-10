'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

// Dynamic import for lucide-react to avoid SSR issues
const X = dynamic(() => import('lucide-react').then(mod => ({ default: mod.X })), { ssr: false });
const Zap = dynamic(() => import('lucide-react').then(mod => ({ default: mod.Zap })), { ssr: false });
const Shield = dynamic(() => import('lucide-react').then(mod => ({ default: mod.Shield })), { ssr: false });
const Radar = dynamic(() => import('lucide-react').then(mod => ({ default: mod.Radar })), { ssr: false });
const MessagesSquare = dynamic(() => import('lucide-react').then(mod => ({ default: mod.MessagesSquare })), { ssr: false });
const ArrowRight = dynamic(() => import('lucide-react').then(mod => ({ default: mod.ArrowRight })), { ssr: false });

const steps = [
  {
    icon: Zap,
    title: "Welcome to Lynkless!",
    description: "Your files don't belong in the cloud. Send files directly between browsers with zero server storage.",
    highlight: "Zero Storage. Complete Privacy.",
  },
  {
    icon: Radar,
    title: "Discover Peers",
    description: "Create a room or join with a 6-digit code. Nearby devices on your WiFi are auto-detected!",
    highlight: "Auto-connect to room members",
  },
  {
    icon: Shield,
    title: "Secure Connection",
    description: "All connections use WebRTC encryption. Verify the fingerprint code matches on both devices.",
    highlight: "End-to-end encrypted",
  },
  {
    icon: MessagesSquare,
    title: "Transfer & Chat",
    description: "Drop files to send to all connected peers. Chat in real-time. Everything disappears when you disconnect.",
    highlight: "Ephemeral by design",
  },
];

export default function Onboarding() {
  const [show, setShow] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // Check if user has seen onboarding
    const hasSeenOnboarding = localStorage.getItem('lynkless-onboarding-seen');
    if (!hasSeenOnboarding) {
      // Show after short delay
      setTimeout(() => setShow(true), 1000);
    }
  }, []);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    localStorage.setItem('lynkless-onboarding-seen', 'true');
    setShow(false);
  };

  const step = steps[currentStep];
  const Icon = step.icon;

  return (
    <AnimatePresence>
      {show && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
            onClick={handleSkip}
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none"
          >
            <div className="bg-gradient-to-br from-[#1E293B] to-[#0F172A] rounded-3xl border border-[#334155]/50 p-8 max-w-md w-full shadow-2xl pointer-events-auto">
              {/* Close button */}
              <button
                onClick={handleSkip}
                className="absolute top-4 right-4 text-[#64748B] hover:text-[#E6EDF3] transition-colors"
              >
                <X size={20} />
              </button>

              {/* Icon */}
              <motion.div
                key={currentStep}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#3B82F6] to-[#2563EB] flex items-center justify-center mx-auto mb-6"
              >
                <Icon size={32} className="text-white" />
              </motion.div>

              {/* Content */}
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <h2 className="text-2xl font-bold text-[#E6EDF3] mb-3 text-center">
                  {step.title}
                </h2>
                <p className="text-[#94A3B8] text-center mb-4 leading-relaxed">
                  {step.description}
                </p>
                <div className="text-center">
                  <span className="inline-block px-4 py-2 rounded-lg bg-[#3B82F6]/10 border border-[#3B82F6]/30 text-[#60A5FA] text-sm font-medium">
                    {step.highlight}
                  </span>
                </div>
              </motion.div>

              {/* Progress dots */}
              <div className="flex justify-center gap-2 mt-8 mb-6">
                {steps.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full transition-all ${
                      index === currentStep
                        ? 'bg-[#3B82F6] w-8'
                        : index < currentStep
                        ? 'bg-[#3B82F6]/50'
                        : 'bg-[#334155]'
                    }`}
                  />
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                {currentStep > 0 && (
                  <button
                    onClick={() => setCurrentStep(currentStep - 1)}
                    className="flex-1 px-6 py-3 text-[#94A3B8] font-medium rounded-xl hover:bg-[#1E293B] transition-colors"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white font-semibold rounded-xl hover:from-[#2563EB] hover:to-[#1D4ED8] transition-all flex items-center justify-center gap-2"
                >
                  {currentStep === steps.length - 1 ? "Get Started" : "Next"}
                  <ArrowRight size={18} />
                </button>
              </div>

              {/* Skip button */}
              {currentStep < steps.length - 1 && (
                <button
                  onClick={handleSkip}
                  className="w-full mt-3 text-[#64748B] text-sm hover:text-[#94A3B8] transition-colors"
                >
                  Skip tutorial
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
