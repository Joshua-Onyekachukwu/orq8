"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Define the menu items as a dynamic array
const menuItems = [
  { label: "Home", href: "/" },
  { label: "Platform", href: "/#features" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Pricing", href: "/pricing/" },
  { label: "Contact", href: "/contact/" },
];

const Navbar: React.FC = () => {
  const pathname = usePathname();

  // Sticky navbar
  useEffect(() => {
    const elementId = document.getElementById("navbar");
    const handleScroll = () => {
      if (window.scrollY > 80) {
        elementId?.classList.add("is-sticky");
      } else {
        elementId?.classList.remove("is-sticky");
      }
    };

    document.addEventListener("scroll", handleScroll);

    // Cleanup event listener on component unmount
    return () => {
      document.removeEventListener("scroll", handleScroll);
    };
  }, []); // Added empty dependency array to avoid repeated effect calls

  // Add active class to mobile menu
  const [isActiveMobileMenu, setActiveMobileMenu] = useState<boolean>(true);

  const handleToggleMobileMenu = (): void => {
    setActiveMobileMenu(!isActiveMobileMenu);
  };

  const Wordmark = ({ className = "" }: { className?: string }) => (
    <span
      className={`inline-flex items-center gap-[7px] text-[24px] font-bold tracking-[-1.2px] leading-none text-black dark:text-white ${className}`}
    >
      ORQ8
      <span className="w-[8px] h-[8px] rounded-full bg-orange-400 inline-block"></span>
    </span>
  );

  return (
    <>
      <div
        className="finance-navbar fixed top-0 right-0 left-0 transition-all h-auto z-[5] py-[20px] md:py-[25px]"
        id="navbar"
      >
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] 2xl:max-w-[1744px] mx-auto px-[12px]">
          <div className="flex items-center relative flex-wrap lg:flex-nowrap justify-between lg:justify-start">
            <Link href="/" className="inline-block">
              <Wordmark />
            </Link>

            <button
              type="button"
              className="inline-block relative leading-none lg:hidden"
              onClick={handleToggleMobileMenu}
            >
              <span className="h-[3px] w-[30px] my-[5px] block bg-dark dark:bg-white"></span>
              <span className="h-[3px] w-[30px] my-[5px] block bg-dark dark:bg-white"></span>
              <span className="h-[3px] w-[30px] my-[5px] block bg-dark dark:bg-white"></span>
            </button>

            {/* For Big Devices */}
            <div className="hidden lg:flex items-center grow basis-full">
              <ul
                className="navbar-nav flex mx-auto flex-row gap-[25px] xl:gap-[50px] bg-white dark:bg-dark rounded-[60px] lg:py-[20px] lg:px-[30px] xl:py-[30px] xl:px-[50px] 2xl:px-[100px]"
                style={{
                  boxShadow: "0px 4px 30px 0px rgba(146, 139, 221, 0.10)",
                }}
              >
                {menuItems.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`uppercase tracking-[1.8px] text-xs font-medium transition-colors hover:text-primary-500 ${
                        pathname === item.href
                          ? "text-primary-500"
                          : "text-black dark:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>

              <Link
                href="/#waitlist"
                className="btn-press inline-block rounded-[60px] bg-primary-500 p-[7px] md:p-[10px] uppercase text-xs font-bold text-white tracking-[1px] md:tracking-[1.8px] hover:bg-lime hover:text-black"
              >
                <span className="ltr:ml-[15px] rtl:mr-[15px] ltr:md:ml-[20px] rtl:md:mr-[20px] flex items-center justify-center gap-[15px] md:gap-[20px]">
                  START FREE{" "}
                  <i className="ri-arrow-right-up-line w-[30px] md:w-[36px] h-[30px] md:h-[36px] rounded-full bg-white dark:bg-dark text-black dark:text-white flex items-center justify-center text-md"></i>
                </span>
              </Link>
            </div>

            {/* For Responsive */}
            <div
              className={`bg-white dark:bg-navy-900 rounded-[15px] border border-gray-200 dark:border-[#202c4b] mt-[20px] p-[20px] md:p-[30px] w-full hidden lg:!hidden ${
                isActiveMobileMenu ? "" : "active"
              }`}
              id="navbar-collapse"
            >
              <ul>
                {menuItems.map((item) => (
                  <li
                    key={item.href}
                    className="my-[14px] md:my-[16px] first:mt-0 last:mb-0"
                  >
                    <Link
                      href={item.href}
                      className={`uppercase tracking-[1.8px] text-xs font-medium transition-colors hover:text-primary-500 ${
                        pathname === item.href
                          ? "text-primary-500"
                          : "text-black dark:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>

              <Link
                href="/#waitlist"
                className="btn-press inline-block rounded-[60px] bg-primary-500 p-[7px] md:p-[10px] uppercase text-xs font-bold text-white tracking-[1px] md:tracking-[1.8px] hover:bg-lime hover:text-black mt-[15px]"
              >
                <span className="ltr:ml-[15px] rtl:mr-[15px] ltr:md:ml-[20px] rtl:md:mr-[20px] flex items-center justify-center gap-[15px] md:gap-[20px]">
                  START FREE{" "}
                  <i className="ri-arrow-right-up-line w-[30px] md:w-[36px] h-[30px] md:h-[36px] rounded-full bg-white dark:bg-dark text-black dark:text-white flex items-center justify-center text-md"></i>
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Navbar;
