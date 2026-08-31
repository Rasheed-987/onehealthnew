"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Search box with a leading icon, used above every list. */
export function SearchInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <div className={cn("relative min-w-64 flex-1", className)}>
      <Search
        size={16}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle"
      />
      <Input className="h-10 pl-10 text-xs" {...props} />
    </div>
  );
}
