"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Bench demo view for the Soundwatch firmware: shows what the device actually
// measures (LAeq, statistical percentiles, third-octave spectrum, level
// distribution) arriving live in the database. The product dashboard renders the
// stock sensor fields only, where noiseDba is null under this firmware.

type Series = { t: string; laeq: number | null; l10: number | null; l50: number | null; l90: number | null; duty: number | null; frames: number | null };
type Latest = {
  recordedAt: string; receivedAt: string;
  laeq: number | null; l10: number | null; l50: number | null; l90: number | null;
  lmaxEst: number | null; lminEst: number | null;
  realizedDuty: number | null; frameCount: number | null; intervalS: number | null;
  histRaw: string | null; bandsDb: number[] | null;
};
type Device = { deviceId: string; lastSeenAt: string | null; count: number; latest: Latest | null; series: Series[] };
type Payload = { generatedAt: string; windowMinutes: number; devices: Device[] };

// Categorical slots 1-3 (blue / orange / aqua). Validated all-pairs in both
// modes; light-mode aqua is sub-3:1 on the surface, so every series is direct
// -labelled and a table view ships below — identity is never colour-alone.
const SERIES_VARS = ["--series-1", "--series-2", "--series-3"];

const BAND_LABELS = ["LOW", "250", "315", "400", "500", "630", "800", "1k", "1.25k", "1.6k", "2k", "2.5k", "3.15k", "4k", "5k", "6.3k", "8k", "10k", "12.5k", "16k", "20k"];
const HIST_BINS = 30;
const HIST_START_DB = 30;
const HIST_BIN_WIDTH = 2;

const fmt = (v: number | null | undefined, d = 1) => (v == null || Number.isNaN(v) ? "—" : v.toFixed(d));

