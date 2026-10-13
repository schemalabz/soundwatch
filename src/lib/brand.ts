// The Skroutz relationship, as the interface states it: the brandbook's
// partnership lockup, soundwatch ✕ skroutz. Soundwatch leads; Skroutz sits
// beside it small and quiet, using the brandbook's own grayscale variant
// ("for applications where we want to use our logotype more subtly") at the
// brandbook's minimum width. The full-colour logotype is kept for the one
// place that introduces Skroutz by name (the partner card on /about).
//
// Not options: "soundwatch by skroutz" (claims Skroutz as the maker), and the
// hat marque, which the brandbook only ever uses alone.

/** The logotype as delivered, orange on transparent, and its aspect. */
export const SKROUTZ_LOGOTYPE = { src: "/brand/skroutz-logotype.png", w: 1330, h: 274 } as const;
/** The brandbook's grayscale variant: the same shape in #BBBBBB, for light grounds. */
export const SKROUTZ_LOGOTYPE_GREY = { src: "/brand/skroutz-logotype-grey.png", w: 1330, h: 274 } as const;

/** Brandbook: the logotype is never narrower than 70px on screen. */
export const SKROUTZ_MIN_WIDTH_PX = 70;
