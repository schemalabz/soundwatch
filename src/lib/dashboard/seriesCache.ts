// The hourly series behind the comparison and a place's period detail.
//
// Both ask /api/series for bucket=1h with the rail's filters, for one place
// or for the whole network, and often for the same thing: the network line
// is in every comparison and under every opened place. Two things kept that
// from being cheap:
//
//   - With a trailing period («last 7 days») the query's from= moves every
//     minute, so each minute looked like new filters: everything dropped to
//     skeletons and was fetched again, for an answer that cannot differ (the
//     server floors from= to the bucket, an hour here). hourStableQuery
//     floors it up front, so the key only changes when the answer can.
//   - Nothing was shared, so the network series was fetched once per section
//     and again per opened place. fetchHourlySeries shares one request per
//     URL, briefly.
//
// A failed request is dropped from the cache, so the next ask tries again.

import type { SeriesResponse } from "@/lib/api/dashboard";

const HOUR_MS = 3_600_000;
// Long enough to share a request across the sections on screen, short enough
// that a place reopened later is not shown an old period.
const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 32;

/** The aggregate query with from= floored to the hour: the same string for
 *  as long as an hourly series for it would be the same. */
export function hourStableQuery(aggQuery: string): string {
  const params = new URLSearchParams(aggQuery);
  const from = Number(params.get("from"));
  if (params.has("from") && Number.isFinite(from)) params.set("from", String(Math.floor(from / HOUR_MS) * HOUR_MS));
  return params.toString();
}

const cache = new Map<string, { at: number; promise: Promise<SeriesResponse> }>();

/** The hourly series for a query (as from hourStableQuery), of one sensor or,
 *  without one, of the whole network. Rejects on a network or HTTP error. */
export function fetchHourlySeries(stableQuery: string, sensorId?: string): Promise<SeriesResponse> {
  const url = `/api/series?${stableQuery}&bucket=1h${sensorId ? `&sensor=${sensorId}` : ""}`;
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && now - hit.at < TTL_MS) return hit.promise;
  const promise = fetch(url, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`/api/series answered ${r.status}`);
    return r.json() as Promise<SeriesResponse>;
  });
  promise.catch(() => {
    if (cache.get(url)?.promise === promise) cache.delete(url);
  });
  cache.delete(url);
  cache.set(url, { at: now, promise });
  // Map keeps insertion order: the first key is the oldest request.
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  return promise;
}