export default function DemoPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/demo/live?minutes=30", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    // First poll deferred a microtask so the effect body itself never sets
    // state (react-hooks/set-state-in-effect).
    void Promise.resolve().then(load);
    if (paused) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load, paused]);

  const devices = data?.devices ?? [];

  return (
    <div className="viz-root">
      <style>{`
        .viz-root {
          color-scheme: light;
          --surface-1: #fcfcfb; --page: #f9f9f7;
          --text-primary: #0b0b0b; --text-secondary: #52514e; --muted: #898781;
          --grid: #e1e0d9; --axis: #c3c2b7; --border: rgba(11,11,11,0.10);
          --series-1: #2a78d6; --series-2: #eb6834; --series-3: #1baf7a;
          --good: #0ca30c; --critical: #d03b3b;
          background: var(--page); color: var(--text-primary);
          font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
          min-height: 100vh; padding: 24px;
        }
        @media (prefers-color-scheme: dark) {
          :root:where(:not([data-theme="light"])) .viz-root {
            color-scheme: dark;
            --surface-1: #1a1a19; --page: #0d0d0d;
            --text-primary: #ffffff; --text-secondary: #c3c2b7; --muted: #898781;
            --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
            --series-1: #3987e5; --series-2: #d95926; --series-3: #199e70;
          }
        }
        :root[data-theme="dark"] .viz-root {
          color-scheme: dark;
          --surface-1: #1a1a19; --page: #0d0d0d;
          --text-primary: #ffffff; --text-secondary: #c3c2b7; --muted: #898781;
          --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
          --series-1: #3987e5; --series-2: #d95926; --series-3: #199e70;
        }
        .viz-card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px; }
        .viz-h1 { font-size: 20px; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
        .viz-sub { color: var(--text-secondary); font-size: 13px; margin: 4px 0 0; }
        .viz-grid { display: grid; gap: 14px; }
        .viz-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
        .viz-hero { font-size: 40px; font-weight: 640; line-height: 1.05; letter-spacing: -0.02em; }
        .viz-unit { font-size: 15px; font-weight: 500; color: var(--text-secondary); margin-left: 4px; }
        .viz-kv { display: flex; justify-content: space-between; font-size: 13px; padding: 3px 0; }
        .viz-kv span:last-child { font-variant-numeric: tabular-nums; }
        .viz-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); }
        .viz-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
        table.viz-t { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        table.viz-t th, table.viz-t td { text-align: right; padding: 6px 8px; border-bottom: 1px solid var(--grid); font-variant-numeric: tabular-nums; }
        table.viz-t th:first-child, table.viz-t td:first-child { text-align: left; font-variant-numeric: normal; }
        table.viz-t th { color: var(--muted); font-weight: 550; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
        .viz-scroll { overflow-x: auto; }
        button.viz-btn { font: inherit; font-size: 12.5px; padding: 5px 11px; border-radius: 7px;
          border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); cursor: pointer; }
      `}</style>

      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <h1 className="viz-h1">Soundwatch — live acoustic measurement</h1>
          <p className="viz-sub">
            Bench fleet publishing over MQTT into postgres.{" "}
            {data ? `${devices.length} units · ${data.windowMinutes} min window · updated ${new Date(data.generatedAt).toLocaleTimeString()}` : "connecting…"}
            {error ? <span style={{ color: "var(--critical)" }}> · {error}</span> : null}
          </p>
        </div>
        <button className="viz-btn" onClick={() => setPaused((p) => !p)}>{paused ? "Resume" : "Pause"} auto-refresh</button>
      </header>

      <div className="viz-grid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(260px, 1fr))`, marginBottom: 14 }}>
        {devices.map((d, i) => <UnitCard key={d.deviceId} d={d} colorVar={SERIES_VARS[i % SERIES_VARS.length]} nowMs={data ? new Date(data.generatedAt).getTime() : null} />)}
      </div>

      <div className="viz-card" style={{ marginBottom: 14 }}>
        <LaeqChart devices={devices} />
      </div>

      <div className="viz-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", marginBottom: 14 }}>
        <div className="viz-card"><SpectrumChart devices={devices} /></div>
        <div className="viz-card"><HistogramPanel devices={devices} /></div>
      </div>

      <div className="viz-card">
        <div className="viz-label" style={{ marginBottom: 10 }}>Latest reading per unit (table view)</div>
        <div className="viz-scroll">
          <table className="viz-t">
            <thead>
              <tr><th>Unit</th><th>LAeq</th><th>L10</th><th>L50</th><th>L90</th><th>Lmax</th><th>Lmin</th><th>Duty</th><th>Frames</th><th>Interval</th></tr>
            </thead>
            <tbody>
              {devices.map((d, i) => (
                <tr key={d.deviceId}>
                  <td>
                    <span className="viz-chip">
                      <span className="viz-dot" style={{ background: `var(${SERIES_VARS[i % SERIES_VARS.length]})` }} />
                      {d.deviceId}
                    </span>
                  </td>
                  <td>{fmt(d.latest?.laeq)}</td><td>{fmt(d.latest?.l10)}</td><td>{fmt(d.latest?.l50)}</td><td>{fmt(d.latest?.l90)}</td>
                  <td>{fmt(d.latest?.lmaxEst)}</td><td>{fmt(d.latest?.lminEst)}</td>
                  <td>{d.latest?.realizedDuty == null ? "—" : `${(d.latest.realizedDuty * 100).toFixed(1)}%`}</td>
                  <td>{d.latest?.frameCount ?? "—"}</td><td>{d.latest?.intervalS == null ? "—" : `${d.latest.intervalS}s`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="viz-sub" style={{ marginTop: 10 }}>
          All values are device-dB (uncalibrated — calibration against a reference meter is a later step). Duty is the share of
          each interval actually spent capturing audio.
        </p>
      </div>
    </div>
  );
}

function UnitCard({ d, colorVar, nowMs }: { d: Device; colorVar: string; nowMs: number | null }) {
  const l = d.latest;
  // Age against the payload's own generatedAt: render stays pure (no Date.now()
  // during render) and the age is consistent with the data snapshot it describes.
  const age = d.lastSeenAt && nowMs != null ? (nowMs - new Date(d.lastSeenAt).getTime()) / 1000 : null;
  const live = age != null && age < 120;
  return (
    <div className="viz-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span className="viz-chip" style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 13.5 }}>
          <span className="viz-dot" style={{ background: `var(${colorVar})` }} />
          {d.deviceId}
        </span>
        <span className="viz-chip" style={{ color: live ? "var(--good)" : "var(--muted)" }}>
          {live ? "● live" : age == null ? "no data" : `◌ ${Math.round(age)}s ago`}
        </span>
      </div>
      <div className="viz-hero">{fmt(l?.laeq)}<span className="viz-unit">dB LAeq</span></div>
      <div style={{ marginTop: 10, borderTop: "1px solid var(--grid)", paddingTop: 8 }}>
        <div className="viz-kv"><span style={{ color: "var(--text-secondary)" }}>L10 / L50 / L90</span><span>{fmt(l?.l10)} / {fmt(l?.l50)} / {fmt(l?.l90)}</span></div>
        <div className="viz-kv"><span style={{ color: "var(--text-secondary)" }}>Lmax / Lmin</span><span>{fmt(l?.lmaxEst)} / {fmt(l?.lminEst)}</span></div>
        <div className="viz-kv"><span style={{ color: "var(--text-secondary)" }}>Duty · frames</span><span>{l?.realizedDuty == null ? "—" : `${(l.realizedDuty * 100).toFixed(1)}%`} · {l?.frameCount ?? "—"}</span></div>
      </div>
    </div>
  );
}

/** LAeq over time — one line per unit, direct-labelled, with a crosshair tooltip. */
function LaeqChart({ devices }: { devices: Device[] }) {
  // r leaves room for the direct labels ("bench3 61.4") at the line ends.
  const W = 900, H = 260, M = { t: 16, r: 104, b: 28, l: 44 };
  const [hoverX, setHoverX] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const pts = useMemo(() => devices.map((d) => d.series.filter((s) => s.laeq != null)), [devices]);
  const all = pts.flat();
  if (!all.length) return <Empty label="LAeq over time" />;

  const ts = all.map((p) => new Date(p.t).getTime());
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  const vals = all.map((p) => p.laeq as number);
  const pad = 2;
  const y0 = Math.floor(Math.min(...vals) - pad), y1 = Math.ceil(Math.max(...vals) + pad);

  const sx = (t: number) => M.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - M.l - M.r);
  const sy = (v: number) => M.t + (1 - (v - y0) / Math.max(1, y1 - y0)) * (H - M.t - M.b);

  const ticks = niceTicks(y0, y1, 4);
  const hoverT = hoverX == null ? null : t0 + ((hoverX - M.l) / (W - M.l - M.r)) * (t1 - t0);

  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ marginBottom: 6 }}>
        <div className="viz-label">LAeq over time — device-dB</div>
        <div className="viz-sub" style={{ marginTop: 2 }}>One point per publish interval. Units sit side by side, so the lines should track together.</div>
      </figcaption>
      <Legend devices={devices} />
      <div className="viz-scroll">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", minWidth: 520 }}
          onMouseMove={(e) => {
            const r = svgRef.current!.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * W;
            setHoverX(x >= M.l && x <= W - M.r ? x : null);
          }}
          onMouseLeave={() => setHoverX(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} stroke="var(--grid)" strokeWidth={1} />
              <text x={M.l - 8} y={sy(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>{v}</text>
            </g>
          ))}
          <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--axis)" strokeWidth={1} />
          <text x={M.l} y={H - 8} fontSize={11} fill="var(--muted)">{new Date(t0).toLocaleTimeString()}</text>
          <text x={W - M.r} y={H - 8} fontSize={11} fill="var(--muted)" textAnchor="end">{new Date(t1).toLocaleTimeString()}</text>

          {hoverT != null && <line x1={sx(hoverT)} x2={sx(hoverT)} y1={M.t} y2={H - M.b} stroke="var(--axis)" strokeWidth={1} strokeDasharray="3 3" />}

          {pts.map((series, i) => {
            if (!series.length) return null;
            const color = `var(${SERIES_VARS[i % SERIES_VARS.length]})`;
            const dPath = series.map((p, j) => `${j ? "L" : "M"}${sx(new Date(p.t).getTime()).toFixed(1)},${sy(p.laeq as number).toFixed(1)}`).join(" ");
            const last = series[series.length - 1];
            return (
              <g key={devices[i].deviceId}>
                <path d={dPath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={sx(new Date(last.t).getTime())} cy={sy(last.laeq as number)} r={4.5} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
                <text x={W - M.r + 8} y={sy(last.laeq as number) + 4} fontSize={11.5} fill="var(--text-secondary)" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {devices[i].deviceId} {fmt(last.laeq)}
                </text>
              </g>
            );
          })}

          {hoverT != null && pts.map((series, i) => {
            const near = nearest(series, hoverT);
            if (!near) return null;
            return <circle key={i} cx={sx(new Date(near.t).getTime())} cy={sy(near.laeq as number)} r={5}
              fill={`var(${SERIES_VARS[i % SERIES_VARS.length]})`} stroke="var(--surface-1)" strokeWidth={2} />;
          })}
        </svg>
      </div>
      {hoverT != null && (
        <div className="viz-sub" style={{ marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
          {new Date(hoverT).toLocaleTimeString()} —{" "}
          {devices.map((d, i) => {
            const n = nearest(pts[i], hoverT);
            return n ? `${d.deviceId} ${fmt(n.laeq)} dB` : null;
          }).filter(Boolean).join("  ·  ")}
        </div>
      )}
    </figure>
  );
}

/** Third-octave spectrum — one line per unit across the 21 published bands. */
function SpectrumChart({ devices }: { devices: Device[] }) {
  const W = 560, H = 240, M = { t: 14, r: 12, b: 40, l: 40 };
  const withBands = devices.filter((d) => d.latest?.bandsDb?.length);
  if (!withBands.length) return <Empty label="Third-octave spectrum" />;

  const all = withBands.flatMap((d) => d.latest!.bandsDb!);
  const y0 = Math.floor(Math.min(...all) - 3), y1 = Math.ceil(Math.max(...all) + 3);
  const n = BAND_LABELS.length;
  const sx = (i: number) => M.l + (i / (n - 1)) * (W - M.l - M.r);
  const sy = (v: number) => M.t + (1 - (v - y0) / Math.max(1, y1 - y0)) * (H - M.t - M.b);
  const ticks = niceTicks(y0, y1, 4);

  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ marginBottom: 6 }}>
        <div className="viz-label">Third-octave spectrum — latest interval</div>
        <div className="viz-sub" style={{ marginTop: 2 }}>21 bands: a low aggregate plus 250 Hz–20 kHz. Shape reveals what the sound actually is.</div>
      </figcaption>
      <Legend devices={devices} />
      <div className="viz-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", minWidth: 420 }}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} stroke="var(--grid)" strokeWidth={1} />
              <text x={M.l - 7} y={sy(v) + 4} textAnchor="end" fontSize={10.5} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>{v}</text>
            </g>
          ))}
          <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--axis)" strokeWidth={1} />
          {BAND_LABELS.map((lab, i) => (i % 3 === 0 || i === n - 1) && (
            <text key={lab} x={sx(i)} y={H - M.b + 15} fontSize={10} fill="var(--muted)" textAnchor="middle">{lab}</text>
          ))}
          <text x={(M.l + W - M.r) / 2} y={H - 6} fontSize={10.5} fill="var(--muted)" textAnchor="middle">band centre (Hz)</text>

          {withBands.map((d) => {
            const idx = devices.findIndex((x) => x.deviceId === d.deviceId);
            const color = `var(${SERIES_VARS[idx % SERIES_VARS.length]})`;
            const bands = d.latest!.bandsDb!;
            const dPath = bands.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
            return (
              <g key={d.deviceId}>
                <path d={dPath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
                {bands.map((v, i) => <circle key={i} cx={sx(i)} cy={sy(v)} r={2.6} fill={color} />)}
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}

/** Level distribution — small multiples, one 30-bin histogram per unit. */
function HistogramPanel({ devices }: { devices: Device[] }) {
  const withHist = devices.filter((d) => d.latest?.histRaw);
  if (!withHist.length) return <Empty label="Level distribution" />;
  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ marginBottom: 6 }}>
        <div className="viz-label">Level distribution — latest interval</div>
        <div className="viz-sub" style={{ marginTop: 2 }}>Per-frame levels in 2 dB bins. The percentiles above are derived from exactly this.</div>
      </figcaption>
      <div style={{ display: "grid", gap: 10 }}>
        {withHist.map((d) => {
          const idx = devices.findIndex((x) => x.deviceId === d.deviceId);
          const color = `var(${SERIES_VARS[idx % SERIES_VARS.length]})`;
          const counts = (d.latest!.histRaw as string).split("-").map((x) => parseInt(x, 10) || 0).slice(0, HIST_BINS);
          const max = Math.max(1, ...counts);
          const W = 560, H = 74, M = { t: 4, r: 8, b: 16, l: 8 };
          const bw = (W - M.l - M.r) / HIST_BINS;
          return (
            <div key={d.deviceId}>
              <div className="viz-chip" style={{ marginBottom: 2 }}>
                <span className="viz-dot" style={{ background: color }} />{d.deviceId}
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
                {counts.map((c, i) => {
                  const h = (c / max) * (H - M.t - M.b);
                  return c > 0 ? (
                    <rect key={i} x={M.l + i * bw + 1} y={H - M.b - h} width={Math.max(1, bw - 2)} height={h} rx={2} fill={color}>
                      <title>{`${HIST_START_DB + i * HIST_BIN_WIDTH}–${HIST_START_DB + (i + 1) * HIST_BIN_WIDTH} dB: ${c} frames`}</title>
                    </rect>
                  ) : null;
                })}
                <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--axis)" strokeWidth={1} />
                {[0, 10, 20, 29].map((i) => (
                  <text key={i} x={M.l + i * bw + bw / 2} y={H - 4} fontSize={9.5} fill="var(--muted)" textAnchor="middle">
                    {HIST_START_DB + i * HIST_BIN_WIDTH}
                  </text>
                ))}
              </svg>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

function Legend({ devices }: { devices: Device[] }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
      {devices.map((d, i) => (
        <span key={d.deviceId} className="viz-chip">
          <span className="viz-dot" style={{ background: `var(${SERIES_VARS[i % SERIES_VARS.length]})` }} />{d.deviceId}
        </span>
      ))}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <figure style={{ margin: 0 }}>
      <div className="viz-label">{label}</div>
      <p className="viz-sub" style={{ marginTop: 8 }}>Waiting for data…</p>
    </figure>
  );
}

function nearest(series: Series[], t: number) {
  if (!series?.length) return null;
  let best = series[0], bd = Infinity;
  for (const p of series) {
    const d = Math.abs(new Date(p.t).getTime() - t);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function niceTicks(lo: number, hi: number, count: number) {
  const span = Math.max(1, hi - lo);
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(Math.round(v * 10) / 10);
  return out;
}
