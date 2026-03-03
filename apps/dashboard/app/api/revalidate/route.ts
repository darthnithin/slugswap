import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const path = searchParams.get("path") ?? "/";

  if (!process.env.REVALIDATE_SECRET) {
    return Response.json(
      { error: "Revalidation secret is not configured" },
      { status: 500 }
    );
  }

  if (!secret || secret !== process.env.REVALIDATE_SECRET) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
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
