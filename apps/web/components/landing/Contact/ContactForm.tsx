"use client";

import React, { useState } from "react";

const ContactForm: React.FC = () => {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    try {
      const form = e.currentTarget;
      const data = new FormData(form);
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          name: data.get("name"),
          source: "contact",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="bg-[#0A0A0B] py-[80px] md:py-[120px] lg:py-[160px]">
      <div className="mx-auto max-w-[1200px] px-[20px] md:px-[24px]">
        <div className="grid grid-cols-1 gap-[40px] lg:grid-cols-2 lg:gap-[80px] items-start">
          {/* Contact Info */}
          <div>
            <h2 className="mb-[24px] text-[28px] md:text-[32px] font-medium text-white">
              Send us a message
            </h2>
            <p className="text-[16px] text-white/50 leading-relaxed mb-[40px]">
              Have a question about ORQ8? Want to discuss enterprise options?
              Fill out the form and we&apos;ll get back to you within 24 hours.
            </p>

            <div className="space-y-[24px]">
              <div className="flex items-center gap-[16px]">
                <div className="w-[48px] h-[48px] rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-[#B8FF66]">
                  <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <div>
                  <p className="text-[13px] text-white/40 mb-[2px]">Email</p>
                  <p className="text-[15px] text-white">hello@orq8.com</p>
                </div>
              </div>

              <div className="flex items-center gap-[16px]">
                <div className="w-[48px] h-[48px] rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-[#B8FF66]">
                  <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[13px] text-white/40 mb-[2px]">Response time</p>
                  <p className="text-[15px] text-white">Within 24 hours</p>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.03] p-[32px] md:p-[40px]">
            {status === "done" ? (
              <div className="py-[40px] text-center">
                <div className="mx-auto mb-[16px] flex h-[56px] w-[56px] items-center justify-center rounded-full bg-[#B8FF66]/10">
                  <svg
                    className="h-[28px] w-[28px] text-[#B8FF66]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <p className="text-[18px] font-medium text-white">
                  Thank you! We will get back to you soon.
                </p>
                <p className="mt-[8px] text-[14px] text-white/50">
                  Check your email for a confirmation.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-[20px]">
                <div className="grid grid-cols-1 gap-[20px] md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="contact-name"
                      className="mb-[8px] block text-[11px] font-semibold uppercase tracking-widest text-white/40"
                    >
                      Name
                    </label>
                    <input
                      type="text"
                      id="contact-name"
                      name="name"
                      autoComplete="name"
                      required
                      className="h-[48px] w-full rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-[16px] text-[14px] text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#B8FF66] focus:ring-1 focus:ring-[#B8FF66]/30"
                      placeholder="Enter name"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="contact-email"
                      className="mb-[8px] block text-[11px] font-semibold uppercase tracking-widest text-white/40"
                    >
                      Email
                    </label>
                    <input
                      type="email"
                      id="contact-email"
                      name="email"
                      autoComplete="email"
                      required
                      className="h-[48px] w-full rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-[16px] text-[14px] text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#B8FF66] focus:ring-1 focus:ring-[#B8FF66]/30"
                      placeholder="Enter email address"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="contact-subject"
                    className="mb-[8px] block text-[11px] font-semibold uppercase tracking-widest text-white/40"
                  >
                    Subject
                  </label>
                  <input
                    type="text"
                    id="contact-subject"
                    name="subject"
                    className="h-[48px] w-full rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-[16px] text-[14px] text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#B8FF66] focus:ring-1 focus:ring-[#B8FF66]/30"
                    placeholder="What is this about?"
                  />
                </div>

                <div>
                  <label
                    htmlFor="contact-message"
                    className="mb-[8px] block text-[11px] font-semibold uppercase tracking-widest text-white/40"
                  >
                    Message
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    required
                    rows={5}
                    className="w-full rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-[16px] py-[12px] text-[14px] text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#B8FF66] focus:ring-1 focus:ring-[#B8FF66]/30 resize-none"
                    placeholder="Write your message here"
                  />
                </div>

                {status === "error" && (
                  <div className="rounded-[10px] border border-red-500/20 bg-red-500/10 px-[16px] py-[12px] text-[14px] text-red-400">
                    Something went wrong. Please try again.
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="inline-flex items-center gap-[10px] rounded-full bg-[#B8FF66] px-[24px] py-[12px] text-[14px] font-semibold text-[#0A0A0B] transition-colors hover:bg-[#A3E855] disabled:opacity-60"
                >
                  {status === "loading" ? (
                    <>
                      <span className="h-[16px] w-[16px] animate-spin rounded-full border-2 border-[#0A0A0B]/30 border-t-[#0A0A0B]" />
                      Sending...
                    </>
                  ) : (
                    <>
                      Send Message
                      <svg
                        className="h-[16px] w-[16px]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14 5l7 7m0 0l-7 7m7-7H3"
                        />
                      </svg>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactForm;
