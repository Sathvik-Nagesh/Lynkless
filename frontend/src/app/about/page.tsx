'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

const features = [
  {
    icon: '🔒',
    title: 'End-to-End Encryption',
    desc: 'Files are encrypted using WebRTC DTLS. No one, not even us, can see your data.',
  },
  {
    icon: '⚡',
    title: 'Peer-to-Peer Transfer',
    desc: 'Files go directly between devices. No cloud storage, no middleman, no upload limits.',
  },
  {
    icon: '🏠',
    title: 'Room-Based Connections',
    desc: 'Create private rooms with codes. Share the code and connect instantly.',
  },
  {
    icon: '📱',
    title: 'QR Code Connect',
    desc: 'Scan a QR code to connect devices. No typing required.',
  },
  {
    icon: '📡',
    title: 'Nearby Discovery',
    desc: 'Automatically discover devices on the same network.',
  },
  {
    icon: '💬',
    title: 'Encrypted Chat',
    desc: 'Send ephemeral messages alongside your files. Nothing is stored.',
  },
  {
    icon: '📁',
    title: 'Multi-File Transfer',
    desc: 'Select and send multiple files at once with preview before sending.',
  },
  {
    icon: '⏸️',
    title: 'Pause & Resume',
    desc: 'Pause transfers and resume from where you left off.',
  },
];

const howItWorks = [
  {
    step: '01',
    title: 'Connect',
    desc: 'Create a room, scan a QR code, or let nearby discovery find your devices.',
    color: '#22D3EE',
  },
  {
    step: '02',
    title: 'Select Files',
    desc: 'Drag & drop or browse to select one or more files to transfer.',
    color: '#6366F1',
  },
  {
    step: '03',
    title: 'Preview & Send',
    desc: 'Review file previews and confirm. Files transfer directly via WebRTC.',
    color: '#EC4899',
  },
  {
    step: '04',
    title: 'Done!',
    desc: 'Files arrive on the other device instantly. Nothing stored, nothing tracked.',
    color: '#22C55E',
  },
];

const faqs = [
  {
    q: 'Is my data stored on any server?',
    a: 'No. Lynkless uses WebRTC to transfer files directly between devices. Our signaling server only helps establish the initial connection — it never sees your files.',
  },
  {
    q: 'What is the file size limit?',
    a: 'Currently 500MB per file. WebRTC connections can handle large files, but browser memory limitations apply.',
  },
  {
    q: 'Do I need to create an account?',
    a: 'No. Lynkless requires zero registration. Just open the app and start transferring.',
  },
  {
    q: 'Can I use this on mobile?',
    a: 'Yes! Lynkless is a Progressive Web App (PWA). Install it on your phone from the browser for the best experience.',
  },
  {
    q: 'What happens if the connection drops?',
    a: 'Lynkless supports transfer resume. If the connection drops mid-transfer, you can reconnect and continue from where you left off.',
  },
  {
    q: 'How does nearby discovery work?',
    a: 'When two devices are on the same network (same subnet), the signaling server detects they share the same IP prefix and shows them as "nearby" peers.',
  },
];

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5 },
};

