"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";

interface ServiceItem {
  id: number;
  title: string;
  description: string;
  image: string;
  slug: string;
}

const Services: React.FC = () => {
  const services: ServiceItem[] = [
    {
      id: 1,
      title: "Multi-Account Aggregation",
      description:
        "Securely connect and manage multiple bank accounts, credit cards, digital wallets, and investments.",
      image: "/images/services/service1.jpg",
      slug: "/services/details",
    },
    {
      id: 2,
      title: "Digital Payments & Transfers",
      description:
        "Instantly send & receive money, pay anyone, & transfer funds between accounts with advanced security & ease.",
      image: "/images/services/service2.jpg",
      slug: "/services/details",
    },
    {
      id: 3,
      title: "Bill Payment Automation",
      description:
        "Automate recurring bill payments, avoid late fees, and track all your bills in one convenient dashboard.",
      image: "/images/services/service3.jpg",
      slug: "/services/details",
    },
  ];

  // Function to determine background color based on ID
  const getBgColor = (id: number) => {
    switch (id) {
      case 1:
        return "bg-[#f8dcc9]";
      case 2:
        return "bg-[#f0e7fd]";
      case 3:
        return "bg-[#e4ffd2]";
      default:
        return "bg-gray-200"; // Fallback color
    }
  };

  return (
    <>
      <div className="py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center md:max-w-[495px] lg:max-w-[600px]">
            <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orange-400 mb-[10px] lg:mb-[15px]">
              Services
            </span>
            <h2 className="!mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
              Our top services for your financial{" "}
              <span className="text-primary-500">stability</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[25px]">
            {services.map((service) => (
              <div
                key={service.id}
                // Dynamically set background color based on service ID
                className={`group rounded-[10px] md:rounded-[20px] ${getBgColor(
                  service.id
                )} dark:bg-[#0a0e19] p-[20px]`}
              >
                <div className="pt-[5px] md:pt-[15px] lg:pt-[30px] md:px-[10px] xl:px-[20px]">
                  <h3 className="!font-light !text-[20px] md:!text-[22px] lg:!text-xl -tracking-[.44px] md:-tracking-[1px] lg:-tracking-[1.44px] !mb-[10px] md:!mb-[15px] lg:!mb-[25px]">
                    <Link
                      href={service.slug}
                      className="transition-all hover:text-primary-500"
                    >
                      {service.title}
                    </Link>
                  </h3>
                  <p className="md:text-[15px] lg:text-md -tracking-[0.16px]">
                    {service.description}
                  </p>
                </div>
                <div className="mt-[20px] md:mt-[30px] lg:mt-[45px] relative">
                  <Image
                    src={service.image}
                    className="inline-block rounded-[10px]"
                    alt={`${service.title
                      .toLowerCase()
                      .replace(/\s+/g, "-")}-image`}
                    width={680}
                    height={548}
                  />
                  <Link
                    href={service.slug}
                    className="rounded-full flex items-center justify-center w-[60px] h-[60px] md:w-[68px] md:h-[68px] border-[2px] border-white bg-primary-500 text-white text-xl absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-[50%] z-[1] transition-all hover:bg-primary-600 opacity-0 group-hover:opacity-100"
                  >
                    <i className="ri-arrow-right-long-line rtl:-scale-x-110"></i>
                  </Link>
                  <div className="bg-[#23272E]/40 rounded-[10px] border-[5px] border-white absolute top-0 left-0 right-0 bottom-0 transition-all opacity-0 group-hover:opacity-100"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default Services;
