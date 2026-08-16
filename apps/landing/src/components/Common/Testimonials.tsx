"use client";

import React, { useState } from "react";

interface Testimonial {
  id: number;
  quote: string;
  role: string;
}

const testimonials: Testimonial[] = [
  {
    id: 1,
    quote:
      "I spend Sundays doing six jobs nobody hired me for: accounting, marketing, ops, support. ORQ8 is the first thing that treats my business like a company instead of a to-do list.",
    role: "Solo founder",
  },
  {
    id: 2,
    quote:
      "I've tried every AI tool. They answer questions. None of them does the work. ORQ8 is the difference between a chatbot and an employee. It plans, it hires, it reports back.",
    role: "Product founder",
  },
  {
    id: 3,
    quote:
      "The Monday report alone is worth it. For the first time I actually know what my company did this week: what it cost, what's blocked, and what needs my decision.",
    role: "E-commerce founder",
  },
];

const Testimonials: React.FC = () => {
  const [current, setCurrent] = useState(0);

  const prev = () =>
    setCurrent((c) => (c - 1 + testimonials.length) % testimonials.length);
  const next = () => setCurrent((c) => (c + 1) % testimonials.length);

  const testimonial = testimonials[current];

  return (
    <>
      <div className="py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center md:max-w-[495px] lg:max-w-[600px]">
            <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orange-400 mb-[10px] lg:mb-[15px]">
              Testimonials
            </span>
            <h2 className="!mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
              Founders don&apos;t need more tools.{" "}
              <span className="text-primary-500">They need a company.</span>
            </h2>
            <p className="mt-[10px] lg:mt-[14px] text-sm md:text-[15px] text-gray-500 dark:text-gray-400">
              What early founders tell us. Paraphrased, names kept private.
            </p>
          </div>

          <div className="relative mx-auto max-w-[900px] rounded-[15px] md:rounded-[30px] bg-white dark:bg-navy-900 border border-gray-100 dark:border-white/10 shadow-sm px-[20px] md:px-[50px] lg:px-[70px] py-[35px] md:py-[60px] text-center">
            <i className="ri-double-quotes-l absolute top-[30px] ltr:left-[24px] rtl:right-[24px] md:top-[45px] ltr:md:left-[40px] rtl:md:right-[40px] text-[40px] md:text-[56px] text-lime leading-none"></i>

            <div
              role="group"
              aria-roledescription="carousel"
              aria-label="Founder testimonials"
              aria-live="polite"
            >
              <p className="!mb-0 font-light text-md md:text-lg lg:text-[22px] xl:text-2xl -tracking-[.44px] lg:-tracking-[1px] xl:-tracking-[1.44px] text-black dark:text-white !leading-[1.55] min-h-[120px] md:min-h-[110px] flex items-center justify-center">
                {testimonial.quote}
              </p>

              <div className="flex items-center justify-center gap-[15px] mt-[25px] md:mt-[40px]">
                <div
                  aria-hidden="true"
                  className="w-[46px] h-[46px] rounded-full bg-lime/15 text-lime flex items-center justify-center font-bold text-lg shrink-0"
                >
                  {testimonial.role.charAt(0)}
                </div>
                <div className="text-left">
                  <h3 className="!text-base md:!text-md !font-semibold !mb-[3px]">
                    {testimonial.role}
                  </h3>
                  <span className="block text-sm text-gray-500 dark:text-gray-400">
                    Early beta · paraphrased
                  </span>
                </div>
              </div>
            </div>

            {/* controls */}
            <div className="flex items-center justify-center gap-[20px] mt-[25px] md:mt-[30px]">
              <button
                type="button"
                onClick={prev}
                aria-label="Previous testimonial"
                className="btn-press w-[42px] h-[42px] rounded-full border border-gray-200 dark:border-white/15 text-gray-500 dark:text-gray-400 flex items-center justify-center hover:text-primary-500 hover:border-primary-500 transition-colors"
              >
                <i className="ri-arrow-left-line text-[18px]"></i>
              </button>

              <div className="flex items-center gap-[8px]">
                {testimonials.map((t, i) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setCurrent(i)}
                    aria-label={`Go to testimonial ${i + 1}`}
                    aria-current={i === current ? "true" : undefined}
                    className={`w-[8px] rounded-full transition-all duration-300 ${
                      i === current
                        ? "bg-primary-500 h-[8px]"
                        : "bg-gray-300 dark:bg-white/20 h-[8px] hover:bg-primary-300"
                    }`}
                  ></button>
                ))}
              </div>

              <button
                type="button"
                onClick={next}
                aria-label="Next testimonial"
                className="btn-press w-[42px] h-[42px] rounded-full border border-gray-200 dark:border-white/15 text-gray-500 dark:text-gray-400 flex items-center justify-center hover:text-primary-500 hover:border-primary-500 transition-colors"
              >
                <i className="ri-arrow-right-line text-[18px]"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Testimonials;