export default function AboutPage() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative py-20 px-6 md:px-10 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        </div>

        <motion.div
          className="max-w-4xl mx-auto text-center relative z-10"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <Link
            href="/"
            className="inline-block mb-8 text-[#a1a1aa] hover:text-[#ededed] transition-colors text-sm"
          >
            ← Back to App
          </Link>

          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            <span className="text-[#ededed]">Lynkless</span>
          </h1>
          <p className="text-xl md:text-2xl text-[#a1a1aa] mb-4">
            Your files don&apos;t belong in the cloud.
          </p>
          <p className="text-[#a1a1aa] max-w-2xl mx-auto leading-relaxed">
            Lynkless is a zero-storage, peer-to-peer file transfer application.
            Transfer files directly between devices with end-to-end encryption.
            No accounts, no uploads, no tracking.
          </p>
        </motion.div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-6 md:px-10">
        <motion.div className="max-w-5xl mx-auto" {...fadeIn}>
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12 text-[#ededed]">
            How It Works
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {howItWorks.map((item, i) => (
              <motion.div
                key={item.step}
                className="panel-elevated p-6 text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div
                  className="text-3xl font-black mb-3"
                  style={{ color: item.color, opacity: 0.3 }}
                >
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-[#ededed] mb-2">{item.title}</h3>
                <p className="text-sm text-[#a1a1aa] leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-16 px-6 md:px-10" style={{ background: 'var(--bg-surface)' }}>
        <motion.div className="max-w-5xl mx-auto" {...fadeIn}>
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12 text-[#ededed]">
            Features
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                className="p-5 rounded-xl"
                style={{
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-subtle)',
                }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -4, transition: { duration: 0.15 } }}
              >
                <div className="text-2xl mb-3">{feature.icon}</div>
                <h3 className="text-sm font-semibold text-[#ededed] mb-1">{feature.title}</h3>
                <p className="text-xs text-[#a1a1aa] leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Architecture */}
      <section className="py-16 px-6 md:px-10">
        <motion.div className="max-w-4xl mx-auto" {...fadeIn}>
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12 text-[#ededed]">
            Architecture
          </h2>

          <div className="panel-elevated p-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[#27272a]"
                  style={{ background: '#111' }}
                >
                  <svg className="w-8 h-8 text-[#ededed]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-[#ededed] mb-2">Frontend</h3>
                <p className="text-xs text-[#a1a1aa]">
                  Next.js + React • TypeScript • Framer Motion • Progressive Web App
                </p>
              </div>

              <div className="text-center">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[#27272a]"
                  style={{ background: '#111' }}
                >
                  <svg className="w-8 h-8 text-[#ededed]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-[#ededed] mb-2">Signaling Server</h3>
                <p className="text-xs text-[#a1a1aa]">
                  Node.js • WebSocket • Room Management • Nearby Discovery
                </p>
              </div>

              <div className="text-center">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[#27272a]"
                  style={{ background: '#111' }}
                >
                  <svg className="w-8 h-8 text-[#ededed]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-[#ededed] mb-2">WebRTC</h3>
                <p className="text-xs text-[#a1a1aa]">
                  DTLS Encryption • DataChannel • ICE/STUN/TURN • Chunked Transfer
                </p>
              </div>
            </div>

            <div className="mt-8 p-4 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs text-[#a1a1aa] text-center leading-relaxed">
                The signaling server only facilitates the initial handshake between peers (exchanging WebRTC offers/answers/ICE candidates).
                Once connected, all data flows directly between devices using WebRTC DataChannels with DTLS encryption.
                <strong className="text-[#ededed]"> Zero data passes through our servers.</strong>
              </p>
            </div>
          </div>
        </motion.div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-6 md:px-10" style={{ background: 'var(--bg-surface)' }}>
        <motion.div className="max-w-3xl mx-auto" {...fadeIn}>
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12 text-[#ededed]">
            FAQ
          </h2>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <motion.div
                key={i}
                className="p-5 rounded-xl"
                style={{
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-subtle)',
                }}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <h3 className="text-sm font-semibold text-[#ededed] mb-2">{faq.q}</h3>
                <p className="text-xs text-[#a1a1aa] leading-relaxed">{faq.a}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Tech Stack */}
      <section className="py-16 px-6 md:px-10">
        <motion.div className="max-w-4xl mx-auto text-center" {...fadeIn}>
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-[#ededed]">
            Built With
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              'Next.js', 'React', 'TypeScript', 'WebRTC',
              'WebSocket', 'Node.js', 'Framer Motion', 'Vercel',
              'Render', 'PWA',
            ].map((tech) => (
              <span
                key={tech}
                className="px-4 py-2 rounded-xl text-sm font-medium text-[#a1a1aa]"
                style={{
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {tech}
              </span>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 text-center" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <p className="text-[#a1a1aa] text-sm">
          Made with 💙 for Privacy —
          <span className="text-[#ededed] font-semibold"> Lynkless</span>
        </p>
        <div className="mt-4 flex justify-center gap-6">
          <Link href="/" className="text-xs text-[#a1a1aa] hover:text-[#ededed] transition-colors">
            Go to App
          </Link>
          <a
            href="https://github.com/Sathvik-Nagesh/Lynkless"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#a1a1aa] hover:text-[#ededed] transition-colors"
          >
            GitHub
          </a>
        </div>
      </footer>
    </main>
  );
}
