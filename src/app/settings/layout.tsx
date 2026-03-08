import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bridge Settings",
  description:
    "Configure QoreBridge fees, slippage, and polling intervals for cross-chain USDC and USDT transfers.",
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
