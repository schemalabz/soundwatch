"use client";

// The Τοποθεσίες search row: debounced Mapbox autocomplete whose picks
// become location pins, carrying the map-pin placement toggle at its end.

import { useEffect, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { dashboardStrings as tr } from "@/lib/strings/dashboard";
import { searchAddress, type AddressHit } from "@/lib/dashboard/geocode";

/** Debounced Mapbox address autocomplete; a pick becomes a location pin. */
export default function AddressSearch({
  onPick,
  placing,
  onTogglePlacing,
}: {
  onPick: (lng: number, lat: number, label: string) => void;
  placing: boolean;
  onTogglePlacing: () => void;
}) {
  const [query, setQuery] = useState("");
  // Results are tagged with the query that produced them — anything typed
  // since simply derives to "no hits" (no state resets inside the effect).
  const [result, setResult] = useState<{ q: string; hits: AddressHit[] } | null>(null);
  const q = query.trim();
  const hits = q.length >= 3 && result?.q === q ? result.hits : [];

  useEffect(() => {
    if (q.length < 3) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchAddress(q).then((results) => {
        if (!cancelled) setResult({ q, hits: results });
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  return (
    <div>
      <div className="flex items-center gap-2 rounded-md border px-2 py-1.5 focus-within:border-sound/60">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr.locations.search}
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button type="button" aria-label={tr.clear} onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
            <X className="size-3" />
          </button>
        )}
        <span className="h-4 w-px shrink-0 bg-border" />
        <button
          type="button"
          title={placing ? tr.locations.placing : tr.locations.add}
          aria-pressed={placing}
          onClick={onTogglePlacing}
          className={cn(
            "-my-0.5 -mr-1 shrink-0 rounded p-1 transition-colors",
            placing ? "bg-sound/15 text-sound" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <MapPin className="size-3.5" />
        </button>
      </div>
      {placing && <p className="mt-1 text-[10px] text-sound">{tr.locations.placing}</p>}
      {hits.length > 0 && (
        <ul className="mt-1 overflow-hidden rounded-md border">
          {hits.map((h, i) => (
            <li key={`${h.lng}:${h.lat}:${i}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(h.lng, h.lat, h.label);
                  setQuery("");
                }}
                className="w-full px-2.5 py-1.5 text-left transition-colors hover:bg-sound/8"
              >
                <span className="block truncate text-[12px] font-medium">{h.label}</span>
                {h.context && <span className="block truncate text-[9.5px] text-muted-foreground">{h.context}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
