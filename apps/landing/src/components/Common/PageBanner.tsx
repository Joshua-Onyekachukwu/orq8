"use client";

import React from "react";
import Link from "next/link";

interface PageBannerProps {
  pageTitle: string;
}

const PageBanner: React.FC<PageBannerProps> = ({ pageTitle }) => {
  return (
    <>
      <div className="relative z-[1] pt-[120px] md:pt-[140px] lg:pt-[200px] xl:pt-[220px] pb-[70px] md:pb-[90px] lg:pb-[110px] dark:bg-[#0a0e19] overflow-hidden">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="text-center">
            <ul className="mb-[5px] md:mb-[8px]">
              <li className="mx-[5px] ltr:last:mr-0 rtl:last:ml-0 ltr:first:ml-0 rtl:first:mr-0 inline-block uppercase font-semibold text-xs tracking-[1.8px]">
                <Link
                  href="/"
                  className="text-orange-400 transition-all hover:text-primary-500"
                >
                  Home
                </Link>
              </li>
              <li className="inline-block">
                <i className="ri-arrow-right-s-line"></i>
              </li>
              <li className="mx-[5px] ltr:last:mr-0 rtl:last:ml-0 ltr:first:ml-0 rtl:first:mr-0 inline-block uppercase font-semibold text-xs tracking-[1.8px]">
                {pageTitle}
              </li>
            </ul>

            <h1 className="!mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
              {pageTitle}
            </h1>
          </div>
        </div>

        <div
          className="absolute top-0 left-0 right-0 bottom-0 bg-cover bg-center bg-no-repeat -z-[1] dark:hidden"
          style={{
            backgroundImage: "url(/images/page-banner-bg.jpg)",
          }}
        ></div>
      </div>
    </>
  );
};

export default PageBanner;
