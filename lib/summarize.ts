import type { Trip } from "./trip";

const SEVERITIES = ["critical", "serious", "stable", "unclear"] as const;

/**
 * Turns the driver's free-text note into a severity and a two-line summary for the hospital.
 * Never throws: on any problem the note is returned as written with aiOk = false,
 * so the hospital page shows the raw text and says there is no AI summary.
 */
export async function summarizeNote(raw: string): Promise<NonNullable<Trip["note"]>> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.startsWith("PASTE")) return { raw, aiOk: false };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        model: "claude-haiku-5-5",
        max_tokens: 300,
        system:
          "You help a hospital prepare for an incoming ambulance. The note is written by an ambulance crew in any mix of English, Hindi and Kannada, possibly misspelled. " +
          'Reply with ONLY JSON: {"severity":"critical|serious|stable|unclear","summary":"two short lines in English","confidence":0-1}. ' +
          "Use only facts in the note. Never invent details. If the note is too vague, use severity unclear.",
        messages: [{ role: "user", content: raw }],
      }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    const text: string = data.content?.[0]?.text ?? "";
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const severity = SEVERITIES.includes(parsed.severity) ? parsed.severity : "unclear";
    if (typeof parsed.summary !== "string" || !parsed.summary.trim()) throw new Error("no summary");
    // Low confidence is shown as "unclear" rather than a guess.
    const low = typeof parsed.confidence === "number" && parsed.confidence < 0.6;
    return { raw, aiOk: true, severity: low ? "unclear" : severity, summary: parsed.summary.trim() };
  } catch {
    return { raw, aiOk: false };
  }
}
