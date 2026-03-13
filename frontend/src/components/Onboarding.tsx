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
    title: "No clouds. Just peers.",
    description: "Send files securely right from your browser. We don't use servers to store your data—everything goes directly to the recipient.",
    highlight: "Zero Storage. Absolute Privacy.",
  },
  {
    icon: Radar,
    title: "Instant Connection ⚡",
    description: "Devices on the same WiFi auto-detect each other instantly! Or, create a 6-digit room code to connect with anyone, anywhere in the world.",
    highlight: "Auto-discovery & Mesh Networking",
  },
  {
    icon: MessagesSquare,
    title: "Drag. Drop. Done.",
    description: "Drop files of any size to send them to everyone in the room simultaneously. Chat in real-time. Everything vanishes the second you leave.",
    highlight: "Ephemeral & Limitless",
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
            <div className="bg-[#111] rounded-3xl border border-[#27272a] p-8 max-w-md w-full shadow-2xl pointer-events-auto">
              {/* Close button */}
              <button
                onClick={handleSkip}
                className="absolute top-4 right-4 text-[#a1a1aa] hover:text-[#ededed] transition-colors"
              >
                <X size={20} />
              </button>

              {/* Icon */}
              <motion.div
                key={currentStep}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="w-16 h-16 rounded-2xl bg-[#ededed] flex items-center justify-center mx-auto mb-6"
              >
                <Icon size={32} className="text-black" />
              </motion.div>

              {/* Content */}
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <h2 className="text-2xl font-bold text-[#ededed] mb-3 text-center">
                  {step.title}
                </h2>
                <p className="text-[#a1a1aa] text-center mb-4 leading-relaxed">
                  {step.description}
                </p>
                <div className="text-center">
                  <span className="inline-block px-4 py-2 rounded-lg bg-[#1f1f1f] border border-[#27272a] text-[#ededed] text-sm font-medium">
                    {step.highlight}
                  </span>
                </div>
              </motion.div>

              {/* Progress dots */}
              <div className="flex justify-center gap-2 mt-8 mb-6">
                {steps.map((step, index) => (
                  <div
                    key={`step-${index}-${step.title}`}
                    className={`w-2 h-2 rounded-full transition-all ${
                      index === currentStep
                        ? 'bg-[#ededed] w-8'
                        : index < currentStep
                        ? 'bg-[#a1a1aa]'
                        : 'bg-[#27272a]'
                    }`}
                  />
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                {currentStep > 0 && (
                  <button
                    onClick={() => setCurrentStep(currentStep - 1)}
                    className="flex-1 px-6 py-3 text-[#a1a1aa] font-medium rounded-xl hover:bg-[#1f1f1f] transition-colors"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="flex-1 px-6 py-3 bg-[#ededed] text-black font-semibold rounded-xl hover:bg-[#d4d4d8] transition-all flex items-center justify-center gap-2"
                >
                  {currentStep === steps.length - 1 ? "Get Started" : "Next"}
                  <ArrowRight size={18} />
                </button>
              </div>

              {/* Skip button */}
              {currentStep < steps.length - 1 && (
                <button
                  onClick={handleSkip}
                  className="w-full mt-3 text-[#71717a] text-sm hover:text-[#a1a1aa] transition-colors"
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
