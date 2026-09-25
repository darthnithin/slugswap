import { load } from "cheerio/slim";
import { neon } from "@neondatabase/serverless";

export const SOURCE_URL = "https://campusrec.ucsc.edu/FacilityOccupancy";
export const INTERVAL_MS = 30 * 60 * 1000;
export const PARSER_VERSION = "1";
export const FACILITIES = [
  { id: "1799266f-57d9-4cb2-9f43-f5fd88b241db", name: "Fitness Center" },
  { id: "6b4acca4-485d-44f9-93c7-391a7526e3fc", name: "Slug Shed" },
  { id: "6b74539d-7ad2-4aa5-92c5-471f9fcccdea", name: "EFH Pool" },
  { id: "bd6cf7a0-9924-4821-84d7-5a995cc63081", name: "East Gym" },
  { id: "dce84fd0-83b4-4dbc-8f0e-5b614adf3f88", name: "West Field House" },
  { id: "6337894d-9b88-4872-add3-c29f783055c2", name: "East Upper Field" },
  { id: "ec7c38a4-d9f9-4927-921e-d8ea535d65e1", name: "Dance Studio" },
  {
    id: "6039ee11-7628-462d-90cc-0b1fe270acf5",
    name: "East Outdoor Basketball Courts",
  },
  { id: "1098ccf3-e5cf-4aef-9784-c08ac8b4c761", name: "East Sand Courts" },
  { id: "103db41b-752c-48d9-8b1e-37ca68533896", name: "Martial Arts Studio" },
  { id: "7d404b3f-71f1-4e67-bb4a-b2e9f149a1f9", name: "West Sand Courts" },
  { id: "4b226085-b0ba-4de9-a769-1d8109fbb30f", name: "West Tennis Courts" },
  { id: "dfb62bb2-fa44-43f7-886d-9ba4f958d695", name: "East Tennis Courts" },
  { id: "f0b846c9-23ba-445c-b04f-6238f7d4ad31", name: "Activities Room" },
  {
    id: "55ebd01f-4fc6-443b-b3dc-4ff64929dd75",
    name: "West Outdoor Basketball Courts",
  },
] as const;

export type Sample = {
  facilityId: string;
  status: "ok" | "missing" | "invalid";
  occupancy: number | null;
  capacity: number | null;
  ratio: number | null;
  error: string | null;
};

function numberAttribute(value: string | undefined, integer = false): number {
  if (value === undefined || value.trim() === "")
    throw new Error("Missing numeric attribute");
  const number = Number(value);
  if (!Number.isFinite(number) || (integer && !Number.isSafeInteger(number))) {
    throw new Error("Invalid numeric attribute");
  }
  return number;
}

export function parseOccupancy(html: string): Sample[] {
  const $ = load(html);
  if (!$("[data-facilityid]").length)
    throw new Error("No facility cards in response");
  return FACILITIES.map(({ id }) => {
    const empty = {
      facilityId: id,
      occupancy: null,
      capacity: null,
      ratio: null,
    };
    const card = $(`[data-facilityid="${id}"]`);
    if (!card.length)
      return {
        ...empty,
        status: "missing",
        error: "Facility missing from source",
      };
    try {
      if (card.length !== 1) throw new Error("Duplicate facility cards");
      // UCSC repeats each canvas for desktop and mobile. They must agree.
      const canvases = card.find("canvas.occupancy-chart");
      if (!canvases.length) throw new Error("Occupancy canvas missing");
      const readings = canvases.toArray().map((canvas) => {
        const node = $(canvas);
        const occupancy = numberAttribute(node.attr("data-occupancy"), true);
        const remaining = numberAttribute(node.attr("data-remaining"), true);
        const ratio = numberAttribute(node.attr("data-ratio"));
        const capacity = occupancy + remaining;
        if (
          occupancy < 0 ||
          capacity <= 0 ||
          !Number.isSafeInteger(capacity) ||
          ratio < 0
        ) {
          throw new Error("Invalid count, capacity, or ratio");
        }
        // Ratios are rounded to two decimals by UCSC. Over-capacity counts are retained.
        if (Math.abs(ratio - occupancy / capacity) > 0.011)
          throw new Error("Count and ratio disagree");
        return { occupancy, capacity, ratio };
      });
      if (
        readings.some((r) => JSON.stringify(r) !== JSON.stringify(readings[0]))
      ) {
        throw new Error("Desktop and mobile readings disagree");
      }
      return { facilityId: id, ...readings[0], status: "ok", error: null };
    } catch (error) {
      return {
        ...empty,
        status: "invalid",
        error: error instanceof Error ? error.message : "Invalid card",
      };
    }
  });
}

export function slotFor(date: Date): Date {
  return new Date(Math.floor(date.getTime() / INTERVAL_MS) * INTERVAL_MS);
}

export async function fetchOccupancy(fetcher: typeof fetch = fetch) {
  let failure = "Source request failed";
  let httpStatus: number | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher(SOURCE_URL, {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: {
          Accept: "text/html",
          "User-Agent": "SlugSwap-Occupancy/1.0",
        },
      });
      httpStatus = response.status;
      if (!response.ok) {
        failure = `Source returned HTTP ${response.status}`;
        if (response.status !== 429 && response.status < 500) break;
      } else {
        const html = await response.text();
        if (html.length > 2_000_000)
          throw new Error("Unexpected response size");
        const fetchedAt = new Date();
        try {
          return {
            samples: parseOccupancy(html),
            fetchedAt,
            httpStatus,
            error: null,
          };
        } catch (error) {
          return {
            samples: [],
            fetchedAt,
            httpStatus,
            error: error instanceof Error ? error.message : "Parse failed",
          };
        }
      }
    } catch {
      failure = "Source timed out or could not be read";
    }
    if (attempt === 0)
      await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return { samples: [], fetchedAt: null, httpStatus, error: failure };
}

