import Image from "next/image";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center shrink-0 ${className}`}>
      <Image
        src="/logo.png"
        alt="Letters and Numbers Logo"
        width={200}
        height={200}
        priority
        className="h-full w-full object-contain"
      />
    </div>
  );
}
