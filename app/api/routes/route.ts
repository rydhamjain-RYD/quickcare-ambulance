import { planRoutes, RoutingError } from "@/lib/routing";

type Point = { lat: number; lng: number };
const valid = (p: unknown): p is Point =>
  !!p && typeof (p as Point).lat === "number" && typeof (p as Point).lng === "number";

export async function POST(request: Request) {
  let body: { from?: unknown; to?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send JSON with from and to." }, { status: 400 });
  }
  if (!valid(body.from) || !valid(body.to)) {
    return Response.json({ error: "Both a start point and a hospital are needed." }, { status: 400 });
  }
  try {
    return Response.json(await planRoutes(body.from, body.to));
  } catch (e) {
    const status = e instanceof RoutingError ? 502 : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
