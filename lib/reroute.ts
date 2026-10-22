import { planRoutes } from "./routing";
import { replaceRoute, setNotice, setRerouting, view } from "./trip";

/**
 * Called when an officer reports heavy traffic. Picks the fastest route that avoids every signal
 * reported as heavy or blocked ahead, and switches to it without asking the crew. The crew is told
 * afterwards through a notice. If no route avoids the problem, the crew stays on the current route.
 */
export async function autoReroute(cause: string, officerName: string): Promise<void> {
  const before = await view();
  if (!before || before.status !== "enroute") return;

  const avoid = before.alerts
    .filter((a) => (a.status === "heavy" || a.status === "cannot") && a.alongM > before.progressM)
    .map((a) => ({ lat: a.lat, lng: a.lng }));
  if (avoid.length === 0) return;

  await setRerouting(true);
  try {
    // Keep the same assumed time as the trip, so the new route is compared like for like.
    const at = before.route.trafficAt ? new Date(before.route.trafficAt) : undefined;
    const result = await planRoutes({ lat: before.position[1], lng: before.position[0] }, before.hospital, { avoid, at });
    if (result.options.length === 0) {
      await setNotice(`${cause} reported ahead by ${officerName}. No route avoids it, so you stay on the current route. Take extra care.`);
      return;
    }
    const best = result.options.reduce((a, b) => (b.durationS < a.durationS ? b : a));
    if (!(await replaceRoute(best))) return;

    const diffMin = Math.round((best.durationS - before.etaS) / 60);
    const change = diffMin === 0 ? "about the same time" : diffMin > 0 ? `${diffMin} min longer` : `${-diffMin} min shorter`;
    await setNotice(
      `${cause} reported ahead by ${officerName}. You were switched to a new route: ${Math.round(best.durationS / 60)} min, ${best.signals.length} signals (${change}).`,
    );
  } catch {
    await setNotice(`${cause} reported ahead by ${officerName}. Could not find another route automatically. Use "Find another route" or take extra care.`);
  } finally {
    await setRerouting(false);
  }
}
