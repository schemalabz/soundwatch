"use client";

// Notes on a unit: what we learned from outside the data ("the technician
// says the store's internet is off until Thursday"). A dated log, newest
// first — a note is added or deleted, never edited, so what was known when
// stays on record.

import { useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { athens } from "@/components/admin/fleetUi";
import type { UnitNoteDto } from "@/lib/api/admin";

export default function UnitNotes({
  unitId,
  notes,
  siteNote,
  onChanged,
}: {
  unitId: string;
  notes: UnitNoteDto[];
  siteNote: string | null;
  onChanged: () => void;
}) {
  const { api } = useAdmin();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/units/${unitId}/notes`, { method: "POST", body: JSON.stringify({ body: draft }) });
      setDraft("");
      onChanged();
    } catch {
      setError("Could not save the note.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this note?")) return;
    await api(`/api/admin/units/${unitId}/notes/${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <section aria-labelledby="notes-title" className="flex flex-col gap-4 rounded-[14px] border border-border bg-white px-7 py-5">
      <div className="flex items-baseline gap-3">
        <h2 id="notes-title" className="text-lg font-bold text-ink">Notes</h2>
        <span className="text-[13px] text-slate">What we know from outside the data — calls with the technician, the store</span>
      </div>

      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] font-semibold text-ink">
          <span className="sr-only">New note</span>
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            placeholder="e.g. Technician: the store’s internet is off until Thursday"
            className="resize-y rounded-[10px] border border-[#d5d7db] px-3 py-2.5 text-sm font-normal"
          />
        </label>
        <button type="submit" disabled={busy || !draft.trim()} className="h-11 shrink-0 rounded-[10px] bg-ink px-[18px] text-sm font-semibold text-white disabled:opacity-40">
          Add note
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-loud">{error}</p>}

      {notes.length === 0 && !siteNote && <p className="text-sm text-slate">No notes yet.</p>}
      {notes.length > 0 && (
        <ul className="flex flex-col divide-y divide-[#eef0f2]">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-4 py-2.5">
              <span className="w-28 shrink-0 font-mono text-[13px] text-slate">{athens(n.createdAt)}</span>
              <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-ink">{n.body}</p>
              <button onClick={() => remove(n.id)} className="shrink-0 text-xs text-slate underline">Delete</button>
            </li>
          ))}
        </ul>
      )}
      {siteNote && (
        <p className="rounded-[10px] bg-[#f6f7f8] px-3.5 py-2.5 text-[13px] text-slate">
          <span className="font-semibold text-ink">Site note: </span>{siteNote}
        </p>
      )}
    </section>
  );
}

/** One-line form of the newest note for lists: "Note · 5 Oct, 14:02 — …". */
export function NoteLine({ note, className = "" }: { note: UnitNoteDto | null; className?: string }) {
  if (!note) return null;
  return (
    <span className={`block truncate text-[13px] text-ink ${className}`} title={note.body}>
      <span className="font-semibold">Note · {athens(note.createdAt)} — </span>
      {note.body}
    </span>
  );
}
