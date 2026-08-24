/**
 * PLACEHOLDER for the school's real logo.
 *
 * The supplied artwork (the ring of children around Arabic calligraphy) is not
 * in the repo. Drop it at `public/logo.png` and replace this component's body
 * with:
 *
 *   <Image src="/logo.png" alt="Letters and Numbers" width={200} height={200} priority />
 *
 * Until then this draws the same idea in brand colours so the layout is honest
 * about its proportions rather than reserving empty space.
 */
export function BrandMark({ className = "" }: { className?: string }) {
  /*
   * Twelve figures evenly around the ring.
   *
   * The coordinates are rounded to 3dp on purpose. Math.sin/cos are not
   * guaranteed to give bit-identical results in two different JS engines, so
   * the server rendered cy="27.253866082107166" while the browser computed
   * 27.25386608210718 - enough for React to report a hydration mismatch on
   * every page that draws the logo. Rounding makes both sides agree.
   */
  const spokes = Array.from({ length: 12 }, (_, i) => {
    const radians = (i * 30 - 90) * (Math.PI / 180);
    return {
      angle: i * 30,
      cx: Number((100 + 84 * Math.cos(radians)).toFixed(3)),
      cy: Number((100 + 84 * Math.sin(radians)).toFixed(3)),
    };
  });

  return (
    <svg
      viewBox="0 0 200 200"
      role="img"
      aria-label="Letters and Numbers"
      className={className}
    >
      <circle
        cx="100"
        cy="100"
        r="76"
        fill="none"
        stroke="var(--neutral-300)"
        strokeWidth="1.5"
      />
      <circle
        cx="100"
        cy="100"
        r="58"
        fill="none"
        stroke="var(--neutral-200)"
        strokeWidth="1.5"
      />
      {spokes.map((spoke) => (
        <circle
          key={spoke.angle}
          cx={spoke.cx}
          cy={spoke.cy}
          r="7"
          fill="var(--neutral-600)"
        />
      ))}
      <text
        x="100"
        y="94"
        textAnchor="middle"
        fontSize="30"
        fontWeight="700"
        fill="var(--green-500)"
        fontFamily="var(--font-sans)"
      >
        123
      </text>
      <text
        x="100"
        y="126"
        textAnchor="middle"
        fontSize="30"
        fontWeight="700"
        fill="var(--red-500)"
        fontFamily="var(--font-sans)"
      >
        ABC
      </text>
    </svg>
  );
}
