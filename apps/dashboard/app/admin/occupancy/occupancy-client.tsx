"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { HistoryPoint, OccupancyHistory } from "@slugswap/occupancy";
import styles from "./occupancy.module.css";

const pacific = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});
const axisDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
  hour: "numeric",
});
const format = (value: string | null) =>
  value ? pacific.format(new Date(value)) : "No observation yet";

export default function OccupancyClient({
  facilities,
}: {
  facilities: ReadonlyArray<{ id: string; name: string }>;
}) {
  const [facilityId, setFacilityId] = useState(facilities[0].id);
  const [days, setDays] = useState(7);
  const [refresh, setRefresh] = useState(0);
  const [history, setHistory] = useState<OccupancyHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HistoryPoint | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSelected(null);
    setHistory(null);
    fetch(`/api/admin/occupancy?facility=${facilityId}&days=${days}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.status === 401)
          throw new Error(
            "Your admin session expired. Sign in again to view history.",
          );
        if (!response.ok)
          throw new Error(
            "History could not load. Try refreshing in a moment.",
          );
        return response.json() as Promise<OccupancyHistory>;
      })
      .then(setHistory)
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [facilityId, days, refresh]);

  const points = history?.points ?? [];
  const valid = points.filter((p) => p.occupancy !== null);
  const latest = valid.at(-1);
  const due = points.filter(
    (p) => p.status !== "pending" && p.status !== "running",
  );
  const coverage = due.length
    ? Math.round((valid.length / due.length) * 100)
    : null;
  const peak = valid.length
    ? Math.max(...valid.map((p) => p.occupancy!))
    : null;
  const unchanged =
    valid.length >= 4 && valid.every((p) => p.occupancy === valid[0].occupancy);
  const stale = latest?.fetchedAt
    ? Date.now() - new Date(latest.fetchedAt).getTime() > 75 * 60 * 1000
    : false;
  const facilityName = facilities.find((f) => f.id === facilityId)?.name;

  const chart = useMemo(() => {
    if (!history) return null;
    const width = 1000,
      height = 310,
      left = 48,
      right = 20,
      top = 28,
      bottom = 48;
    const from = new Date(history.from).getTime(),
      to = new Date(history.to).getTime();
    const observations = history.points.filter((p) => p.occupancy !== null);
    const maxCount = Math.max(1, ...observations.map((p) => p.occupancy!));
    const roughStep = Math.max(1, maxCount / 4);
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const step =
      [1, 2, 5, 10].find((n) => n * magnitude >= roughStep)! * magnitude;
    const yMax = step * 4;
    const x = (date: string) =>
      left +
      ((new Date(date).getTime() - from) / (to - from)) *
        (width - left - right);
    const y = (count: number) =>
      top + (1 - count / yMax) * (height - top - bottom);
    // Separate paths at missing samples. Each short segment joins observations only.
    const segments: HistoryPoint[][] = [];
    let segment: HistoryPoint[] = [];
    for (const point of history.points) {
      if (point.occupancy === null) {
        if (segment.length) segments.push(segment);
        segment = [];
      } else segment.push(point);
    }
    if (segment.length) segments.push(segment);
    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      from,
      to,
      yMax,
      x,
      y,
      segments,
    };
  }, [history]);

  function exportCsv() {
    if (!history) return;
    const rows = [
      "facility_id,scheduled_at_utc,fetched_at_utc,reported_occupancy,capacity,status",
      ...history.points.map((p) =>
        [
          facilityId,
          p.slot,
          p.fetchedAt ?? "",
          p.occupancy ?? "",
          p.capacity ?? "",
          p.status,
        ].join(","),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `occupancy-${facilityId}-${days}days.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/admin">← Dashboard</Link>
        <span>SLUGSWAP / OBSERVATIONS</span>
      </nav>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>UCSC ATHLETICS & RECREATION</p>
          <h1>How busy is campus?</h1>
          <p className={styles.intro}>
            Facility occupancy, observed every half hour.
          </p>
        </div>
        <a
          href="https://campusrec.ucsc.edu/FacilityOccupancy"
          target="_blank"
          rel="noreferrer"
        >
          View UCSC source ↗
        </a>
      </header>
      <section className={styles.controls} aria-label="History controls">
        <label>
          FACILITY
          <select
            value={facilityId}
            onChange={(e) => setFacilityId(e.target.value)}
          >
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.ranges} aria-label="Date range">
          {[1, 7, 30].map((n) => (
            <button
              key={n}
              aria-pressed={days === n}
              onClick={() => setDays(n)}
            >
              {n === 1 ? "24 hours" : `${n} days`}
            </button>
          ))}
        </div>
        <button
          className={styles.refresh}
          disabled={loading}
          onClick={() => setRefresh((n) => n + 1)}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </section>
      {error && (
        <div role="alert" className={styles.notice}>
          {error} <Link href="/admin/login">Sign in</Link>
        </div>
      )}
      <section className={styles.chartPanel} aria-busy={loading}>
        <div className={styles.chartTitle}>
          <div>
            <p className={styles.eyebrow}>REPORTED OCCUPANCY</p>
            <h2>{facilityName}</h2>
          </div>
          <span>Pacific time · 30 min samples</span>
        </div>
        <div className={styles.metrics}>
          <div>
            <span>Last reported</span>
            <strong>
              {latest?.occupancy ?? "—"}
              <small>{latest?.capacity ? ` / ${latest.capacity}` : ""}</small>
            </strong>
          </div>
          <div>
            <span>Peak in this view</span>
            <strong>{peak ?? "—"}</strong>
          </div>
          <div>
            <span>Collection coverage</span>
            <strong>{coverage === null ? "—" : `${coverage}%`}</strong>
          </div>
        </div>
        {loading ? (
          <div className={styles.empty} role="status">
            Loading observations…
          </div>
        ) : !valid.length ? (
          <div className={styles.empty}>
            <strong>
              {error ? "History unavailable" : "Waiting for observations"}
            </strong>
            <p>
              {points.length
                ? "No valid counts were recorded in this window. Missing readings are never treated as zero."
                : "The first successful collection will appear here. History builds from the time recording starts."}
            </p>
          </div>
        ) : (
          chart && (
            <>
              <div className={styles.chartScroll}>
                <svg
                  className={styles.chart}
                  viewBox={`0 0 ${chart.width} ${chart.height}`}
                  role="img"
                  aria-label={`${facilityName}: reported occupancy over ${days} days. ${valid.length} samples. Peak ${peak}. Detailed readings are below.`}
                >
                  <title>{facilityName} occupancy observations</title>
                  {[0, 1, 2, 3, 4].map((tick) => {
                    const value = (chart.yMax * tick) / 4;
                    return (
                      <g key={tick}>
                        <line
                          x1={chart.left}
                          x2={chart.width - chart.right}
                          y1={chart.y(value)}
                          y2={chart.y(value)}
                          stroke="#dddcd3"
                          strokeDasharray={tick ? "3 5" : undefined}
                        />
                        <text
                          x={chart.left - 12}
                          y={chart.y(value) + 4}
                          textAnchor="end"
                          className={styles.axis}
                        >
                          {Number(value.toFixed(1))}
                        </text>
                      </g>
                    );
                  })}
                  {history?.collectionStartedAt &&
                    new Date(history.collectionStartedAt).getTime() >
                      chart.from && (
                      <g>
                        <rect
                          x={chart.left}
                          y={chart.top}
                          width={Math.max(
                            0,
                            Math.min(
                              chart.width - chart.right,
                              chart.x(history.collectionStartedAt),
                            ) - chart.left,
                          )}
                          height={chart.height - chart.top - chart.bottom}
                          fill="#e9e7df"
                          opacity=".6"
                        />
                        <text
                          x={chart.left + 14}
                          y={chart.top + 22}
                          className={styles.axis}
                        >
                          Recording had not started
                        </text>
                      </g>
                    )}
                  {chart.segments.map((segment, i) => (
                    <path
                      key={i}
                      d={segment
                        .map(
                          (p, n) =>
                            `${n ? "L" : "M"}${chart.x(p.fetchedAt ?? p.slot)},${chart.y(p.occupancy!)}`,
                        )
                        .join(" ")}
                      fill="none"
                      stroke="#205c49"
                      strokeWidth="2.5"
                    />
                  ))}
                  {valid.map((p) => (
                    <circle
                      key={p.slot}
                      cx={chart.x(p.fetchedAt ?? p.slot)}
                      cy={chart.y(p.occupancy!)}
                      r={selected?.slot === p.slot ? 5 : 3}
                      fill="#205c49"
                      onMouseEnter={() => setSelected(p)}
                    >
                      <title>
                        {format(p.fetchedAt)}: {p.occupancy} / {p.capacity}
                      </title>
                    </circle>
                  ))}
                  {[0, 1, 2, 3, 4].map((tick) => {
                    const t = chart.from + ((chart.to - chart.from) * tick) / 4;
                    return (
                      <text
                        key={tick}
                        x={chart.x(new Date(t).toISOString())}
                        y={chart.height - 14}
                        textAnchor={
                          tick === 0 ? "start" : tick === 4 ? "end" : "middle"
                        }
                        className={styles.axis}
                      >
                        {axisDate.format(new Date(t))}
                      </text>
                    );
                  })}
                </svg>
              </div>
              <p className={styles.readout} aria-live="polite">
                {selected
                  ? `${format(selected.fetchedAt)} · ${selected.occupancy} reported occupants · capacity ${selected.capacity}`
                  : `${valid.length} ${valid.length === 1 ? "observation" : "observations"} · Last fetched ${format(latest?.fetchedAt ?? null)}`}
              </p>
            </>
          )
        )}
        <div className={styles.chartFooter}>
          <span>
            <i /> Reported count{" "}
            <span className={styles.gap}>Gaps = unavailable observations</span>
          </span>
          <button disabled={!valid.length} onClick={exportCsv}>
            Download CSV ↓
          </button>
        </div>
      </section>
      {(stale || unchanged) && (
        <p className={styles.notice}>
          {stale
            ? "The latest valid observation is over 75 minutes old. Collection may be interrupted."
            : "All recorded counts in this view are identical. This alone does not establish whether UCSC is updating the source."}
        </p>
      )}
      <section className={styles.context}>
        <div>
          <p className={styles.eyebrow}>ABOUT THESE READINGS</p>
          <p>
            These are snapshots of what UCSC reports, not independently measured
            attendance. UCSC does not provide a source update timestamp.
            “Fetched” means when we read the page.
          </p>
        </div>
        <div>
          <p className={styles.eyebrow}>RECORDING WINDOW</p>
          <p>
            {history?.collectionStartedAt
              ? `Started ${format(history.collectionStartedAt)}. Earlier history is unavailable.`
              : "Recording starts with the first collection."}{" "}
            All times use America/Los_Angeles.
          </p>
        </div>
      </section>
      {!!points.length && (
        <details className={styles.details}>
          <summary>Inspect readings ({points.length})</summary>
          <div className={styles.tableScroll}>
            <table>
              <thead>
                <tr>
                  <th>Scheduled (Pacific)</th>
                  <th>Fetched (Pacific)</th>
                  <th>Count</th>
                  <th>Capacity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...points].reverse().map((p) => (
                  <tr key={p.slot} onMouseEnter={() => setSelected(p)}>
                    <td>{format(p.slot)}</td>
                    <td>{p.fetchedAt ? format(p.fetchedAt) : "—"}</td>
                    <td>{p.occupancy ?? "—"}</td>
                    <td>{p.capacity ?? "—"}</td>
                    <td>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </main>
  );
}