export async function collectOccupancy(
  databaseUrl: string,
  fetcher: typeof fetch = fetch,
) {
  const sql = neon(databaseUrl);
  const slot = slotFor(new Date()).toISOString();
  const attemptId = crypto.randomUUID();
  // Reclaim only failed/abandoned runs. Never overwrite a completed observation.
  const claimed = await sql`
    INSERT INTO occupancy_collection_runs (slot, attempt_id, status, started_at, parser_version)
    VALUES (${slot}, ${attemptId}, 'running', now(), ${PARSER_VERSION})
    ON CONFLICT (slot) DO UPDATE SET attempt_id = EXCLUDED.attempt_id,
      status = 'running', started_at = now(), finished_at = NULL, error = NULL
    WHERE occupancy_collection_runs.status = 'failed'
      OR (occupancy_collection_runs.status = 'running' AND occupancy_collection_runs.started_at < now() - interval '3 minutes')
    RETURNING slot`;
  if (!claimed.length) return { status: "duplicate", slot, recorded: 0 };
  const result = await fetchOccupancy(fetcher);
  const recorded = result.samples.filter((s) => s.status === "ok").length;
  const status =
    recorded === FACILITIES.length
      ? "success"
      : recorded
        ? "partial"
        : "failed";
  const rows = JSON.stringify(result.samples);
  const fetchedAt = result.fetchedAt?.toISOString() ?? null;
  await sql.transaction([
    sql`INSERT INTO facility_occupancy_samples (slot, facility_id, status, occupancy, capacity, ratio, error)
      SELECT r.slot, s."facilityId"::uuid, s.status, s.occupancy, s.capacity, s.ratio, s.error
      FROM jsonb_to_recordset(${rows}::jsonb) AS s("facilityId" text, status text, occupancy integer, capacity integer, ratio double precision, error text)
      JOIN occupancy_collection_runs r ON r.slot = ${slot}::timestamptz AND r.attempt_id = ${attemptId}::uuid
      ON CONFLICT (slot, facility_id) DO UPDATE SET status = EXCLUDED.status,
        occupancy = EXCLUDED.occupancy, capacity = EXCLUDED.capacity, ratio = EXCLUDED.ratio, error = EXCLUDED.error`,
    sql`UPDATE occupancy_collection_runs SET status = ${status}, fetched_at = ${fetchedAt},
      finished_at = now(), http_status = ${result.httpStatus}, error = ${result.error}
      WHERE slot = ${slot} AND attempt_id = ${attemptId}`,
  ]);
  return { status, slot, recorded, fetchedAt, error: result.error };
}

export type HistoryPoint = {
  slot: string;
  fetchedAt: string | null;
  occupancy: number | null;
  capacity: number | null;
  status: string;
};
export type OccupancyHistory = {
  facilityId: string;
  days: number;
  from: string;
  to: string;
  collectionStartedAt: string | null;
  lastFetchedAt: string | null;
  points: HistoryPoint[];
};

export async function getOccupancyHistory(
  databaseUrl: string,
  facilityId: string,
  days: number,
): Promise<OccupancyHistory> {
  if (
    !FACILITIES.some((f) => f.id === facilityId) ||
    ![1, 7, 30].includes(days)
  )
    throw new Error("Invalid history query");
  const sql = neon(databaseUrl);
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const [meta, rows] = await Promise.all([
    sql`SELECT min(slot) AS first_slot, min(started_at) AS collection_started_at,
      max(fetched_at) FILTER (WHERE status IN ('success', 'partial')) AS last_fetched_at
      FROM occupancy_collection_runs`,
    sql`SELECT r.slot, r.fetched_at, r.status AS run_status, s.status, s.occupancy, s.capacity
      FROM occupancy_collection_runs r LEFT JOIN facility_occupancy_samples s
        ON s.slot = r.slot AND s.facility_id = ${facilityId}::uuid
      WHERE r.slot >= ${slotFor(from).toISOString()} AND r.slot <= ${to.toISOString()}
      ORDER BY r.slot`,
  ]);
  const iso = (value: unknown) =>
    value ? new Date(String(value)).toISOString() : null;
  const bySlot = new Map(rows.map((r) => [iso(r.slot), r]));
  const first = iso(meta[0]?.first_slot);
  const points: HistoryPoint[] = [];
  // Do not invent missing collections before recording actually began.
  if (first) {
    const start = Math.max(slotFor(from).getTime(), new Date(first).getTime());
    for (let t = start; t <= slotFor(to).getTime(); t += INTERVAL_MS) {
      const slot = new Date(t).toISOString();
      const r = bySlot.get(slot);
      const isCurrent = t === slotFor(to).getTime();
      points.push({
        slot,
        fetchedAt: iso(r?.fetched_at),
        occupancy: r?.status === "ok" ? Number(r.occupancy) : null,
        capacity: r?.status === "ok" ? Number(r.capacity) : null,
        status:
          r?.status ?? r?.run_status ?? (isCurrent ? "pending" : "missed"),
      });
    }
  }
  return {
    facilityId,
    days,
    from: slotFor(from).toISOString(),
    to: to.toISOString(),
    collectionStartedAt: iso(meta[0]?.collection_started_at),
    lastFetchedAt: iso(meta[0]?.last_fetched_at),
    points,
  };
}
