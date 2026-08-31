import Image from "next/image";

export function BrandMark({
  className = "",
  showText = false,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <div className={`relative flex items-center gap-3 shrink-0 ${className}`}>
      <div className="relative h-10 w-10 shrink-0">
        <Image
          src="/logo.png"
          alt="Letters and Numbers Logo"
          width={80}
          height={80}
          priority
          className="h-full w-full object-contain"
        />
      </div>
    </div>
  );
}
