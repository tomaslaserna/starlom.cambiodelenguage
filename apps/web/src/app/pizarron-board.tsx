"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/components/ui";
import { parseMentions } from "@/lib/board-mentions";
import type { BoardNote } from "@/lib/board";

const BOARD_WIDTH = 4000;
const BOARD_HEIGHT = 3000;

const COLOR_CLASSES: Record<string, string> = {
  amarillo: "bg-[#fef9c3] border-[#fde047]",
  verde: "bg-[#dcfce7] border-[#86efac]",
  rosa: "bg-[#fce7f3] border-[#f9a8d4]",
  azul: "bg-[#dbeafe] border-[#93c5fd]",
  naranja: "bg-[#ffedd5] border-[#fdba74]",
};
const COLORS = Object.keys(COLOR_CLASSES);
const COLOR_DOT: Record<string, string> = {
  amarillo: "bg-[#fde047]",
  verde: "bg-[#86efac]",
  rosa: "bg-[#f9a8d4]",
  azul: "bg-[#93c5fd]",
  naranja: "bg-[#fdba74]",
};

async function patchNote(id: string, patch: Record<string, unknown>) {
  await fetch(`/api/board/notes/${id}`, {
    method: "PATCH",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => undefined);
}

type ActiveMention = { noteId: string; query: string; from: number; to: number };

export function PizarronBoard({ initialNotes, coworkers }: { initialNotes: BoardNote[]; coworkers: string[] }) {
  const [notes, setNotes] = useState<BoardNote[]>(initialNotes);
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [creating, setCreating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const drag = useRef<{ id: string; startX: number; startY: number; nx: number; ny: number } | null>(null);
  const pan = useRef<{ startX: number; startY: number; sl: number; st: number } | null>(null);

  useEffect(() => {
    function onMove(event: PointerEvent) {
      if (drag.current) {
        const note = notesRef.current.find((item) => item.id === drag.current!.id);
        if (!note) return;
        const nx = Math.max(0, note.x + (event.clientX - drag.current.startX));
        const ny = Math.max(0, note.y + (event.clientY - drag.current.startY));
        drag.current.startX = event.clientX;
        drag.current.startY = event.clientY;
        drag.current.nx = nx;
        drag.current.ny = ny;
        setNotes((current) => current.map((item) => (item.id === drag.current!.id ? { ...item, x: nx, y: ny } : item)));
      } else if (pan.current && scrollRef.current) {
        scrollRef.current.scrollLeft = pan.current.sl - (event.clientX - pan.current.startX);
        scrollRef.current.scrollTop = pan.current.st - (event.clientY - pan.current.startY);
      }
    }
    function onUp() {
      if (drag.current) {
        void patchNote(drag.current.id, { x: Math.round(drag.current.nx), y: Math.round(drag.current.ny) });
        drag.current = null;
      }
      pan.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  async function createNote() {
    const el = scrollRef.current;
    const x = Math.round((el?.scrollLeft ?? 0) + 60);
    const y = Math.round((el?.scrollTop ?? 0) + 60);
    setCreating(true);
    try {
      const response = await fetch("/api/board/notes", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ x, y }),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: BoardNote };
      if (payload.data) setNotes((current) => [...current, payload.data as BoardNote]);
    } finally {
      setCreating(false);
    }
  }

  function startNoteDrag(event: ReactPointerEvent, id: string) {
    event.stopPropagation();
    drag.current = { id, startX: event.clientX, startY: event.clientY, nx: 0, ny: 0 };
  }

  function startPan(event: ReactPointerEvent) {
    if (!scrollRef.current) return;
    pan.current = { startX: event.clientX, startY: event.clientY, sl: scrollRef.current.scrollLeft, st: scrollRef.current.scrollTop };
  }

  function onTextChange(id: string, value: string, caret: number) {
    setNotes((current) => current.map((item) => (item.id === id ? { ...item, text: value } : item)));
    const before = value.slice(0, caret);
    const match = before.match(/@([a-zA-Z0-9._-]*)$/);
    if (match) setActiveMention({ noteId: id, query: match[1], from: caret - match[0].length, to: caret });
    else setActiveMention(null);
  }

  function insertMention(id: string, username: string) {
    setActiveMention((mention) => {
      if (!mention) return null;
      setNotes((current) =>
        current.map((item) => {
          if (item.id !== id) return item;
          const next = `${item.text.slice(0, mention.from)}@${username} ${item.text.slice(mention.to)}`;
          void patchNote(id, { text: next });
          return { ...item, text: next };
        }),
      );
      return null;
    });
  }

  function saveText(id: string) {
    const note = notesRef.current.find((item) => item.id === id);
    if (note) void patchNote(id, { text: note.text });
    setActiveMention(null);
  }

  function setColor(id: string, color: string) {
    setNotes((current) => current.map((item) => (item.id === id ? { ...item, color } : item)));
    void patchNote(id, { color });
  }

  async function removeNote(id: string) {
    setNotes((current) => current.filter((item) => item.id !== id));
    await fetch(`/api/board/notes/${id}`, { method: "DELETE" }).catch(() => undefined);
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="erp-text-caption text-[#64748b]">
          Arrastrá el fondo para moverte · agarrá un post-it de su barra superior para moverlo · escribí <span className="font-bold">@</span> para mencionar.
        </p>
        <button
          className="inline-flex h-9 items-center rounded-[9px] bg-[#2563eb] px-4 text-sm font-bold text-white hover:bg-[#1d4ed8] disabled:opacity-50"
          disabled={creating}
          onClick={createNote}
          type="button"
        >
          ＋ Post-it
        </button>
      </div>

      <div
        className="relative h-[70vh] cursor-grab overflow-auto rounded-[12px] border border-[#d9e2ef] bg-[#f8fafc] active:cursor-grabbing"
        onPointerDown={startPan}
        ref={scrollRef}
        style={{
          backgroundImage:
            "linear-gradient(#e5ebf4 1px, transparent 1px), linear-gradient(90deg, #e5ebf4 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      >
        <div className="relative" style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT }}>
          {notes.map((note) => {
            const mentions = parseMentions(note.text, coworkers);
            const suggestions =
              activeMention && activeMention.noteId === note.id
                ? coworkers.filter((name) => name.toLowerCase().startsWith(activeMention.query.toLowerCase())).slice(0, 6)
                : [];
            return (
              <div
                className={cn("absolute w-56 rounded-[10px] border shadow-[0_10px_24px_rgba(15,23,42,0.12)]", COLOR_CLASSES[note.color] ?? COLOR_CLASSES.amarillo)}
                key={note.id}
                onPointerDown={(event) => event.stopPropagation()}
                style={{ left: note.x, top: note.y }}
              >
                <div
                  className="flex cursor-grab items-center justify-between gap-2 rounded-t-[10px] border-b border-black/10 px-2 py-1 active:cursor-grabbing"
                  onPointerDown={(event) => startNoteDrag(event, note.id)}
                >
                  <span className="flex items-center gap-1">
                    {COLORS.map((color) => (
                      <button
                        aria-label={`Color ${color}`}
                        className={cn("h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-black/10", COLOR_DOT[color], note.color === color ? "ring-2 ring-[#0f172a]" : "")}
                        key={color}
                        onClick={() => setColor(note.id, color)}
                        onPointerDown={(event) => event.stopPropagation()}
                        type="button"
                      />
                    ))}
                  </span>
                  <button
                    aria-label="Borrar post-it"
                    className="text-sm font-bold text-black/40 hover:text-[#dc2626]"
                    onClick={() => removeNote(note.id)}
                    onPointerDown={(event) => event.stopPropagation()}
                    type="button"
                  >
                    ✕
                  </button>
                </div>
                <div className="relative p-2">
                  <textarea
                    className="min-h-24 w-full resize-none bg-transparent text-sm text-[#0f172a] outline-none placeholder:text-black/40"
                    defaultValue={note.text}
                    onBlur={() => saveText(note.id)}
                    onChange={(event) => onTextChange(note.id, event.target.value, event.target.selectionStart ?? event.target.value.length)}
                    placeholder="Escribí tu nota… usá @ para mencionar"
                  />
                  {suggestions.length > 0 ? (
                    <ul className="absolute left-2 right-2 z-10 mt-1 overflow-hidden rounded-md border border-[#d9e2ef] bg-white shadow-[var(--shadow-lg)]">
                      {suggestions.map((name) => (
                        <li key={name}>
                          <button
                            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-[#f1f5f9]"
                            onClick={() => insertMention(note.id, name)}
                            onPointerDown={(event) => event.preventDefault()}
                            type="button"
                          >
                            @{name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {mentions.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {mentions.map((name) => (
                        <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-bold text-[#0f172a]" key={name}>
                          @{name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
