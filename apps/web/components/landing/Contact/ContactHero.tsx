"use client";

import React from "react";
import { Reveal } from "../Common/Reveal";

const ContactHero: React.FC = () => {
  return (
    <section className="bg-white pt-[70px] md:pt-[90px] lg:pt-[110px] xl:pt-[130px] pb-[50px] md:pb-[70px] lg:pb-[90px]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="max-w-3xl">
            <span className="mb-4 block text-xs font-bold uppercase tracking-[0.2em] text-emerald">
              Get in Touch
            </span>
            <h1 className="mb-6 text-4xl font-light leading-tight tracking-tight text-navy-950 md:text-5xl lg:text-6xl">
              We would love to{" "}
              <span className="text-emerald">hear from you</span>
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-gray-500 md:text-lg">
              Whether you have questions about the platform, need support, or
              want to discuss enterprise options — we read every message.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

export default ContactHero;
