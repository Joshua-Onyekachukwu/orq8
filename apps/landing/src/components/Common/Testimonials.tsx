"use client";

import React, { useEffect } from "react";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Navigation } from "swiper/modules";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

interface Testimonial {
  id: number;
  quote: string;
  role: string;
}

const Testimonials: React.FC = () => {
  const testimonials: Testimonial[] = [
    {
      id: 1,
      quote:
        "I spend Sundays doing six jobs nobody hired me for — accounting, marketing, ops, support. ORQ8 is the first thing that treats my business like a company instead of a to-do list.",
      role: "Solo founder",
    },
    {
      id: 2,
      quote:
        "I've tried every AI tool. They answer questions. None of them does the work. ORQ8 is the difference between a chatbot and an employee — it plans, it hires, it reports back.",
      role: "Product founder",
    },
    {
      id: 3,
      quote:
        "The Monday report alone is worth it. For the first time I actually know what my company did this week — what it cost, what's blocked, and what needs my decision.",
      role: "E-commerce founder",
    },
  ];

  const reducedMotion = usePrefersReducedMotion();

  // Swiper's default prev/next buttons have no accessible names — label them once mounted.
  useEffect(() => {
    const root = document.getElementById("financeTestimonialsSlides");
    if (!root) return;
    root
      .querySelectorAll(".swiper-button-prev, .swiper-button-next")
      .forEach((el) => {
        if (!el.getAttribute("aria-label")) {
          el.setAttribute(
            "aria-label",
            el.classList.contains("swiper-button-prev")
              ? "Previous testimonial"
              : "Next testimonial"
          );
        }
      });
  }, []);

  return (
    <>
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
        <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center md:max-w-[495px] lg:max-w-[600px]">
          <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orange-400 mb-[10px] lg:mb-[15px]">
            The problem
          </span>
          <h2 className="!mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
            Founders don&apos;t need more tools.{" "}
            <span className="text-primary-500">They need a company.</span>
          </h2>
          <p className="mt-[10px] lg:mt-[14px] text-sm md:text-[15px] text-gray-500 dark:text-gray-400">
            What early founders tell us — paraphrased, names kept private.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[25px]">
          <div
            className="bg-[#f4f4fa] dark:bg-navy-900 py-[25px] md:py-[50px] lg:py-[58.5px] xl:py-[125px] px-[20px] md:px-[30px] lg:px-[40px] xl:px-[60px] rounded-[10px] md:rounded-[20px] relative"
            id="financeTestimonialsSlides"
          >
            <Swiper
              spaceBetween={25}
              slidesPerView={1}
              navigation={true}
              autoplay={
                reducedMotion
                  ? false
                  : {
                      delay: 5000,
                      disableOnInteraction: false,
                      pauseOnMouseEnter: true,
                    }
              }
              modules={[Autoplay, Navigation]}
              className="partner-slides"
            >
              {testimonials.map((testimonial) => (
                <SwiperSlide key={testimonial.id}>
                  <Image
                    src="/images/icons/quote.svg"
                    className="mb-[15px] md:mb-[25px] xl:mb-[40px]"
                    alt=""
                    width={36}
                    height={27}
                  />
                  <p className="font-light text-md md:text-lg lg:text-[20px] xl:text-xl -tracking-[.44px] lg:-tracking-[1px] xl:-tracking-[1.44px] text-black dark:text-white !leading-[1.5]">
                    {testimonial.quote}
                  </p>
                  <div className="flex items-center gap-[15px] mt-[20px] md:mt-[30px] xl:mt-[45px]">
                    <div
                      aria-hidden="true"
                      className="w-[44px] h-[44px] rounded-full bg-lime/15 text-lime flex items-center justify-center font-bold text-lg shrink-0"
                    >
                      {testimonial.role.charAt(0)}
                    </div>
                    <div>
                      <h3 className="!text-base md:!text-md !font-semibold !mb-[5px]">
                        {testimonial.role}
                      </h3>
                      <span className="block">Early beta · paraphrased</span>
                    </div>
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>

          <div className="text-center relative rounded-[10px] md:rounded-[20px]">
            <Image
              src="/images/testimonials.jpg"
              alt=""
              aria-hidden="true"
              className="rounded-[20px] inline-block"
              width={939}
              height={939}
            />

            <div
              className="absolute ltr:left-[20px] rtl:right-[20px] bottom-[20px] md:max-w-[386px] uppercase text-xs font-bold tracking-[1.8px] rounded-[10px] md:rounded-[50px] border border-white dark:border-dark p-[10px] bg-white/40 dark:bg-dark/40 text-black dark:text-white text-center ltr:md:text-left rtl:md:text-right md:flex items-center gap-[10px] ltr:md:pr-[30px] rtl:md:pl-[30px]"
              style={{
                backdropFilter: "blur(40px)",
              }}
            >
              <div className="flex items-center justify-center ltr:md:justify-left rtl:md:justify-right mb-[12px] md:mb-0">
                {[0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    aria-hidden="true"
                    className="w-[40px] h-[40px] rounded-full border-[2px] border-white dark:border-dark bg-lime/15 text-lime flex items-center justify-center ltr:-mr-[15px] rtl:-ml-[15px] ltr:last:mr-0 rtl:last:ml-0"
                  >
                    <i className="ri-user-smile-line text-[18px]"></i>
                  </div>
                ))}
              </div>
              FOUNDERS WHO RUN IT
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Testimonials;
