import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bridge History",
  description:
    "View your QoreBridge transaction history, track cross-chain USDC and USDT transfers, and manage pending or failed bridges.",
};

export default function HistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
