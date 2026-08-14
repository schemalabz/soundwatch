// The acoustic metric canon every view computes with. Lives in lib (not a
// component): seven components and both API consumers reference it.

export type AggKey = "laeq" | "l50" | "l10" | "l90" | "lmax";
export const AGG_KEYS: AggKey[] = ["laeq", "l50", "l10", "l90", "lmax"];
