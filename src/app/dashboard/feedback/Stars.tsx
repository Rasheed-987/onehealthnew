"use client";

import { Star } from "lucide-react";

import { FEEDBACK_MAX_STARS } from "@/models/enums";

/**
 * A rating, as stars.
 *
 * Read-only here; the picker on the form is its own component because a
 * control that has to be reachable by keyboard is a different thing from a
 * decoration. The number rides along in text for the same reason - five filled
 * shapes are not a value a screen reader can announce.
 */
export function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      <span className="flex" aria-hidden="true">
        {Array.from({ length: FEEDBACK_MAX_STARS }, (_, index) => (
          <Star
            key={index}
            size={14}
            className={
              index < value
                ? "fill-warning text-warning"
                : "text-border-strong"
            }
          />
        ))}
      </span>
      <span className="text-muted">
        {value} {value === 1 ? "Star" : "Stars"}
      </span>
    </span>
  );
}

/**
 * The picker.
 *
 * A radio group rather than five buttons, so arrow keys move through it and
 * the browser enforces "exactly one" without any state handling of its own.
 * The inputs are visually hidden but still focusable - `hidden` or
 * `display: none` would take them out of the tab order and off the
 * accessibility tree, which is the usual way this control ends up
 * mouse-only.
 */
export function StarPicker({
  value,
  onChange,
  name = "stars",
}: {
  value: number;
  onChange: (value: number) => void;
  name?: string;
}) {
  return (
    <div role="radiogroup" aria-label="Star rating" className="mt-1.5 flex gap-1">
      {Array.from({ length: FEEDBACK_MAX_STARS }, (_, index) => {
        const stars = index + 1;
        return (
          <label
            key={stars}
            className="cursor-pointer rounded-control p-1 transition-colors hover:bg-surface-hover focus-within:ring-2 focus-within:ring-ring/25"
            title={`${stars} ${stars === 1 ? "star" : "stars"}`}
          >
            <input
              type="radio"
              name={name}
              value={stars}
              checked={value === stars}
              onChange={() => onChange(stars)}
              className="sr-only"
            />
            <Star
              size={26}
              className={
                stars <= value
                  ? "fill-warning text-warning"
                  : "text-border-strong"
              }
            />
            <span className="sr-only">
              {stars} {stars === 1 ? "star" : "stars"}
            </span>
          </label>
        );
      })}
    </div>
  );
}
