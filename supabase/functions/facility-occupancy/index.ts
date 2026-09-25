import { collectOccupancy } from "../../../packages/occupancy/src/core.ts";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("OCCUPANCY_CRON_SECRET");
  if (!secret)
    return new Response("Collector is not configured", { status: 503 });
  // Custom authentication: do not accept a project's public anon key as authorization.
  const supplied = request.headers.get("authorization") ?? "";
  const digest = async (value: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    );
  const [a, b] = await Promise.all([
    digest(supplied),
    digest(`Bearer ${secret}`),
  ]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  if (difference !== 0) return new Response("Unauthorized", { status: 401 });
  const databaseUrl = Deno.env.get("OCCUPANCY_DATABASE_URL");
  if (!databaseUrl)
    return new Response("Collector is not configured", { status: 503 });
  try {
    const result = await collectOccupancy(databaseUrl);
    console.log(JSON.stringify(result));
    return Response.json(result, {
      status: result.status === "failed" ? 502 : 200,
    });
  } catch {
    console.error(
      "Occupancy collection failed; inspect the collection run and database availability.",
    );
    return Response.json({ error: "Collection failed" }, { status: 500 });
  }
});
