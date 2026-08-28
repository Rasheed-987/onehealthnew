"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/Field";
import {
  FEEDBACK_EXPERIENCE,
  FEEDBACK_EXPERIENCE_LABEL,
  FEEDBACK_MAX_LENGTH,
  type FeedbackExperience,
} from "@/models/enums";
import { StarPicker } from "./Stars";

type FieldErrors = Record<string, string>;

const EXPERIENCE_OPTIONS = Object.values(FEEDBACK_EXPERIENCE).map((value) => ({
  value,
  label: FEEDBACK_EXPERIENCE_LABEL[value],
}));

/**
 * Leaving feedback. Guardians only - `feedback:create` is what enforces that;
 * this form is simply never rendered for anyone else.
 *
 * Create only, with no edit twin, because there is no edit: a parent who has
 * changed their mind leaves a second piece of feedback. See the note on the
 * model for why.
 *
 * The two ratings are both required and neither defaults, which is on purpose.
 * A pre-selected "Good" is the answer most people would leave untouched, and
 * the school would end up reading its own default back.
 */
export function FeedbackForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [experience, setExperience] = useState<FeedbackExperience | "">("");
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    /*
     * Checked here as well as on the server. The star picker has no empty
     * state the browser understands - "no radio chosen" is valid HTML - so
     * without this the form would post a 0 and come back with a 400 for
     * something the reader can be told about immediately.
     */
    const local: FieldErrors = {};
    if (!experience) local.experience = "Choose how your experience has been.";
    if (stars === 0) local.stars = "Give it a star rating.";
    if (comment.trim() === "") {
      local.comment = "Tell us a little about your experience.";
    }
    if (Object.keys(local).length > 0) {
      setFieldErrors(local);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experience, stars, comment: comment.trim() }),
      });
      const payload: { error?: string; details?: FieldErrors } = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        setFormError(payload.error ?? "Could not send. Please try again.");
        if (payload.details) setFieldErrors(payload.details);
        setBusy(false);
        return;
      }

      onSaved("Thank you - your feedback has been sent.");
    } catch {
      setFormError("Could not reach the server. Check your connection.");
      setBusy(false);
    }
  }

  const remaining = FEEDBACK_MAX_LENGTH - comment.length;

  return (
    <Modal
      open
      onClose={onClose}
      title="Share your feedback"
      description="The nursery's management reads every one of these."
    >
      <form onSubmit={onSubmit} noValidate>
        <div className="space-y-4 px-6 py-5">
          {formError && (
            <p
              role="alert"
              className="rounded-control border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {formError}
            </p>
          )}

          <SelectField
            label="How has your experience been?"
            name="experience"
            value={experience}
            error={fieldErrors.experience}
            onChange={(event) =>
              setExperience(event.target.value as FeedbackExperience)
            }
            options={[
              { value: "", label: "Choose one" },
              ...EXPERIENCE_OPTIONS,
            ]}
          />

          <div>
            <span className="text-sm font-medium text-foreground">
              Rating
              <span className="ml-0.5 text-danger">*</span>
            </span>
            <StarPicker value={stars} onChange={setStars} />
            {fieldErrors.stars && (
              <p className="mt-1 text-sm text-danger">{fieldErrors.stars}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="comment"
              className="text-sm font-medium text-foreground"
            >
              Your feedback
              <span className="ml-0.5 text-danger">*</span>
            </label>
            <textarea
              id="comment"
              name="comment"
              rows={5}
              value={comment}
              maxLength={FEEDBACK_MAX_LENGTH}
              onChange={(event) => setComment(event.target.value)}
              aria-invalid={Boolean(fieldErrors.comment)}
              placeholder="What is working well, and what could we do better?"
              className="mt-1.5 w-full resize-y rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25 aria-[invalid=true]:border-danger"
            />
            {fieldErrors.comment ? (
              <p className="mt-1 text-sm text-danger">{fieldErrors.comment}</p>
            ) : (
              // Only once it is close enough to matter - a counter that reads
              // "1,847 left" from the first keystroke is noise.
              remaining <= 200 && (
                <p className="mt-1 text-xs text-muted">
                  {remaining} characters left
                </p>
              )
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Sending..." : "Send feedback"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
