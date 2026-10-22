import type { AlertStatus } from "./trip";

// Browser-safe: this file must not import anything that needs Node (it is used by client components).
export type HeavyReason = "accident" | "rain" | "congestion" | "other";
export const HEAVY_REASONS: HeavyReason[] = ["accident", "rain", "congestion", "other"];

export const STATUS: Record<AlertStatus, { label: string; color: string }> = {
  waiting: { label: "Waiting", color: "#64748b" },
  alerted: { label: "Officer alerted", color: "#d97706" },
  cleared: { label: "Route is clear", color: "#059669" },
  heavy: { label: "Heavy traffic", color: "#ea580c" },
  cannot: { label: "Officer can't clear", color: "#dc2626" },
  unanswered: { label: "No reply", color: "#7c3aed" },
};

export const REASON_LABEL: Record<HeavyReason, string> = {
  accident: "Accident",
  rain: "Rain / waterlogging",
  congestion: "Heavy congestion",
  other: "Other obstruction",
};
