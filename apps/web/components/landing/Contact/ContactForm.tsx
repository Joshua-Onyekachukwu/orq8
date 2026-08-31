"use client";

import React, { useState } from "react";
import ContactInfo from "./ContactInfo";
import { Reveal } from "../Common/Reveal";

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
    <section className="bg-gray-50 py-20 md:py-28 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-20 items-start">
          {/* Contact Info */}
          <Reveal>
            <ContactInfo />
          </Reveal>

          {/* Contact Form */}
          <Reveal>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8 lg:p-10 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.08)]">
              <h3 className="mb-6 text-lg font-medium text-navy-950">
                Send us a message
              </h3>

              {status === "done" ? (
                <div className="py-12 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald/10">
                    <svg
                      className="h-6 w-6 text-emerald"
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
                  <p className="text-base font-medium text-navy-950">
                    Thank you! We will get back to you soon.
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Check your email for a confirmation.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label
                        htmlFor="contact-name"
                        className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-gray-400"
                      >
                        Name
                      </label>
                      <input
                        type="text"
                        id="contact-name"
                        name="name"
                        autoComplete="name"
                        required
                        className="h-11 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm text-navy-950 placeholder:text-gray-400 outline-none transition-colors focus:border-emerald focus:ring-1 focus:ring-emerald/30"
                        placeholder="Enter name"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="contact-email"
                        className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-gray-400"
                      >
                        Email
                      </label>
                      <input
                        type="email"
                        id="contact-email"
                        name="email"
                        autoComplete="email"
                        required
                        className="h-11 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm text-navy-950 placeholder:text-gray-400 outline-none transition-colors focus:border-emerald focus:ring-1 focus:ring-emerald/30"
                        placeholder="Enter email address"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="contact-subject"
                      className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-gray-400"
                    >
                      Subject
                    </label>
                    <input
                      type="text"
                      id="contact-subject"
                      name="subject"
                      className="h-11 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm text-navy-950 placeholder:text-gray-400 outline-none transition-colors focus:border-emerald focus:ring-1 focus:ring-emerald/30"
                      placeholder="What is this about?"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="contact-message"
                      className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-gray-400"
                    >
                      Message
                    </label>
                    <textarea
                      id="contact-message"
                      name="message"
                      required
                      rows={5}
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-navy-950 placeholder:text-gray-400 outline-none transition-colors focus:border-emerald focus:ring-1 focus:ring-emerald/30 resize-none"
                      placeholder="Write your message here"
                    />
                  </div>

                  {status === "error" && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
                      Something went wrong. Please try again.
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="inline-flex items-center gap-2 rounded-full bg-navy-950 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-950/90 disabled:opacity-60"
                  >
                    {status === "loading" ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Sending...
                      </>
                    ) : (
                      <>
                        Send Message
                        <svg
                          className="h-4 w-4"
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
          </Reveal>
        </div>
      </div>
    </section>
  );
};

export default ContactForm;
