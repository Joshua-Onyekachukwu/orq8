"use client";

import React from "react";

const PromoVideo: React.FC = () => {
  return (
    <>
      <div className="md:px-[12px] 2xl:px-[30px]">
        <div
          className="bg-cover bg-center bg-no-repeat relative z-[1] md:rounded-[20px] lg:rounded-[30px] xl:rounded-[50px] py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px] overflow-hidden"
          style={{
            backgroundImage: "url(/images/video-bg.jpg)",
          }}
        >
          <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
            <div className="text-center mx-auto xl:max-w-[1050px] rounded-[10px] md:rounded-[20px] lg:rounded-[30px] border-[5px] border-white">
              <video
                loop
                autoPlay
                className="rounded-[10px] md:rounded-[20px] lg:rounded-[30px]"
              >
                <source src="/images/video.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-black -z-[1] -tracking-[1.8px] md:-tracking-[3px] lg:-tracking-[4.8px] text-[40px] md:text-[60px] lg:text-[80px] whitespace-nowrap rotate-[8deg] lg:py-[10px]"
            style={{
              background:
                "linear-gradient(270deg, #C713E3 38.91%, #2E00D3 82.49%)",
            }}
          >
            The Best Fintech Tool in 2025 * The Best Fintech Tool in 2025 * The
            Best Fintech Tool in 2025
          </div>
        </div>
      </div>
    </>
  );
};

export default PromoVideo;
