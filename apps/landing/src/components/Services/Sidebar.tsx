"use client";

import React from "react";
import Link from "next/link";

interface ServiceItem {
  id: number;
  title: string;
  href: string;
  isActive?: boolean;
}

const servicesData: ServiceItem[] = [
  {
    id: 1,
    title: "Multi-Account Aggregation",
    href: "/services/details",
    isActive: true,
  },
  {
    id: 2,
    title: "Digital Payments & Transfers",
    href: "/services/details",
  },
  {
    id: 3,
    title: "Bill Payment Automation",
    href: "/services/details",
  },
  {
    id: 4,
    title: "Personal Finance Analytics",
    href: "/services/details",
  },
  {
    id: 5,
    title: "Goal-Based Savings Plans",
    href: "/services/details",
  },
  {
    id: 6,
    title: "Micro-Investment Services",
    href: "/services/details",
  },
];

const Sidebar: React.FC = () => {
  return (
    <>
      <div className="bg-[#f0e7fd] dark:bg-[#0a0e19] sticky top-[86px] p-[20px] md:p-[30px] xl:p-[40px] rounded-[10px] md:rounded-[20px] xl:max-w-[358px]">
        <h3 className="!font-light !text-[20px] md:!text-[22px] lg:!text-xl -tracking-[.44px] md:-tracking-[1px] lg:-tracking-[1.44px] !mb-[15px] md:!mb-[25px] xl:!mb-[30px]">
          All Services
        </h3>
        <ul className="md:text-[15px] lg:text-md -tracking-[0.16px] md:-tracking-[0.50px] lg:-tracking-[0.96px]">
          {servicesData.map((service) => (
            <li
              key={service.id}
              className="mb-[12px] md:mb-[18px] lg:mb-[20px] xl:mb-[22px] last:mb-0"
            >
              <Link
                href={service.href}
                className={`${
                  service.isActive
                    ? "text-primary-500"
                    : "text-black dark:text-white"
                } transition-all hover:text-primary-500 relative ltr:pl-[20px] rtl:pr-[20px] ltr:md:pl-[25px] rtl:md:pr-[25px]`}
              >
                <i className="ri-arrow-right-s-fill absolute top-1/2 -translate-y-1/2 text-lg ltr:-left-[5px] rtl:-right-[5px]"></i>
                {service.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
};

export default Sidebar;
