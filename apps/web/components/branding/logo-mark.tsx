import React from "react";

/**
 * Inline ORQ8 lockup: the four-tile mark plus the O-R-Q-8 wordmark, drawn as
 * geometry rather than text. No font dependency, no network request, and the
 * letterforms stay crisp at any size.
 *
 * Grid (viewBox 100 x 26)
 * - Mark: x 0 - 25.86. A 2 x 2 arrangement of quarter-round tiles.
 * - Wordmark: cap height 18 (cap line 4.1, baseline 22.3), stem weight 3.5 to
 *   hold its own next to the heavy mark. Round letters overshoot by 0.1 the way
 *   type does. Letters run 33.6 - 98.2 with even 1.8 - 2.2 gaps.
 *
 * Construction
 * - Letters that enclose a counter (the hole in O and Q, the R bowl, both loops
 *   of 8) use fillRule="evenodd" so a second subpath cuts the counter.
 * - Shapes that must merge with a neighbour (the R leg, the Q tail) are separate
 *   elements, so their overlap paints solid instead of cancelling out.
 *
 * Why inline instead of /public: several /images assets have proved unreliable
 * on the production CDN (404s while siblings from the same directory serve
 * fine). Inlining removes the network dependency for the top brand surface.
 *
 * Colours adapt so the lockup reads on light surfaces and inside the black
 * bands: the wordmark follows currentColor by default, the mark takes dotColor.
 */
export function LogoMark({
  className = "h-8 w-auto",
  wordmarkColor = "currentColor",
  dotColor = "var(--orq-brand-deep)",
  ariaLabel = "ORQ8",
}: {
  className?: string;
  wordmarkColor?: string;
  dotColor?: string;
  ariaLabel?: string;
}) {
  return (
    <svg
      width="100"
      height="26"
      viewBox="0 0 100 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={ariaLabel}
    >
      {/* Mark: four quarter-round tiles */}
      <path d="M12.5172 6.25862C12.5172 9.71516 9.71516 12.5172 6.25862 12.5172C2.80208 12.5172 0 9.71516 0 6.25862C0 2.80208 2.80208 0 6.25862 0C9.71516 0 12.5172 2.80208 12.5172 6.25862Z" fill={dotColor} />
      <path d="M13.3448 6.25862C13.3448 2.80208 16.1469 0 19.6035 0C23.06 0 25.8621 2.80208 25.8621 6.25862C25.8621 9.71516 23.06 12.5172 19.6035 12.5172H13.3448V6.25862Z" fill={dotColor} />
      <path d="M0 19.6035C0 16.1469 2.80208 13.3448 6.25862 13.3448H12.5172V19.6034C12.5172 23.06 9.71516 25.8621 6.25862 25.8621C2.80208 25.8621 0 23.06 0 19.6035Z" fill={dotColor} />
      <path d="M25.8621 19.6035C25.8621 23.06 23.06 25.8621 19.6035 25.8621C16.1469 25.8621 13.3448 23.06 13.3448 19.6035C13.3448 16.1469 16.1469 13.3448 19.6035 13.3448C23.06 13.3448 25.8621 16.1469 25.8621 19.6035Z" fill={dotColor} />

      {/*
        Wordmark: O R Q 8.
        Read each path as "outer contour, then counter" - evenodd makes the
        second subpath a hole. Counter geometry holds a 3.5 stem all round.
      */}

      {/* O - outer ellipse 15.6 x 18.2, counter 8.6 x 11.2 */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M33.6 13.2a7.8 9.1 0 0 1 15.6 0a7.8 9.1 0 0 1 -15.6 0ZM37.1 13.2a4.3 5.6 0 0 1 8.6 0a4.3 5.6 0 0 1 -8.6 0Z"
        fill={wordmarkColor}
      />

      {/*
        R - stem 51.4-54.9 full height, half-round bowl to y 14.6, then the leg.
        The outer contour steps in at 54.9 so the stem and bowl are one shape
        (two overlapping subpaths would cut a hole instead of merging).
      */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M51.4 4.2H58.2A5.2 5.2 0 0 1 58.2 14.6H54.9V22.3H51.4ZM54.9 7.6H58.2A1.8 1.8 0 0 1 58.2 11.2H54.9Z"
        fill={wordmarkColor}
      />
      <path d="M58 14.6H61.9L65.6 22.3H61.7Z" fill={wordmarkColor} />

      {/* Q - same ring as O, plus a tail that runs out past the baseline */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M67.5 13.2a7.4 9.1 0 0 1 14.8 0a7.4 9.1 0 0 1 -14.8 0ZM71 13.2a3.9 5.6 0 0 1 7.8 0a3.9 5.6 0 0 1 -7.8 0Z"
        fill={wordmarkColor}
      />
      <path d="M77.16 18.84L79.64 16.36 84.44 21.16 81.96 23.64Z" fill={wordmarkColor} />

      {/*
        8 - two loops that overlap at the waist. Separate elements on purpose:
        the union of the fills is solid, while the counters stay open because
        neither loop reaches into the other's counter.
      */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M86.9 9.4a5.3 5.3 0 0 1 10.6 0a5.3 5.3 0 0 1 -10.6 0ZM90.2 9.4a2 1.8 0 0 1 4 0a2 1.8 0 0 1 -4 0Z"
        fill={wordmarkColor}
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M86.2 17.4a6 5.6 0 0 1 12 0a6 5.6 0 0 1 -12 0ZM89.7 17.4a2.5 2.1 0 0 1 5 0a2.5 2.1 0 0 1 -5 0Z"
        fill={wordmarkColor}
      />
    </svg>
  );
}
