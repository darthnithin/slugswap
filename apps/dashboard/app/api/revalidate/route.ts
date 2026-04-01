import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

function unauthorizedResponse() {
  return Response.json({ error: "Invalid credentials" }, { status: 401 });
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearerSecret =
    authHeader && authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
  const body = (await request.json().catch(() => ({}))) as {
    path?: string;
    secret?: string;
  };
  const secret = bearerSecret || body.secret || null;
  const path = body.path ?? "/";

  if (!process.env.REVALIDATE_SECRET) {
    return Response.json(
      { error: "Revalidation secret is not configured" },
      { status: 500 }
    );
  }

  if (!secret || secret !== process.env.REVALIDATE_SECRET) {
    return unauthorizedResponse();
  }

  if (!path.startsWith("/")) {
    return Response.json({ error: "Path must start with /" }, { status: 400 });
  }

  revalidatePath(path);

  return Response.json({
    revalidated: true,
    path,
    now: new Date().toISOString(),
  });
}
