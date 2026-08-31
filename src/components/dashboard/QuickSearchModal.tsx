"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CalendarCheck,
  FileSpreadsheet,
  GraduationCap,
  HeartPulse,
  Image as GalleryIcon,
  MessageSquare,
  Search,
  Settings,
  UserCheck,
  Users,
  X,
} from "lucide-react";

interface SearchItem {
  id: string;
  title: string;
  category: string;
  href: string;
  icon: React.ElementType;
}

const SEARCH_ITEMS: SearchItem[] = [
  {
    id: "students",
    title: "Students Directory",
    category: "People",
    href: "/dashboard/students",
    icon: GraduationCap,
  },
  {
    id: "teachers",
    title: "Teachers & Staff",
    category: "People",
    href: "/dashboard/teachers",
    icon: Users,
  },
  {
    id: "parents",
    title: "Parents & Guardians",
    category: "People",
    href: "/dashboard/parents",
    icon: Users,
  },
  {
    id: "daily-sheets",
    title: "Daily Progress Sheets",
    category: "Academic",
    href: "/dashboard/daily-progress/sheets",
    icon: FileSpreadsheet,
  },
  {
    id: "attendance",
    title: "Attendance Tracker",
    category: "Academic",
    href: "/dashboard/attendance",
    icon: CalendarCheck,
  },
  {
    id: "messages",
    title: "Messages & Parent Chat",
    category: "Communication",
    href: "/dashboard/messages",
    icon: MessageSquare,
  },
  {
    id: "link-requests",
    title: "Guardian Link Requests",
    category: "Administration",
    href: "/dashboard/link-requests",
    icon: UserCheck,
  },
  {
    id: "health",
    title: "Health & Care Reports",
    category: "Reports",
    href: "/dashboard/health-reports",
    icon: HeartPulse,
  },
  {
    id: "gallery",
    title: "Class Photo Gallery",
    category: "Media",
    href: "/dashboard/gallery",
    icon: GalleryIcon,
  },
  {
    id: "password",
    title: "Security & Account Settings",
    category: "Settings",
    href: "/change-password",
    icon: Settings,
  },
];

export function QuickSearchModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredItems = SEARCH_ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredItems.length - 1 ? prev + 1 : 0,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredItems.length - 1,
        );
      } else if (e.key === "Enter" && filteredItems[selectedIndex]) {
        e.preventDefault();
        handleSelect(filteredItems[selectedIndex].href);
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex]);

  if (!isOpen) return null;

  const handleSelect = (href: string) => {
    onClose();
    setQuery("");
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-charcoal-950/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-overlay transition-all">
        {/* Search Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <Search size={18} className="text-muted shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search section..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-subtle focus:outline-none"
            autoFocus
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-surface-hover hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted">
              No matching pages or tools found.
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {filteredItems.map((item, index) => {
                const Icon = item.icon;
                const isSelected = index === selectedIndex;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(item.href)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={[
                        "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-medium transition-colors",
                        isSelected
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-foreground hover:bg-surface-hover",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-3">
                        <Icon
                          size={17}
                          className={isSelected ? "text-primary-foreground" : "text-muted"}
                        />
                        <span>{item.title}</span>
                      </div>

                      <span
                        className={[
                          "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                          isSelected
                            ? "bg-surface/20 text-primary-foreground"
                            : "bg-surface-muted text-muted",
                        ].join(" ")}
                      >
                        {item.category}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-border bg-background/50 px-4 py-2 text-[11px] text-muted">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border border-border bg-surface px-1 py-0.5 font-mono text-[9px] shadow-2xs">
                ↑↓
              </kbd>{" "}
              Navigate
            </span>
            <span>
              <kbd className="rounded border border-border bg-surface px-1 py-0.5 font-mono text-[9px] shadow-2xs">
                ↵
              </kbd>{" "}
              Select
            </span>
          </div>
          <span>
            <kbd className="rounded border border-border bg-surface px-1 py-0.5 font-mono text-[9px] shadow-2xs">
              ESC
            </kbd>{" "}
            Close
          </span>
        </div>
      </div>
    </div>
  );
}
