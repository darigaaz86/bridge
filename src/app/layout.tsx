import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClientOnly } from "./client-only";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://qorebridge.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "QoreBridge – Cross-Chain USDC & USDT Bridge | Best Rates",
    template: "%s | QoreBridge",
  },
  description:
    "Bridge USDC and USDT across chains with the best rates. QoreBridge compares CCTP, LayerZero, and NEAR Intents for Ethereum, Arbitrum, Base & more.",
  keywords: [
    "cross-chain bridge",
    "USDC bridge",
    "USDT bridge",
    "stablecoin bridge",
    "QoreBridge",
    "CCTP",
    "LayerZero",
    "multi-chain",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "QoreBridge",
    title: "QoreBridge – Cross-Chain USDC & USDT Bridge",
    description:
      "Bridge USDC and USDT across chains with the best rates via CCTP, LayerZero, and NEAR Intents.",
  },
  twitter: {
    card: "summary_large_image",
    title: "QoreBridge – Cross-Chain USDC & USDT Bridge",
    description: "Bridge USDC and USDT with the best rates. Compare CCTP, LayerZero, NEAR Intents.",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "https://www.qore3.com/favicon-32x32-light.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "QoreBridge",
    description:
      "Bridge USDC and USDT across chains with the best rates via CCTP, LayerZero, and NEAR Intents.",
    url: SITE_URL,
    applicationCategory: "FinanceApplication",
  };

  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ClientOnly>{children}</ClientOnly>
      </body>
    </html>
  );
}
