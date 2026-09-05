"use client";

import React, { useState } from "react";
import Link from "next/link";

interface FAQItem {
  id: number;
  question: string;
  answer: string | React.ReactNode;
}

const Faqs: React.FC = () => {
  const faqItems: FAQItem[] = [
    {
      id: 1,
      question: "Is this another chatbot?",
      answer: (
        <p>
          No. A chatbot waits for a prompt and answers. ORQ8 is an
          organization: an Executive Agent plans the work, hires the right
          specialists, coordinates them, and reports back. You steer it like a CEO, not type at it like a search bar.
        </p>
      ),
    },
    {
      id: 2,
      question: "What can the agents actually do?",
      answer: (
        <p>
          Research, writing, code, analysis, planning, and coordination, with
          real tools, real files, and real output. Agents form departments,
          join projects, and work together on the goals you set. If a job needs
          a capability, ORQ8 hires it.
        </p>
      ),
    },
    {
      id: 3,
      question: "How do I stay in control?",
      answer: (
        <p>
          Every employee has an explicit authority profile: what it can do,
          what it can spend, what requires your approval, what is forbidden.
          Consequential actions always come to you. You can pause any agent, any
          department, or the entire organization instantly.
        </p>
      ),
    },
    {
      id: 4,
      question: "Can I bring my own keys or self-host?",
      answer: (
        <p>
          Yes. BYOK is built in. Connect your own model providers and pay
          exactly what the work costs, no markup. The full stack is also
          self-hostable with the free local version.
        </p>
      ),
    },
    {
      id: 5,
      question: "How much does ORQ8 cost?",
      answer: (
        <p>
          Joining the waitlist is free. When your cohort opens, every plan
          starts with 7 days free. Founder is $39/month, Team is $99/month,
          and Company is $249/month. We take a credit card up front, you pay
          nothing until day 8, and you can cancel any time.
        </p>
      ),
    },
  ];

  const [openItem, setOpenItem] = useState<number | null>(1);

  const toggleAccordion = (id: number) => {
    setOpenItem((prev) => (prev === id ? null : id));
  };

  return (
    <div id="faq" className="relative z-[1] bg-white py-[80px] md:py-[120px] lg:py-[160px] scroll-mt-[100px]">
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1200px] mx-auto px-[20px] md:px-[24px]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[40px] lg:gap-[60px]">
          <div className="md:max-w-[480px]">
            <span className="block uppercase font-bold tracking-[0.2em] text-overline text-orq8-orange mb-[16px]">
              FAQ
            </span>
            <h2 className="!text-black !mb-[20px] md:!mb-[24px] !font-normal !text-[32px] md:!text-[40px] lg:!text-[48px] -tracking-[0.5px] md:-tracking-[1px]">
              Questions, before you ask them
            </h2>
            <p className="md:text-base text-gray-700 !mb-[28px]">
              Something else on your mind? We read every message. Ask us anything about how ORQ8 would run your company.
            </p>
            <Link
              href="/contact"
              className="btn-press inline-block rounded-full bg-orq8-orange px-[28px] py-[12px] uppercase text-overline font-bold text-white tracking-[0.15em] hover:bg-orq8-orange-dark transition-colors"
            >
              <span className="flex items-center justify-center gap-[12px]">
                Contact Us{" "}
                <i className="ri-arrow-right-up-line w-[28px] h-[28px] rounded-full bg-white/10 text-white flex items-center justify-center text-sm"></i>
              </span>
            </Link>
          </div>

          <div className="space-y-[12px]">
            {faqItems.map((item) => (
              <div
                key={item.id}
                className={`border rounded-[12px] overflow-hidden transition-colors ${
                  openItem === item.id
                    ? "bg-orq8-green/[0.03] border-orq8-green/20"
                    : "bg-gray-50 border-gray-100 hover:border-gray-200"
                }`}
              >
                <button
                  className={`w-full text-left px-[24px] py-[20px] flex items-center justify-between transition-colors ${
                    openItem === item.id ? "" : ""
                  }`}
                  type="button"
                  onClick={() => toggleAccordion(item.id)}
                  aria-expanded={openItem === item.id}
                  aria-controls={`faq-${item.id}`}
                >
                  <span className="text-base font-medium text-black pr-[16px]">
                    {item.question}
                  </span>
                  <span className="block leading-none text-orq8-orange text-xl transition-transform duration-300 flex-none">
                    <i
                      className={`ri-arrow-down-s-line ${
                        openItem === item.id ? "rotate-180" : ""
                      }`}
                    ></i>
                  </span>
                </button>
                <div
                  id={`faq-${item.id}`}
                  className={`px-[24px] overflow-hidden transition-all duration-300 ${
                    openItem === item.id ? "pb-[20px] max-h-[500px]" : "max-h-0"
                  }`}
                >
                  <div className="text-gray-700 text-md leading-[1.7]">
                    {item.answer}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Faqs;
