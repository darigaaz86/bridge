"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  loadSettings,
  saveSettings,
  getDefaultSettings,
  type BridgeSettings,
} from "@/lib/bridgeSettings";
import { BridgeSettingsPopout } from "@/components/BridgeSettingsPopout";

interface BridgeSettingsContextValue {
  settings: BridgeSettings;
  updateSettings: (partial: Partial<BridgeSettings>) => void;
  resetSettings: () => void;
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

const BridgeSettingsContext = createContext<BridgeSettingsContextValue | null>(
  null
);

export function BridgeSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<BridgeSettings>(getDefaultSettings);
  const [hydrated, setHydrated] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveSettings(settings);
  }, [settings, hydrated]);

  const updateSettings = useCallback((partial: Partial<BridgeSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(getDefaultSettings());
  }, []);

  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  return (
    <BridgeSettingsContext.Provider
      value={{
        settings,
        updateSettings,
        resetSettings,
        isSettingsOpen,
        openSettings,
        closeSettings,
      }}
    >
      {children}
      <BridgeSettingsPopout />
    </BridgeSettingsContext.Provider>
  );
}

export function useBridgeSettings(): BridgeSettingsContextValue {
  const ctx = useContext(BridgeSettingsContext);
  if (!ctx) {
    throw new Error("useBridgeSettings must be used within BridgeSettingsProvider");
  }
  return ctx;
}
