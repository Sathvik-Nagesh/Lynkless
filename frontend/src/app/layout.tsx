import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/ToastProvider";

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Lynkless — P2P File Transfer & Chat",
  description: "Your files don't belong in the cloud. Transfer files and chat directly between browsers using WebRTC. Zero storage, complete privacy.",
  keywords: ["file transfer", "P2P", "WebRTC", "chat", "privacy", "secure", "no cloud"],
  authors: [{ name: "Lynkless" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Lynkless",
  },
  openGraph: {
    title: "Lynkless — P2P File Transfer & Chat",
    description: "Your files don't belong in the cloud. Transfer files and chat directly between browsers.",
    type: "website",
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#3B82F6" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body
        className={`${inter.variable} antialiased`}
      >
        <ErrorBoundary>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
