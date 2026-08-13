import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type UpdateChannel = "stable" | "experimental";
export type UpdateStatus = "idle" | "checking" | "up_to_date" | "update_available" | "offline" | "github_unavailable" | "repository_inaccessible" | "invalid_response" | "timeout";
export type UpdateRelease = { version: string; tag: string; title: string; notes: string; url: string; assetUrl: string | null; prerelease: boolean; publishedAt: string | null };
export type UpdateCheckResult = { status: Exclude<UpdateStatus, "idle" | "checking">; installedVersion: string; checkedAt: number; message: string; release: UpdateRelease | null };
type StoredUpdates = { automatic: boolean; channel: UpdateChannel; lastResult: UpdateCheckResult | null; snoozedVersion: string | null; snoozedUntil: number };
type UpdateContextValue = StoredUpdates & { installedVersion: string; status: UpdateStatus; bannerVisible: boolean; setAutomatic: (enabled: boolean) => void; setChannel: (channel: UpdateChannel) => void; check: () => Promise<void>; closeBanner: () => void; remindLater: () => void; openRelease: () => Promise<void> };

const STORAGE_KEY = "novaai-code:updates";
const TWELVE_HOURS = 12 * 60 * 60 * 1_000;
const UpdateContext = createContext<UpdateContextValue | null>(null);
let pendingCheck: Promise<UpdateCheckResult> | null = null;
let automaticStartupCheckStarted = false;

function loadStored(): StoredUpdates {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<StoredUpdates>;
    return { automatic: value.automatic !== false, channel: value.channel === "experimental" ? "experimental" : "stable", lastResult: value.lastResult ?? null, snoozedVersion: value.snoozedVersion ?? null, snoozedUntil: Number.isFinite(value.snoozedUntil) ? value.snoozedUntil! : 0 };
  } catch {
    return { automatic: true, channel: "stable", lastResult: null, snoozedVersion: null, snoozedUntil: 0 };
  }
}

function officialReleaseUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" && url.pathname.startsWith("/Oliver494/novaai-code/releases/") && !url.username && !url.password;
  } catch { return false; }
}

function request(channel: UpdateChannel) {
  if (!pendingCheck) pendingCheck = invoke<UpdateCheckResult>("check_for_updates", { channel }).finally(() => { pendingCheck = null; });
  return pendingCheck;
}

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState(loadStored);
  const [installedVersion, setInstalledVersion] = useState(stored.lastResult?.installedVersion ?? "…");
  const [status, setStatus] = useState<UpdateStatus>(stored.lastResult?.status ?? "idle");
  const [bannerClosed, setBannerClosed] = useState(false);
  useEffect(() => { getVersion().then(setInstalledVersion).catch(() => undefined); }, []);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); }, [stored]);

  const runCheck = useCallback(async () => {
    setStatus("checking");
    try {
      const checked = await request(stored.channel);
      setInstalledVersion(checked.installedVersion);
      setStatus(checked.status);
      setBannerClosed(false);
      setStored((current) => ({ ...current, lastResult: checked, snoozedVersion: current.snoozedVersion === checked.release?.version ? current.snoozedVersion : null, snoozedUntil: current.snoozedVersion === checked.release?.version ? current.snoozedUntil : 0 }));
    } catch {
      const fallback: UpdateCheckResult = { status: "github_unavailable", installedVersion, checkedAt: Date.now(), message: "No se pudo comprobar GitHub.", release: null };
      setStatus(fallback.status);
      setStored((current) => ({ ...current, lastResult: fallback }));
    }
  }, [installedVersion, stored.channel]);

  useEffect(() => {
    if (!stored.automatic) return;

    // Always perform one fresh check per application launch. A cached result may
    // come from a temporary offline/private-repository failure and must not keep
    // automatic notifications silent for the whole polling interval.
    if (!automaticStartupCheckStarted) {
      automaticStartupCheckStarted = true;
      void runCheck();
      return;
    }

    // Once the launch check finishes, continue polling every twelve hours while
    // the application remains open.
    if (!stored.lastResult?.checkedAt) return;
    const elapsed = Date.now() - (stored.lastResult?.checkedAt ?? 0);
    const delay = Math.max(0, TWELVE_HOURS - elapsed);
    if (delay === 0) {
      void runCheck();
      return;
    }
    const timer = window.setTimeout(() => void runCheck(), delay);
    return () => window.clearTimeout(timer);
  }, [runCheck, stored.automatic, stored.lastResult?.checkedAt]);

  const release = stored.lastResult?.release ?? null;
  const bannerVisible = status === "update_available" && !!release && !bannerClosed && !(stored.snoozedVersion === release.version && stored.snoozedUntil > Date.now());
  const value = useMemo<UpdateContextValue>(() => ({
    ...stored, installedVersion, status, bannerVisible,
    setAutomatic: (automatic) => setStored((current) => ({ ...current, automatic })),
    setChannel: (channel) => { setStatus("idle"); setStored((current) => ({ ...current, channel, lastResult: null })); },
    check: runCheck,
    closeBanner: () => setBannerClosed(true),
    remindLater: () => { if (release) setStored((current) => ({ ...current, snoozedVersion: release.version, snoozedUntil: Date.now() + TWELVE_HOURS })); },
    openRelease: async () => { if (release && officialReleaseUrl(release.url)) await openUrl(release.url); },
  }), [bannerVisible, installedVersion, release, runCheck, status, stored]);
  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useUpdates() {
  const value = useContext(UpdateContext);
  if (!value) throw new Error("UpdateProvider is missing");
  return value;
}
