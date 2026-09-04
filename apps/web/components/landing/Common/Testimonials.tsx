"use client";

import React from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Navigation } from "swiper/modules";

interface Testimonial {
  id: number;
  quote: string;
  name: string;
  position: string;
  initials: string;
  color: string;
}

const Testimonials: React.FC = () => {
  const testimonials: Testimonial[] = [
    {
      id: 1,
      quote:
        "ORQ8 changed how I run my company. I set a goal, and my Executive Agent plans the work, hires the specialists, and reports back. I only handle the decisions that matter.",
      name: "Sarah Chen",
      position: "Founder, NovaCraft",
      initials: "SC",
      color: "bg-emerald/10 text-emerald",
    },
    {
      id: 2,
      quote:
        "The approval gates give me real control. AI proposes, I decide. Everything is audited, every dollar tracked. It feels like having a real operations team without the overhead.",
      name: "Marcus Rivera",
      position: "CEO, Streamline Labs",
      initials: "MR",
      color: "bg-blue-500/10 text-blue-500",
    },
  ];

  return (
    <>
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px] py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]">
        {/* Header */}
        <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center md:max-w-[495px] lg:max-w-[600px]">
          <span className="block uppercase font-bold tracking-[1.8px] text-xs text-emerald mb-[10px] lg:mb-[15px]">
            Testimonials
          </span>
          <h2 className="!mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
            Founders trust ORQ8 to{" "}
            <span className="text-emerald">run their company</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[25px]">
          {/* Swiper carousel — Trezo style */}
          <div
            className="bg-canvas dark:bg-[#0a0e19] py-[25px] md:py-[50px] lg:py-[58.5px] xl:py-[125px] px-[20px] md:px-[30px] lg:px-[40px] xl:px-[60px] rounded-[10px] md:rounded-[20px] relative border border-hairline dark:border-white/[0.06]"
            id="orq8TestimonialsSlides"
          >
            <Swiper
              spaceBetween={25}
              slidesPerView={1}
              navigation={true}
              autoplay={{
                delay: 5000,
                disableOnInteraction: false,
                pauseOnMouseEnter: true,
              }}
              modules={[Autoplay, Navigation]}
              className="partner-slides"
            >
              {testimonials.map((testimonial) => (
                <SwiperSlide key={testimonial.id}>
                  {/* Quote icon */}
                  <svg className="w-[36px] h-[27px] mb-[15px] md:mb-[25px] xl:mb-[40px] text-emerald" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151C7.546 6.068 5.983 8.789 5.983 11H10v10H0z" />
                  </svg>

                  <p className="font-light text-md md:text-lg lg:text-[20px] xl:text-xl -tracking-[.44px] lg:-tracking-[1px] xl:-tracking-[1.44px] text-ink dark:text-white !leading-[1.5]">
                    {testimonial.quote}
                  </p>

                  <div className="flex items-center gap-[15px] mt-[20px] md:mt-[30px] xl:mt-[45px]">
                    <div className={`w-[44px] h-[44px] rounded-full ${testimonial.color} flex items-center justify-center flex-none text-[14px] font-bold`}>
                      {testimonial.initials}
                    </div>
                    <div>
                      <h3 className="!text-base md:!text-md !font-semibold !mb-[5px]">
                        {testimonial.name}
                      </h3>
                      <span className="block text-ink-muted dark:text-white/50 text-sm">
                        {testimonial.position}
                      </span>
                    </div>
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>

          {/* Visual panel — Trezo style with trust badge */}
          <div className="text-center relative rounded-[10px] md:rounded-[20px] overflow-hidden">
            {/* Organization visualization */}
            <div className="bg-canvas dark:bg-[#0f1628] rounded-[20px] border border-hairline dark:border-white/[0.06] h-full flex flex-col items-center justify-center p-[40px] md:p-[60px]">
              {/* Trust badge — Trezo style */}
              <div className="flex items-center gap-[12px] mb-[30px]">
                <div className="flex -space-x-[10px]">
                  {["SC", "MR", "JL", "AK"].map((initials, i) => {
                    const colors = ["bg-emerald/10 text-emerald", "bg-blue-500/10 text-blue-500", "bg-purple-500/10 text-purple-500", "bg-amber-500/10 text-amber-500"];
                    return (
                      <div
                        key={i}
                        className={`w-[40px] h-[40px] rounded-full ${colors[i]} flex items-center justify-center text-[11px] font-bold border-2 border-white dark:border-[#0a0e19]`}
                      >
                        {initials}
                      </div>
                    );
                  })}
                </div>
                <span className="uppercase text-xs font-bold tracking-[1.8px] text-ink dark:text-white">
                  REAL FOUNDERS
                </span>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-[30px] text-center">
                <div>
                  <p className="text-3xl md:text-4xl font-light text-ink dark:text-white">3</p>
                  <p className="text-[12px] text-ink-muted dark:text-white/50 mt-[4px]">Plan tiers</p>
                </div>
                <div>
                  <p className="text-3xl md:text-4xl font-light text-ink dark:text-white">25</p>
                  <p className="text-[12px] text-ink-muted dark:text-white/50 mt-[4px]">AI employees</p>
                </div>
                <div>
                  <p className="text-3xl md:text-4xl font-light text-ink dark:text-white">24/7</p>
                  <p className="text-[12px] text-ink-muted dark:text-white/50 mt-[4px]">Always running</p>
                </div>
              </div>

              <p className="text-[13px] text-ink-muted dark:text-white/40 mt-[30px] max-w-[300px]">
                Your AI organization works while you sleep. Every Monday, a report on what happened.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Testimonials;
