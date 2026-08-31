"use client";

import { Button } from "@/components/ui/button";

interface PaginationState {
  page: number;
  perPage: number;
  total: number;
  pageCount: number;
}

/** The "1-20 of 92" line plus Previous / Next, shown in a list's card footer. */
export function Pagination({
  pagination,
  onPageChange,
}: {
  pagination: PaginationState;
  onPageChange: (updater: (page: number) => number) => void;
}) {
  if (pagination.total === 0) return null;

  const from = (pagination.page - 1) * pagination.perPage + 1;
  const to = Math.min(pagination.page * pagination.perPage, pagination.total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
      <span>
        {from}-{to} of{" "}
        <span className="font-bold text-foreground">{pagination.total}</span>
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange((p) => p - 1)}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pagination.page >= pagination.pageCount}
          onClick={() => onPageChange((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
