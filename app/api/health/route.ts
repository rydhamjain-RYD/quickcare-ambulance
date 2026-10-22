import { get, put, storageKind } from "@/lib/store";
import { TEST_MODE } from "@/lib/testMode";

/**
 * Which storage is this server really using, and does it work? Safe to leave public: it shows no
 * secrets and no values. It reports "supabase" or "memory", whether a small test value can be saved
 * and read back, and (names only) which Supabase settings the server can see, to help fix a
 * misconfigured deployment.
 */
export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const out: {
    storage: "supabase" | "memory";
    testMode: boolean;
    roundTrip: "ok" | "failed";
    environment?: string;
    settings: { SUPABASE_URL: "set" | "missing" | "empty"; SUPABASE_SECRET_KEY: "set" | "missing" | "empty" | "still the placeholder"; supabaseVariableNamesSeen: string[] };
    error?: string;
  } = {
    storage: storageKind,
    testMode: TEST_MODE,
    roundTrip: "failed",
    environment: process.env.VERCEL_ENV,
    settings: {
      SUPABASE_URL: url === undefined ? "missing" : url.trim() === "" ? "empty" : "set",
      SUPABASE_SECRET_KEY: key === undefined ? "missing" : key.trim() === "" ? "empty" : key.startsWith("PASTE") ? "still the placeholder" : "set",
      supabaseVariableNamesSeen: Object.keys(process.env).filter((k) => /supabase/i.test(k)),
    },
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
