"use client";

import React from "react";

const ContactHero: React.FC = () => {
  return (
    <section className="bg-orq8-dark pt-[120px] md:pt-[160px] lg:pt-[200px] pb-[60px] md:pb-[80px] lg:pb-[100px]">
      <div className="mx-auto max-w-[1200px] px-[20px] md:px-[24px]">
        <div className="max-w-[800px]">
          <span className="mb-[16px] block text-overline font-bold uppercase tracking-[0.2em] text-orq8-orange">
            Get in Touch
          </span>
          <h1 className="mb-[24px] text-[36px] md:text-[48px] lg:text-[56px] font-normal leading-[1.1] tracking-tight text-white">
            We would love to{" "}
            <span className="text-orq8-lime">hear from you</span>
          </h1>
          <p className="max-w-[600px] text-base md:text-lg leading-relaxed text-white/50">
            Whether you have questions about the platform, need support, or
            want to discuss enterprise options — we read every message.
          </p>
        </div>
      </div>
    </section>
  );
};

export default ContactHero;
