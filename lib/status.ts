import type { AlertStatus } from "./trip";

export const STATUS: Record<AlertStatus, { label: string; color: string }> = {
  waiting: { label: "Waiting", color: "#6b7280" },
  alerted: { label: "Officer alerted", color: "#f59e0b" },
  cleared: { label: "Route is clear", color: "#16a34a" },
  heavy: { label: "Heavy traffic, expect delay", color: "#ea580c" },
  cannot: { label: "Officer can't clear", color: "#dc2626" },
  unanswered: { label: "No answer, sent to control room", color: "#7c3aed" },
};
