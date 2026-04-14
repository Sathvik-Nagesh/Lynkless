'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Shield, Zap, Home, Smartphone, Radar, MessagesSquare, RefreshCw, Cpu, Globe, Lock } from 'lucide-react';

const features = [
  {
    icon: <Lock className="w-6 h-6 text-blue-400" />,
    title: 'E2EE Encryption',
    desc: 'Military-grade encryption. Your data is encrypted before it even leaves your device.',
  },
  {
    icon: <Zap className="w-6 h-6 text-yellow-400" />,
    title: 'Zero Latency P2P',
    desc: 'Direct device-to-device streaming. No middleman, no cloud storage, no limits.',
  },
  {
    icon: <Home className="w-6 h-6 text-purple-400" />,
    title: 'Private Channels',
    desc: 'Temporary room codes for instant group sharing without persistent links.',
  },
  {
    icon: <Smartphone className="w-6 h-6 text-green-400" />,
    title: 'PWA Ready',
    desc: 'Install it on your phone or desktop for a native experience without app stores.',
  },
];

const techStack = [
  { name: 'WebRTC', icon: <Cpu className="w-5 h-5 text-indigo-400" />, desc: 'Bi-directional real-time data streaming' },
  { name: 'Next.js 14', icon: <Globe className="w-5 h-5 text-white" />, desc: 'Modern, high-performance web architecture' },
  { name: 'WebSocket', icon: <RefreshCw className="w-5 h-5 text-teal-400" />, desc: 'Instant signaling and room state synchronization' },
  { name: 'TypeScript', icon: <Shield className="w-5 h-5 text-blue-500" />, desc: 'Type-safe, robust code for reliable transfers' },
];

const fadeIn = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-[#ededed] selection:bg-blue-500/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/5 blur-[120px]" />
      </div>

      {/* Navigation */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b border-white/5 bg-black/20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center group-hover:scale-105 transition-transform">
              <Zap className="text-black w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">LYNKLESS</span>
          </Link>
          <Link
            href="/"
            className="px-4 py-2 rounded-full border border-white/10 hover:bg-white/10 transition-colors text-sm font-medium"
          >
            Open App
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 text-center">
        <motion.div
          className="max-w-3xl mx-auto"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/20 bg-blue-500/5 text-blue-400 text-xs font-semibold mb-8"
          >
            <Shield className="w-3 h-3" />
            <span>0% Cloud Storage • 100% Privacy</span>
          </motion.div>

          <h1 className="text-5xl md:text-7xl font-bold mb-8 tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-[#a1a1aa]">
            The Future of File <br /> Sharing is Decentralized.
          </h1>
          <p className="text-lg md:text-xl text-[#a1a1aa] mb-12 leading-relaxed">
            Lynkless eliminates the middleman. We don&apos;t store your files because we don&apos;t have to.
            Experience direct, lightning-fast transfers right in your browser.
          </p>
        </motion.div>
      </section>

      {/* Core Features Grid */}
      <section className="py-20 px-6 max-w-6xl mx-auto">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={fadeIn}
              transition={{ duration: 0.6 }}
              className="group p-8 rounded-3xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all"
            >
              <div className="mb-6 p-3 rounded-2xl bg-white/5 w-fit group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-lg font-bold mb-3 text-white">{feature.title}</h3>
              <p className="text-sm text-[#a1a1aa] leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Detailed Info */}
      <section className="py-32 px-6 bg-white/[0.01] border-y border-white/5">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <motion.div {...fadeIn}>
            <h2 className="text-3xl md:text-4xl font-bold mb-8 tracking-tight">
              Why LYNKLESS matters.
            </h2>
            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex-shrink-0 flex items-center justify-center text-orange-500">
                  <Radar className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white mb-2">Nearby Discovery</h4>
                  <p className="text-[#a1a1aa] text-sm leading-relaxed">
                    Our intelligent signaling server detects devices on the same local network instantly.
                    Perfect for offices, colleges, or home setups without typing a single code.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex-shrink-0 flex items-center justify-center text-blue-500">
                  <MessagesSquare className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white mb-2">Ephemeral Real-time Chat</h4>
                  <p className="text-[#a1a1aa] text-sm leading-relaxed">
                    Communicate while you share. Chat logs are never saved, disappearing completely
                    the moment your session ends. Privacy is the default.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="panel-elevated p-1 rounded-3xl bg-gradient-to-br from-white/10 to-transparent"
          >
            <div className="bg-[#0a0a0a] rounded-[22px] p-8">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                <Cpu className="text-blue-400 w-5 h-5" />
                <span>Technical DNA</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {techStack.map((tech, i) => (
                  <div key={i} className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                    <div className="mb-3">{tech.icon}</div>
                    <div className="font-bold text-sm mb-1">{tech.name}</div>
                    <p className="text-[11px] text-[#71717a] leading-tight">{tech.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Tech Stack Callout */}
      <section className="py-32 px-6 max-w-4xl mx-auto text-center">
        <motion.div {...fadeIn}>
          <h2 className="text-2xl md:text-3xl font-bold mb-12">Universal Compatibility</h2>
          <div className="flex flex-wrap justify-center gap-4">
            {['Chrome', 'Firefox', 'Safari', 'Edge', 'iOS', 'Android', 'Linux', 'macOS', 'Windows'].map((os) => (
              <span key={os} className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-sm font-medium text-[#a1a1aa]">
                {os}
              </span>
            ))}
          </div>
          <p className="mt-12 text-[#71717a] text-sm italic">
            * Browser support for WebRTC is required. Latest versions recommended.
          </p>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-20 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
              <Zap className="text-black w-6 h-6" />
            </div>
            <div className="text-left">
              <span className="font-black text-xl block leading-none">LYNKLESS</span>
              <span className="text-[10px] text-[#71717a] tracking-widest uppercase">P2P File Transfer Tool</span>
            </div>
          </div>
          <div className="flex gap-8 text-sm font-medium text-[#a1a1aa]">
            <Link href="/" className="hover:text-white transition-colors">App</Link>
            <a href="https://github.com/Sathvik-Nagesh/Lynkless" target="_blank" className="hover:text-white transition-colors">GitHub</a>
            <span className="text-[#3f3f46]">v2.2.0_Ultra</span>
          </div>
          <p className="text-[#3f3f46] text-xs">
            © {new Date().getFullYear()} Sathvik Nagesh • Developed for Extreme Privacy.
          </p>
        </div>
      </footer>
    </main>
  );
}
