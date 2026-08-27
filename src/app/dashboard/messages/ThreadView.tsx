"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Users } from "lucide-react";

import { MESSAGE_MAX_LENGTH } from "@/models/enums";
import type { MessageRow, MessageThreadRow } from "@/lib/messages";
import { formatDayHeading, formatFull, formatStamp } from "./format";

/**
 * The transcript, and the box to add to it.
 *
 * Messages the reader wrote sit right and tinted; everything else sits left
 * with the speaker named above it. The name is drawn only when the speaker
 * changes, because a thread can have three people in it - a teacher and both of
 * a child's guardians - and a run of replies from one of them should read as
 * one turn rather than three labelled ones.
 */
export function ThreadView({
  thread,
  messages,
  loading,
  error,
  canSend,
  onSend,
  onBack,
  className = "",
}: {
  thread: MessageThreadRow | null;
  messages: MessageRow[];
  loading: boolean;
  error: string | null;
  canSend: boolean;
  onSend: (body: string) => Promise<boolean>;
  onBack: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const scroller = useRef<HTMLDivElement | null>(null);
  const pinned = useRef(true);

  /*
   * The draft belongs to the conversation, not to the screen - switching
   * threads must not carry a half-written message across to another family.
   * That reset is a remount rather than an effect: `MessagesClient` keys this
   * component on the thread id, the same idiom the student form uses to get a
   * clean slate on every open.
   */

  /*
   * Follow new messages only when the reader is already at the bottom.
   * Yanking the view down while someone is reading back through last week is
   * worse than making them scroll.
   */
  useEffect(() => {
    const element = scroller.current;
    if (!element || !pinned.current) return;
    element.scrollTop = element.scrollHeight;
  }, [messages, thread?.id]);

  function onScroll() {
    const element = scroller.current;
    if (!element) return;
    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    pinned.current = distance < 80;
  }

  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setSendError(null);
    pinned.current = true;

    const sent = await onSend(body);
    // The draft survives a failure - retyping a paragraph because the network
    // blinked is not something to ask of anyone.
    if (sent) setDraft("");
    else setSendError("Could not send that message. Try again.");
    setSending(false);
  }

  if (!thread) {
    return (
      <div
        className={`items-center justify-center rounded-card border border-border bg-surface p-10 text-center shadow-card ${className}`}
      >
        <p className="text-sm text-muted">
          {loading
            ? "Loading…"
            : "Choose a conversation to read it."}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`min-h-0 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card ${className}`}
    >
      <header className="flex items-start gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 rounded-control p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground lg:hidden"
          aria-label="Back to conversations"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {thread.student.fullName}
          </h2>
          <p className="truncate text-xs text-muted">
            {thread.teacher.label}
            {thread.classroom ? ` · ${thread.classroom.name}` : ""}
          </p>
        </div>

        {/* Who is in the room. The shared-thread rule is easy to forget, and a
            guardian should not have to guess whether the other parent can read
            what they just wrote. */}
        {thread.guardians.length > 0 && (
          <p
            className="hidden max-w-[16rem] items-center gap-1.5 text-right text-xs text-subtle sm:flex"
            title={`Everyone in this conversation: ${[
              thread.teacher.label,
              ...thread.guardians.map((g) => g.label),
            ].join(", ")}`}
          >
            <Users size={14} className="shrink-0" />
            <span className="truncate">
              {thread.guardians.map((g) => g.label).join(", ")}
            </span>
          </p>
        )}
      </header>

      <div
        ref={scroller}
        onScroll={onScroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {error && (
          <p
            role="alert"
            className="rounded-control border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}

        {!error && loading && messages.length === 0 && (
          <p className="text-sm text-muted">Loading messages…</p>
        )}

        {!error && !loading && messages.length === 0 && (
          <p className="text-sm text-muted">
            No messages yet. {canSend ? "Say hello." : ""}
          </p>
        )}

        {messages.map((message, index) => {
          const previous = index > 0 ? messages[index - 1] : null;
          const newDay =
            !previous ||
            formatDayHeading(previous.createdAt) !==
              formatDayHeading(message.createdAt);
          const newSpeaker = !previous || previous.sender.id !== message.sender.id;

          return (
            <div key={message.id}>
              {newDay && (
                <p className="my-3 text-center text-xs font-semibold uppercase tracking-wide text-subtle">
                  {formatDayHeading(message.createdAt)}
                </p>
              )}

              <div
                className={`flex flex-col ${message.mine ? "items-end" : "items-start"}`}
              >
                {newSpeaker && !message.mine && (
                  <p className="mb-1 px-1 text-xs font-semibold text-muted">
                    {message.sender.label}
                  </p>
                )}

                <div
                  className={[
                    "max-w-[85%] rounded-card px-3 py-2 sm:max-w-[70%]",
                    message.mine
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-muted text-foreground",
                  ].join(" ")}
                >
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {message.body}
                  </p>
                  <p
                    className={`mt-1 text-right text-[11px] ${
                      message.mine ? "text-primary-foreground/70" : "text-subtle"
                    }`}
                    title={formatFull(message.createdAt)}
                  >
                    {formatStamp(message.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {canSend ? (
        <div className="border-t border-border px-4 py-3">
          {sendError && (
            <p
              role="alert"
              className="mb-2 rounded-control border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {sendError}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter is a new line. Skipped while an IME
                // is composing, or the first Enter of a Japanese or Korean word
                // would post the message instead of accepting the candidate.
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void submit();
                }
              }}
              rows={2}
              maxLength={MESSAGE_MAX_LENGTH}
              placeholder="Write a message…"
              aria-label="Message"
              className="max-h-40 min-h-[2.75rem] flex-1 resize-y rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={sending || draft.trim() === ""}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-control bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              <Send size={16} />
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      ) : (
        <p className="border-t border-border px-4 py-3 text-sm text-muted">
          This conversation is between the teacher and the child&rsquo;s
          guardians. You can read it, but a reply has to come from one of them.
        </p>
      )}
    </div>
  );
}
