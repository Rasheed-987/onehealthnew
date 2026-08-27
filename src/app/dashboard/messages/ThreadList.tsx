"use client";

import { Plus } from "lucide-react";

import type { MessageThreadRow } from "@/lib/messages";
import { formatFull, formatStamp } from "./format";

/**
 * The inbox column.
 *
 * One row per child-and-teacher pair, newest activity first. The child's name
 * leads rather than the other participant's, because that is what identifies a
 * conversation from both ends - a teacher has thirty of these and a guardian
 * has one per child, and in neither case is "who am I talking to" the question
 * that picks the row out of the list.
 */
export function ThreadList({
  threads,
  selectedId,
  onSelect,
  loading,
  error,
  canSend,
  onNew,
  className = "",
}: {
  threads: MessageThreadRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string | null;
  canSend: boolean;
  onNew: () => void;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Conversations</h2>
        {canSend && (
          <button
            type="button"
            onClick={onNew}
            className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            <Plus size={14} />
            New
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <p
            role="alert"
            className="m-3 rounded-control border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}

        {!error && loading && threads.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted">Loading conversations…</p>
        )}

        {!error && !loading && threads.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted">
            {canSend
              ? "No conversations yet. Start one with New."
              : "No conversations have been started yet."}
          </p>
        )}

        <ul>
          {threads.map((thread) => {
            const active = thread.id === selectedId;
            return (
              <li key={thread.id}>
                <button
                  type="button"
                  onClick={() => onSelect(thread.id)}
                  aria-current={active ? "true" : undefined}
                  className={[
                    "flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors",
                    active ? "bg-primary-subtle" : "hover:bg-surface-hover",
                  ].join(" ")}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {thread.student.fullName}
                    </span>
                    {thread.lastMessage && (
                      <span
                        className="shrink-0 text-xs text-subtle"
                        title={formatFull(thread.lastMessage.at)}
                      >
                        {formatStamp(thread.lastMessage.at)}
                      </span>
                    )}
                  </span>

                  <span className="truncate text-xs text-muted">
                    {thread.teacher.label}
                    {thread.classroom ? ` · ${thread.classroom.name}` : ""}
                  </span>

                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-muted">
                      {thread.lastMessage
                        ? `${thread.lastMessage.mine ? "You: " : ""}${thread.lastMessage.preview}`
                        : "No messages yet."}
                    </span>
                    {thread.unreadCount > 0 && (
                      <span className="inline-flex min-w-5 shrink-0 justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
                        {thread.unreadCount}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
