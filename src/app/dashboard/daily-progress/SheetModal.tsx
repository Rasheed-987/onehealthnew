"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Modal } from "@/components/ui/Modal";
import type { DailyProgressRow } from "@/lib/dailyProgress";
import {
  MOOD,
  MOOD_LABEL,
  SUPPLY_NEED,
  SUPPLY_NEED_LABEL,
  TOILET_TYPE,
  TOILET_TYPE_LABEL,
  type Mood,
  type SupplyNeed,
  type ToiletType,
} from "@/models/enums";

/**
 * One child's sheet for one day - the six headings on the paper form.
 *
 * The form submits every section, not just the ones touched. That is a
 * deliberate difference from the mobile client: a teacher looking at the whole
 * sheet on a desktop has seen and confirmed all six sections, so replacing
 * them wholesale is honest. The API's per-section merge exists for the phone,
 * where a teacher adds one nappy change without ever loading the rest.
 */

interface DrinkDraft {
  at: string;
  what: string;
}
interface ToiletDraft {
  at: string;
  type: ToiletType;
}
interface NapDraft {
  from: string;
  to: string;
}

export function SheetModal({
  studentId,
  studentName,
  date,
  sheet,
  readOnly,
  onClose,
  onSaved,
}: {
  studentId: string;
  studentName: string;
  /** "2026-08-25". */
  date: string;
  sheet: DailyProgressRow | null;
  readOnly: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [drinks, setDrinks] = useState<DrinkDraft[]>(
    (sheet?.drinks ?? []).map((d) => ({ at: d.at ?? "", what: d.what ?? "" })),
  );
  const [moods, setMoods] = useState<Mood[]>(sheet?.moods ?? []);
  const [toilet, setToilet] = useState<ToiletDraft[]>(
    (sheet?.toilet ?? []).map((t) => ({ at: t.at ?? "", type: t.type })),
  );
  const [fun, setFun] = useState((sheet?.fun ?? []).join("\n"));
  const [naps, setNaps] = useState<NapDraft[]>(
    (sheet?.naps ?? []).map((n) => ({ from: n.from ?? "", to: n.to ?? "" })),
  );
  const [needs, setNeeds] = useState<SupplyNeed[]>(sheet?.needs ?? []);
  const [notes, setNotes] = useState(sheet?.notes ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function toggle<T>(list: T[], value: T, set: (next: T[]) => void) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const response = await fetch("/api/daily-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student: studentId,
          date,
          // Blank rows are dropped here rather than sent for the API to
          // reject - an empty row is someone clicking Add and changing their
          // mind, not an error worth a red box.
          drinks: drinks
            .filter((d) => d.at || d.what)
            .map((d) => ({
              ...(d.at ? { at: d.at } : {}),
              ...(d.what ? { what: d.what } : {}),
            })),
          moods,
          toilet: toilet.map((t) => ({
            ...(t.at ? { at: t.at } : {}),
            type: t.type,
          })),
          // One bullet per line; the API trims and drops the blanks.
          fun: fun.split("\n"),
          naps: naps
            .filter((n) => n.from || n.to)
            .map((n) => ({
              ...(n.from ? { from: n.from } : {}),
              ...(n.to ? { to: n.to } : {}),
            })),
          needs,
          // "" clears the note server-side; that is the intent when a teacher
          // empties the box.
          notes,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "Could not save the sheet.");
        if (payload.details && typeof payload.details === "object") {
          setFieldErrors(payload.details as Record<string, string>);
        }
        return;
      }
      onSaved(`${studentName}'s sheet was saved.`);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={studentName}
      description={readOnly ? `Daily sheet for ${date}` : `Filling in ${date}`}
      width="max-w-2xl"
    >
      <div className="max-h-[65vh] space-y-5 overflow-y-auto px-6 py-5">
        {error && (
          <div className="rounded-control border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
        {/* Zod reports nested paths like "naps.0.to"; showing them raw is
            better than swallowing the reason the save failed. */}
        {Object.keys(fieldErrors).length > 0 && (
          <ul className="rounded-control border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
            {Object.entries(fieldErrors).map(([field, message]) => (
              <li key={field}>{message}</li>
            ))}
          </ul>
        )}

        <Section title="Drinking">
          {readOnly ? (
            <ReadList
              items={(sheet?.drinks ?? []).map((d) =>
                [d.at, d.what].filter(Boolean).join(" — "),
              )}
              empty="No drinks recorded."
            />
          ) : (
            <RowEditor
              rows={drinks}
              onAdd={() => setDrinks([...drinks, { at: "", what: "" }])}
              onRemove={(i) => setDrinks(drinks.filter((_, x) => x !== i))}
              render={(row, i) => (
                <>
                  <TimeInput
                    value={row.at}
                    label={`Drink ${i + 1} time`}
                    onChange={(v) =>
                      setDrinks(
                        drinks.map((d, x) => (x === i ? { ...d, at: v } : d)),
                      )
                    }
                  />
                  <input
                    value={row.what}
                    placeholder="milk, water, juice"
                    aria-label={`Drink ${i + 1}`}
                    onChange={(e) =>
                      setDrinks(
                        drinks.map((d, x) =>
                          x === i ? { ...d, what: e.target.value } : d,
                        ),
                      )
                    }
                    className={inputClass}
                  />
                </>
              )}
            />
          )}
        </Section>

        <Section title="Mood">
          {readOnly ? (
            <ReadList
              items={sheet?.moodLabels ?? []}
              empty="No mood recorded."
            />
          ) : (
            <CheckGroup
              options={Object.values(MOOD).map((v) => ({
                value: v,
                label: MOOD_LABEL[v],
              }))}
              selected={moods}
              onToggle={(v) => toggle(moods, v, setMoods)}
            />
          )}
        </Section>

        <Section title="Toilet">
          {readOnly ? (
            <ReadList
              items={(sheet?.toilet ?? []).map((t) =>
                [t.at, t.typeLabel].filter(Boolean).join(" — "),
              )}
              empty="No changes recorded."
            />
          ) : (
            <RowEditor
              rows={toilet}
              onAdd={() =>
                setToilet([...toilet, { at: "", type: TOILET_TYPE.WET }])
              }
              onRemove={(i) => setToilet(toilet.filter((_, x) => x !== i))}
              render={(row, i) => (
                <>
                  <TimeInput
                    value={row.at}
                    label={`Change ${i + 1} time`}
                    onChange={(v) =>
                      setToilet(
                        toilet.map((t, x) => (x === i ? { ...t, at: v } : t)),
                      )
                    }
                  />
                  <select
                    value={row.type}
                    aria-label={`Change ${i + 1} type`}
                    onChange={(e) =>
                      setToilet(
                        toilet.map((t, x) =>
                          x === i
                            ? { ...t, type: e.target.value as ToiletType }
                            : t,
                        ),
                      )
                    }
                    className={inputClass}
                  >
                    {Object.values(TOILET_TYPE).map((v) => (
                      <option key={v} value={v}>
                        {TOILET_TYPE_LABEL[v]}
                      </option>
                    ))}
                  </select>
                </>
              )}
            />
          )}
        </Section>

        <Section title="Fun">
          {readOnly ? (
            <ReadList items={sheet?.fun ?? []} empty="Nothing recorded." />
          ) : (
            <textarea
              value={fun}
              rows={3}
              placeholder={"One line per activity\nPainted a rainbow"}
              aria-label="Fun"
              onChange={(e) => setFun(e.target.value)}
              className={`${inputClass} w-full`}
            />
          )}
        </Section>

        <Section title="Sleep">
          {readOnly ? (
            <ReadList
              items={(sheet?.naps ?? []).map(
                (n) =>
                  `${n.from ?? "?"} - ${n.to ?? "?"}` +
                  (n.minutes !== null ? ` (${n.minutes} min)` : ""),
              )}
              empty="No naps recorded."
            />
          ) : (
            <RowEditor
              rows={naps}
              onAdd={() => setNaps([...naps, { from: "", to: "" }])}
              onRemove={(i) => setNaps(naps.filter((_, x) => x !== i))}
              render={(row, i) => (
                <>
                  <TimeInput
                    value={row.from}
                    label={`Nap ${i + 1} start`}
                    onChange={(v) =>
                      setNaps(
                        naps.map((n, x) => (x === i ? { ...n, from: v } : n)),
                      )
                    }
                  />
                  <TimeInput
                    value={row.to}
                    label={`Nap ${i + 1} end`}
                    onChange={(v) =>
                      setNaps(naps.map((n, x) => (x === i ? { ...n, to: v } : n)))
                    }
                  />
                </>
              )}
            />
          )}
        </Section>

        <Section title="Needs">
          {readOnly ? (
            <ReadList
              items={sheet?.needLabels ?? []}
              empty="Nothing needed."
            />
          ) : (
            <CheckGroup
              options={Object.values(SUPPLY_NEED).map((v) => ({
                value: v,
                label: SUPPLY_NEED_LABEL[v],
              }))}
              selected={needs}
              onToggle={(v) => toggle(needs, v, setNeeds)}
            />
          )}
        </Section>

        <Section title="Notes">
          {readOnly ? (
            <p className="text-sm text-muted">{sheet?.notes ?? "No notes."}</p>
          ) : (
            <textarea
              value={notes}
              rows={2}
              aria-label="Notes"
              onChange={(e) => setNotes(e.target.value)}
              className={`${inputClass} w-full`}
            />
          )}
        </Section>
      </div>

      <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
        >
          {readOnly ? "Close" : "Cancel"}
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save sheet"}
          </button>
        )}
      </div>
    </Modal>
  );
}

const inputClass =
  "rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ReadList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">{empty}</p>;
  }
  return (
    <ul className="space-y-1 text-sm text-foreground">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function TimeInput({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="time"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputClass} w-32`}
    />
  );
}

function CheckGroup<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: readonly { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onToggle(option.value)}
            aria-pressed={on}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              on
                ? "bg-primary text-primary-foreground"
                : "border border-border-strong bg-surface text-foreground hover:bg-surface-hover"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function RowEditor<T>({
  rows,
  onAdd,
  onRemove,
  render,
}: {
  rows: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  render: (row: T, index: number) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          {render(row, index)}
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label={`Remove row ${index + 1}`}
            className="rounded-control p-2 text-danger transition-colors hover:bg-danger-subtle"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1.5 rounded-control border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
      >
        <Plus size={14} />
        Add
      </button>
    </div>
  );
}
