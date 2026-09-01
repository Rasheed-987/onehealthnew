import Image from "next/image";

export function BrandMark({
  className = "",
  showText = false,
  textClassName = "",
}: {
  className?: string;
  showText?: boolean;
  textClassName?: string;
}) {
  return (
    <div className="relative flex items-center gap-3 shrink-0">
      <div className={`relative shrink-0 ${className || "h-10 w-10"}`}>
        <Image
          src="/logo.png"
          alt="Letters and Numbers Logo"
          width={160}
          height={160}
          priority
          className="h-full w-full object-contain"
        />
      </div>
      {showText && (
        <div className={`flex flex-col min-w-0 ${textClassName}`}>
          <span className="font-heading font-bold text-foreground text-base tracking-tight leading-tight truncate">
            Letters &amp; Numbers
          </span>
          <span className="text-[10px] font-semibold text-muted tracking-wider uppercase truncate">
            Nursery Portal
          </span>
        </div>
      )}
    </div>
  );
}
