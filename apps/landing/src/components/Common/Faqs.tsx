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
        <>
          <p>
            No. A chatbot waits for a prompt and answers. ORQ8 is an
            organization: an Executive Agent plans the work, hires the right
            specialists, coordinates them, and reports back.            You steer it like a CEO, not type at it like a search bar.
          </p>
        </>
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
          Joining the waitlist is free. When your cohort opens, you get 7 days
          free with your first agents. We take a credit card up front, you pay
          nothing until day 8, and you can cancel any time. When your
          organization earns its keep, Pro is $49/month.
        </p>
      ),
    },
  ];

  const [openItem, setOpenItem] = useState<number | null>(1);

  const toggleAccordion = (id: number) => {
    setOpenItem((prev) => (prev === id ? null : id));
  };

  return (
    <>
      <div id="faq" className="pt-[210px] md:pt-[250px] lg:pt-[290px] relative z-[1] scroll-mt-[100px]">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[25px]">
            <div className="md:max-w-[470px]">
              <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orange-400 mb-[10px] lg:mb-[15px]">
                FAQ
              </span>
              <h2 className="!mb-[15px] md:!mb-[20px] lg:!mb-[30px] !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
                Questions, before you ask them
              </h2>
              <p className="md:text-[15px] lg:text-md -tracking-[0.16px] mb-[25px]">            Something else on your mind? We read every message. Ask us anything about how ORQ8 would run your company.
              </p>
              <Link
                href="/contact"
                className="btn-press inline-block rounded-[60px] bg-primary-500 p-[7px] md:p-[10px] uppercase text-xs font-bold text-white tracking-[1px] md:tracking-[1.8px] hover:bg-lime hover:text-black"
              >
                <span className="ltr:ml-[15px] rtl:mr-[15px] ltr:md:ml-[20px] rtl:md:mr-[20px] flex items-center justify-center gap-[15px] md:gap-[20px]">
                  Contact Us{" "}
                  <i className="ri-arrow-right-up-line w-[30px] md:w-[36px] h-[30px] md:h-[36px] rounded-full bg-white dark:bg-dark text-black dark:text-white flex items-center justify-center text-md"></i>
                </span>
              </Link>
            </div>

            <div className="toc-accordion" id="tablesOfContentAccordion">
              {faqItems.map((item) => (
                <div
                  key={item.id}
                  className="toc-accordion-item bg-white rounded-[10px] dark:bg-navy-900 mb-[15px] last:mb-0"
                >
                  <button
                    className={`toc-accordion-button ${
                      openItem === item.id ? "open" : ""
                    } text-base md:text-md font-normal px-[15px] md:px-[20px] py-[15px] md:py-[18px] flex items-center justify-between w-full ltr:text-left rtl:text-right relative text-black dark:text-white md:-tracking-[0.25px] lg:-tracking-[0.96px]`}
                    type="button"
                    onClick={() => toggleAccordion(item.id)}
                    aria-expanded={openItem === item.id}
                    aria-controls={`faq-${item.id}`}
                  >
                    {item.id}. {item.question}
                    <span className="block leading-none text-primary-500 text-[22px] transition-transform duration-300">
                      <i
                        className={`ri-arrow-down-s-line ${
                          openItem === item.id ? "rotate-180" : ""
                        }`}
                      ></i>
                    </span>
                  </button>
                  <div
                    id={`faq-${item.id}`}
                    className={`toc-accordion-collapse ${
                      openItem === item.id ? "block" : "hidden"
                    } -mt-[3px] px-[15px] md:px-[20px] pb-[15px] md:pb-[18px]`}
                  >
                    {item.answer}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute top-[38%] ltr:left-0 rtl:right-0 ltr:md:left-[26%] rtl:md:right-[26%] rounded-[556.325px] w-[290px] h-[290px] md:w-[556.325px] md:h-[466.194px] blur-[362px] bg-primary-500 -z-[1] opacity-60"></div>
        <div className="absolute top-[40%] ltr:right-0 rtl:left-0 ltr:md:right-[23%] rtl:md:left-[23%] rounded-[672.563px] w-[290px] h-[290px] md:w-[672.563px] md:h-[527.732px] blur-[362px] bg-lime -z-[1] opacity-60"></div>
      </div>
    </>
  );
};

export default Faqs;
