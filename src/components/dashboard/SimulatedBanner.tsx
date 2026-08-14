// Says, on every screen, that the numbers are invented.
//
// staging.soundwatch.gr serves simulated levels attached to REAL Athens
// addresses, on a public URL, in a UI identical to production's. Someone
// arriving on it has no way to tell — the sensors have street names, the
// levels move, the charts fill in. A screenshot of it is indistinguishable
// from a screenshot of a measurement.
//
// Driven by NEXT_PUBLIC_DATA_SOURCE, which only docker-compose.staging.yml
// sets. Production never renders this. NEXT_PUBLIC_* is inlined at build time,
// so this is decided when the image is built, not by anything at runtime that
// could be flipped by accident.

const IS_SIMULATED = process.env.NEXT_PUBLIC_DATA_SOURCE === "simulated";

export default function SimulatedBanner() {
  if (!IS_SIMULATED) return null;

  return (
    <div
      role="status"
      // Above the map and its overlays, below dialogs. Full width so it reads
      // as a property of the page rather than a dismissible notice — there is
      // no dismiss, because the thing it says never stops being true.
      className="relative z-30 flex shrink-0 items-center justify-center gap-2 border-b border-[#b45309]/25 bg-[#fdf6ec] px-4 py-1.5 text-[11.5px] leading-tight text-[#7c4a11]"
    >
      <span aria-hidden className="text-[13px] leading-none">
        ⚠
      </span>
      <span>
        <b className="font-semibold">Περιβάλλον δοκιμών.</b> Οι μετρήσεις είναι{" "}
        <b className="font-semibold">προσομοιωμένες</b> — δεν προέρχονται από
        αισθητήρες και δεν περιγράφουν τον πραγματικό θόρυβο σε αυτές τις
        διευθύνσεις.
      </span>
      <a
        href="https://soundwatch.gr"
        className="ml-1 whitespace-nowrap font-medium underline underline-offset-2 hover:text-[#5c3708]"
      >
        Πραγματικά δεδομένα →
      </a>
    </div>
  );
}
