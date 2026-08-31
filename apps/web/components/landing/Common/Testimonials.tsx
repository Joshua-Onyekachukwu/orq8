"use client";

import React, { useState } from "react";
import Image from "next/image";

interface Testimonial {
  id: number;
  quote: string;
  name: string;
  role: string;
  company: string;
  avatar: string;
}

const testimonials: Testimonial[] = [
  {
    id: 1,
    quote:
      "I spend Sundays doing six jobs nobody hired me for: accounting, marketing, ops, support. ORQ8 is the first thing that treats my business like a company instead of a to-do list.",
    name: "Daniel R.",
    role: "Solo Founder",
    company: "SaaS Startup",
    avatar: "/images/founders/founder-1.jpg",
  },
  {
    id: 2,
    quote:
      "I've tried every AI tool. They answer questions. None of them does the work. ORQ8 is the difference between a chatbot and an employee. It plans, it hires, it reports back.",
    name: "Amara K.",
    role: "Product Founder",
    company: "Fintech",
    avatar: "/images/founders/founder-2.jpg",
  },
  {
    id: 3,
    quote:
      "The Monday report alone is worth it. For the first time I actually know what my company did this week: what it cost, what's blocked, and what needs my decision.",
    name: "Liam C.",
    role: "E-commerce Founder",
    company: "DTC Brand",
    avatar: "/images/founders/founder-3.jpg",
  },
  {
    id: 4,
    quote:
      "I was skeptical about AI employees. Then I watched ORQ8 hire a research agent, brief it, and deliver a market analysis in 20 minutes that would have taken me two days. That's when I got it.",
    name: "Priya M.",
    role: "Agency Owner",
    company: "Marketing Agency",
    avatar: "/images/testimonials/priya.svg",
  },
  {
    id: 5,
    quote:
      "The approval gates changed everything. I don't have to worry about AI going rogue. It proposes, I decide. That's exactly how a solo founder should work with AI.",
    name: "James T.",
    role: "Solo Founder",
    company: "Consulting",
    avatar: "/images/testimonials/james.svg",
  },
  {
    id: 6,
    quote:
      "ORQ8 feels like hiring a COO, a marketing team, and a data analyst — except they cost less than my coffee budget and they never sleep. I'm building faster than I ever thought possible.",
    name: "Sofia L.",
    role: "First-time Founder",
    company: "Health Tech",
    avatar: "/images/testimonials/sofia.svg",
  },
];

const Testimonials: React.FC = () => {
  const [current, setCurrent] = useState(0);

  const prev = () =>
    setCurrent((c) => (c - 1 + testimonials.length) % testimonials.length);
  const next = () => setCurrent((c) => (c + 1) % testimonials.length);

  const testimonial = testimonials[current]!;

  return (
    <div className="py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px] bg-white">
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
        {/* Section header */}
        <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center md:max-w-[495px] lg:max-w-[600px]">
          <span className="block uppercase font-bold tracking-[1.8px] text-xs text-emerald mb-[10px] lg:mb-[15px]">
            Testimonials
          </span>
          <h2 className="!text-navy-950 !mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
            Founders don&apos;t need more tools.{" "}
            <span className="text-emerald font-medium">They need a company.</span>
          </h2>
          <p className="mt-[10px] lg:mt-[14px] text-sm md:text-[15px] text-gray-500">
            What early founders tell us. Names kept private.
          </p>
        </div>

        {/* Featured testimonial */}
        <div className="relative mx-auto max-w-[900px]">
          <div
            role="group"
            aria-roledescription="carousel"
            aria-label="Founder testimonials"
            aria-live="polite"
            className="rounded-[20px] md:rounded-[30px] border border-gray-200 bg-gray-50 px-[24px] md:px-[60px] lg:px-[80px] py-[35px] md:py-[60px] text-center"
          >
            {/* Quote mark */}
            <div className="mb-[20px] md:mb-[30px]">
              <span className="text-[48px] md:text-[64px] leading-none text-emerald/20 font-serif">
                &ldquo;
              </span>
            </div>

            <p className="!mb-0 font-light text-md md:text-lg lg:text-[22px] xl:text-2xl -tracking-[.44px] lg:-tracking-[1px] xl:-tracking-[1.44px] text-navy-950 !leading-[1.6] min-h-[120px] md:min-h-[140px] flex items-center justify-center">
              {testimonial.quote}
            </p>

            <div className="flex items-center justify-center gap-[15px] mt-[25px] md:mt-[40px]">
              <div className="w-[48px] h-[48px] rounded-full overflow-hidden border-2 border-emerald shrink-0">
                <Image
                  src={testimonial.avatar}
                  alt={testimonial.name}
                  width={48}
                  height={48}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="text-left">
                <h3 className="!text-base md:!text-md !font-semibold !mb-[3px] text-navy-950">
                  {testimonial.name}
                </h3>
                <span className="block text-sm text-gray-500">
                  {testimonial.role} · {testimonial.company}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-center gap-[20px] mt-[25px] md:mt-[30px]">
            <button
              type="button"
              onClick={prev}
              aria-label="Previous testimonial"
              className="btn-press w-[42px] h-[42px] rounded-full border border-gray-300 text-gray-500 flex items-center justify-center hover:text-emerald hover:border-emerald transition-colors"
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
                  className={`rounded-full transition-all duration-300 ${
                    i === current
                      ? "bg-emerald w-[24px] h-[8px]"
                      : "bg-gray-300 w-[8px] h-[8px] hover:bg-gray-400"
                  }`}
                ></button>
              ))}
            </div>

            <button
              type="button"
              onClick={next}
              aria-label="Next testimonial"
              className="btn-press w-[42px] h-[42px] rounded-full border border-gray-300 text-gray-500 flex items-center justify-center hover:text-emerald hover:border-emerald transition-colors"
            >
              <i className="ri-arrow-right-line text-[18px]"></i>
            </button>
          </div>
        </div>

        {/* All testimonials grid (desktop) */}
        <div className="hidden lg:grid grid-cols-3 gap-[24px] mt-[60px]">
          {testimonials.map((t) => (
            <div
              key={t.id}
              className="rounded-[16px] border border-gray-200 bg-white p-[24px] transition-all duration-300 hover:shadow-lg hover:border-emerald/30"
            >
              {/* Stars */}
              <div className="flex gap-[2px] mb-[14px]">
                {[1, 2, 3, 4, 5].map((s) => (
                  <i key={s} className="ri-star-fill text-[14px] text-emerald"></i>
                ))}
              </div>

              <p className="!mb-[18px] text-[14px] leading-[1.65] text-gray-600 !font-normal">
                &ldquo;{t.quote}&rdquo;
              </p>

              <div className="flex items-center gap-[12px] pt-[14px] border-t border-gray-100">
                <div className="w-[36px] h-[36px] rounded-full overflow-hidden shrink-0">
                  <Image
                    src={t.avatar}
                    alt={t.name}
                    width={36}
                    height={36}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <p className="!text-[13px] !font-semibold !mb-0 text-navy-950">
                    {t.name}
                  </p>
                  <span className="text-[11px] text-gray-400">
                    {t.role} · {t.company}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Testimonials;
