"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const Providers = dynamic(
  () => import("./providers").then((m) => ({ default: m.Providers })),
  { ssr: false }
);

export function ClientOnly({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
