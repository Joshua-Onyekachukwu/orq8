"use client";

import React from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const tools = [
  "Slack",
  "Gmail",
  "GitHub",
  "Notion",
  "Linear",
  "Stripe",
  "Zapier",
  "Google Drive",
];

const Partners: React.FC = () => {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <>
      <div className="py-[70px] md:py-[90px] lg:py-[110px]">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <p className="text-center uppercase font-bold tracking-[1.8px] text-xs text-gray-400 mb-[35px] md:mb-[45px]">
            Plugs into the tools you already run
          </p>

          <Swiper
            modules={[Autoplay]}
            loop
            autoplay={
              reducedMotion
                ? false
                : {
                    delay: 2200,
                    disableOnInteraction: false,
                  }
            }
            spaceBetween={40}
            breakpoints={{
              0: { slidesPerView: 2 },
              640: { slidesPerView: 3 },
              1024: { slidesPerView: 4 },
              1280: { slidesPerView: 6 },
            }}
          >
            {tools.map((tool) => (
              <SwiperSlide key={tool}>
                <div className="flex items-center justify-center gap-[10px] text-gray-300 transition-colors hover:text-primary-500">
                  <span className="w-[8px] h-[8px] rounded-full bg-lime"></span>
                  <span className="text-[20px] lg:text-[24px] font-light -tracking-[0.6px]">
                    {tool}
                  </span>
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </div>
    </>
  );
};

export default Partners;
