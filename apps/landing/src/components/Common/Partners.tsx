"use client";

import React from "react";

/* Fictional customer logos for the social-proof wall. Placeholder brands until
   real design partners arrive; each mark is a simple geometric SVG so the strip
   reads as a clean, premium logo wall. Grayscale by default, brand color on
   hover. The list is one full sequence; the track renders it twice so the
   -50% translate loops seamlessly. */

interface FictionalBrand {
  name: string;
  color: string;
  /* small geometric mark, 24x24 viewBox */
  svg: React.ReactNode;
}

const brands: FictionalBrand[] = [
  {
    name: "Nimbus",
    color: "#4A9DFF",
    svg: (
      <path
        d="M7 18.5a5.5 5.5 0 0 1-.6-10.96 6.75 6.75 0 0 1 13.2 1.46A4.5 4.5 0 0 1 19 18.5H7Z"
        fill="currentColor"
      />
    ),
  },
  {
    name: "Vertex",
    color: "#605DFF",
    svg: (
      <path
        d="M12 3.5 21.5 19.5h-19L12 3.5Z"
        fill="currentColor"
      />
    ),
  },
  {
    name: "Orbit",
    color: "#8B5CF6",
    svg: (
      <g fill="none" stroke="currentColor" strokeWidth="2.2">
        <circle cx="12" cy="12" r="8" />
        <circle cx="19" cy="8" r="2.4" fill="currentColor" stroke="none" />
      </g>
    ),
  },
  {
    name: "Lumen",
    color: "#F59E0B",
    svg: (
      <g fill="currentColor">
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="2.5" r="1.6" />
        <circle cx="12" cy="21.5" r="1.6" />
        <circle cx="2.5" cy="12" r="1.6" />
        <circle cx="21.5" cy="12" r="1.6" />
      </g>
    ),
  },
  {
    name: "Forge",
    color: "#FF6B35",
    svg: (
      <path
        d="M13.5 2 5 13.5h5L9 22l8.5-11.5h-5L13.5 2Z"
        fill="currentColor"
      />
    ),
  },
  {
    name: "Harbor",
    color: "#0EA5A0",
    svg: (
      <path
        d="M2 16c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-1.8 5-1M2 20c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-1.8 5-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    ),
  },
  {
    name: "Pulse",
    color: "#10B981",
    svg: (
      <path
        d="M2 12h4l2.5-6 4 12 2.5-6h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    name: "Aurora",
    color: "#EC4899",
    svg: (
      <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M4 9c2.5-2.5 5-2.5 7.5 0s5 2.5 8.5 0" />
        <path d="M4 14c2.5-2.5 5-2.5 7.5 0s5 2.5 8.5 0" opacity=".55" />
        <path d="M4 19c2.5-2.5 5-2.5 7.5 0s5 2.5 8.5 0" opacity=".25" />
      </g>
    ),
  },
  {
    name: "Cobalt",
    color: "#3B82F6",
    svg: (
      <path
        d="M12 2.5 20.5 7.5v9L12 21.5 3.5 16.5v-9L12 2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    ),
  },
  {
    name: "Meridian",
    color: "#64748B",
    svg: (
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M4 12a8 8 0 0 1 16 0" />
        <path d="M2.5 12h19" />
      </g>
    ),
  },
];

/* Two full copies of the sequence for a seamless loop. */
const trackItems = [...brands, ...brands];

const Partners: React.FC = () => {
  return (
    <>
      <div className="py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="mx-auto text-center md:max-w-[520px]">
            <span className="block uppercase font-bold tracking-[1.8px] text-xs text-primary-500 mb-[8px] md:mb-[10px]">
              Trusted by
            </span>
            <h2 className="!mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[44px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.6px]">
              Companies of{" "}
              <span className="text-primary-500 font-normal">One</span>
            </h2>
            <p className="!mb-0 mt-[12px] md:mt-[16px] text-gray-500 dark:text-gray-400 md:text-[15px] lg:text-md">
              One founder. One HQ. A whole operation running itself.
            </p>
          </div>
        </div>

        {/* Infinite right-to-left marquee. The track is duplicated so the loop
            never jumps; reduced-motion users get a static row. */}
        <div
          className="logo-marquee relative overflow-hidden mt-[35px] md:mt-[50px]"
          role="presentation"
        >
          <div className="logo-marquee-track flex items-center gap-[56px] md:gap-[84px] w-max ltr:pl-[28px] rtl:pr-[28px]">
            {trackItems.map((brand, i) => (
              <div
                key={`${brand.name}-${i}`}
                className="logo-item flex items-center gap-[12px] whitespace-nowrap"
                style={{ "--brand": brand.color } as React.CSSProperties}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-[30px] h-[30px] md:w-[34px] md:h-[34px] flex-none"
                  aria-hidden="true"
                >
                  {brand.svg}
                </svg>
                <span className="text-[20px] lg:text-[24px] font-light -tracking-[0.6px]">
                  {brand.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default Partners;
