"use client";

import React from "react"; 

const ContactInfo: React.FC = () => {
  return (
    <>
      <h2 className="!mb-[25px] md:!mb-[35px] lg:!mb-[45px] !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
        Contact us anytime- We will love to hear from you
      </h2>
      <span className="block text-black dark:text-white font-medium text-xs uppercase tracking-[1.8px] mb-[5px] md:mb-[8px]">
        FOR GENERAL INQUIRIES
      </span>

      <a
        href="mailto:helloinfo@trezo.com"
        className="inline-block font-light md:-tracking-[.44px] lg:-tracking-[1.44px] text-md md:text-[22px] lg:text-xl transition-all hover:text-primary-500"
      >
        helloinfo@trezo.com
      </a>

      <span className="block text-black dark:text-white font-medium text-xs uppercase tracking-[1.8px] mb-[5px] md:mb-[8px] mt-[20px] md:mt-[30px] lg:mt-[40px]">
        ADDRESS
      </span>

      <span className="block font-light md:-tracking-[.44px] lg:-tracking-[1.44px] text-md md:text-[22px] lg:text-xl lg:max-w-[315px]">
        ORQ8 HQ <br />
        452 Market Street, Suite 1300 San Francisco, CA 94105, USA
      </span>

      <span className="block text-black dark:text-white font-medium text-xs uppercase tracking-[1.8px] mb-[5px] md:mb-[8px] mt-[20px] md:mt-[30px] lg:mt-[40px]">
        OPEN HOURS
      </span>

      <span className="block font-light md:-tracking-[.44px] lg:-tracking-[1.44px] text-md md:text-[22px] lg:text-xl">
        Mon-Fri 9:00AM to 4:00PM
      </span>

      <span className="block text-black dark:text-white font-medium text-xs uppercase tracking-[1.8px] mb-[5px] md:mb-[8px] mt-[20px] md:mt-[30px] lg:mt-[40px]">
        SOCIAL MEDIA
      </span>

      <div className="mt-[15px] flex items-center gap-[10px]">
        <a
          href="#"
          target="_blank"
          className="leading-none inline-block text-orange-400 text-lg transition-all hover:text-primary-500"
        >
          <i className="ri-facebook-fill"></i>
        </a>
        <a
          href="#"
          target="_blank"
          className="leading-none inline-block text-orange-400 text-lg transition-all hover:text-primary-500"
        >
          <i className="ri-twitter-x-fill"></i>
        </a>
        <a
          href="#"
          target="_blank"
          className="leading-none inline-block text-orange-400 text-lg transition-all hover:text-primary-500"
        >
          <i className="ri-instagram-fill"></i>
        </a>
        <a
          href="#"
          target="_blank"
          className="leading-none inline-block text-orange-400 text-lg transition-all hover:text-primary-500"
        >
          <i className="ri-linkedin-fill"></i>
        </a>
      </div>
    </>
  );
};

export default ContactInfo;
