"use client";

import React from "react";

interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

const LegalLayout: React.FC<LegalLayoutProps> = ({
  title,
  lastUpdated,
  children,
}) => {
  return (
    <section className="bg-orq8-dark pt-[120px] md:pt-[160px] lg:pt-[200px] pb-[60px] md:pb-[80px] lg:pb-[100px]">
      <div className="mx-auto max-w-[800px] px-[20px] md:px-[24px]">
        <span className="mb-[16px] block text-overline font-bold uppercase tracking-[0.2em] text-orq8-orange-bright">
          Legal
        </span>
        <h1 className="mb-[8px] text-[36px] md:text-[48px] lg:text-[56px] font-normal leading-[1.1] tracking-tight text-white">
          {title}
        </h1>
        <p className="mb-[48px] text-sm text-white/40">
          Last updated: {lastUpdated}
        </p>

        <div className="prose-orq8 space-y-[32px]">
          {children}
        </div>
      </div>
    </section>
  );
};

export default LegalLayout;
