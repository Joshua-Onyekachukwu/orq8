"use client";

import React from "react";

const ContactInfo: React.FC = () => {
  return (
    <div>
      <h2 className="mb-6 text-3xl font-light leading-tight tracking-tight text-black md:text-4xl">
        Let&apos;s talk about your company
      </h2>

      <p className="mb-10 max-w-md text-base leading-relaxed text-gray-500">
        Have questions about how ORQ8 works? Want to discuss enterprise options?
        We read every message and respond within 24 hours.
      </p>

      <div className="space-y-8">
        {/* Email */}
        <div>
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-widest text-gray-400">
            GENERAL INQUIRIES
          </span>
          <a
            href="mailto:hello@orq8.company"
            className="text-base text-black transition-colors hover:text-orq8-green"
          >
            hello@orq8.company
          </a>
        </div>

        {/* Address */}
        <div>
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-widest text-gray-400">
            ADDRESS
          </span>
          <p className="text-base text-black">
            ORQ8 HQ
            <br />
            452 Market Street, Suite 1300
            <br />
            San Francisco, CA 94105, USA
          </p>
        </div>

        {/* Hours */}
        <div>
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-widest text-gray-400">
            OPEN HOURS
          </span>
          <p className="text-base text-black">
            Mon–Fri 9:00 AM to 4:00 PM PST
          </p>
        </div>

        {/* Social */}
        <div>
          <span className="mb-2 block text-3xs font-semibold uppercase tracking-widest text-gray-400">
            FOLLOW US
          </span>
          <div className="flex items-center gap-3">
            <a
              href="https://twitter.com/orq8"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition-colors hover:border-orq8-green hover:text-orq8-green"
              aria-label="Twitter"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="https://linkedin.com/company/orq8"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition-colors hover:border-orq8-green hover:text-orq8-green"
              aria-label="LinkedIn"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactInfo;
