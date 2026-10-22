import { get, put, storageKind } from "@/lib/store";
import { TEST_MODE } from "@/lib/testMode";

/**
 * Which storage is this server really using, and does it work? Safe to leave public: it shows no
 * secrets, only "supabase" or "memory", and whether a small test value can be saved and read back.
 */
export async function GET() {
  const out: { storage: "supabase" | "memory"; testMode: boolean; roundTrip: "ok" | "failed"; error?: string } = {
    storage: storageKind,
    testMode: TEST_MODE,
    roundTrip: "failed",
  };
  try {
    const stamp = String(Date.now());
    await put("health:ping", stamp, { ttlSec: 60 });
    const back = await get<string>("health:ping");
    out.roundTrip = back?.value === stamp ? "ok" : "failed";
  } catch (e) {
    out.error = (e as Error).message.slice(0, 160);
  }
  return Response.json(out, { status: out.roundTrip === "ok" ? 200 : 503 });
}
