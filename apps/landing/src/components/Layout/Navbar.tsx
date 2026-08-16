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

  // Sticky navbar. Glass command-bar once you scroll.
  // The transparent bar sits over the navy hero on the homepage (white
  // wordmark) and over light banners on subpages (dark wordmark); once
  // sticky it gets its own background, so the wordmark follows that.
  const [isSticky, setIsSticky] = useState<boolean>(false);
  const isHome = pathname === "/";
  const brandColor = isSticky
    ? "text-black dark:text-white"
    : isHome
      ? "text-white"
      : "text-black dark:text-white";
  const burgerBar = isSticky
    ? "bg-dark dark:bg-white"
    : isHome
      ? "bg-white"
      : "bg-dark dark:bg-white";

  useEffect(() => {
    const elementId = document.getElementById("navbar");
    const handleScroll = () => {
      const sticky = window.scrollY > 80;
      setIsSticky(sticky);
      if (sticky) {
        elementId?.classList.add("is-sticky");
      } else {
        elementId?.classList.remove("is-sticky");
      }
    };

    document.addEventListener("scroll", handleScroll, { passive: true });
    return () => document.removeEventListener("scroll", handleScroll);
  }, []);

  // Add active class to mobile menu
  const [isActiveMobileMenu, setActiveMobileMenu] = useState<boolean>(true);

  const handleToggleMobileMenu = (): void => {
    setActiveMobileMenu(!isActiveMobileMenu);
  };

  const Wordmark = ({ className = "" }: { className?: string }) => (
    <span
      className={`inline-flex items-center gap-[7px] text-[24px] font-bold tracking-[-1.2px] leading-none ${brandColor} transition-colors duration-300 ${className}`}
    >
      ORQ8
      <span className="w-[8px] h-[8px] rounded-full bg-lime inline-block"></span>
    </span>
  );

  return (
    <>
      <div
        className="finance-navbar fixed top-0 right-0 left-0 transition-[background-color,box-shadow,padding] duration-300 h-auto z-[5] py-[20px] md:py-[25px]"
        id="navbar"
      >
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] 2xl:max-w-[1744px] mx-auto px-[12px]">
          <div className="flex items-center relative flex-wrap lg:flex-nowrap justify-between lg:justify-start">
            <Link href="/" className="inline-block" aria-label="ORQ8 home">
              <Wordmark />
            </Link>

            <button
              type="button"
              aria-label="Toggle menu"
              aria-expanded={!isActiveMobileMenu}
              className="inline-block relative leading-none lg:hidden"
              onClick={handleToggleMobileMenu}
            >
              <span className={`h-[3px] w-[30px] my-[5px] block ${burgerBar} transition-transform duration-300`}></span>
              <span className={`h-[3px] w-[30px] my-[5px] block ${burgerBar} transition-opacity duration-300`}></span>
              <span className={`h-[3px] w-[30px] my-[5px] block ${burgerBar} transition-transform duration-300`}></span>
            </button>

            {/* For Big Devices */}
            <div className="hidden lg:flex items-center grow basis-full">
              <ul
                className="navbar-nav flex mx-auto flex-row gap-[25px] xl:gap-[50px] bg-white dark:bg-navy-900 rounded-[60px] lg:py-[20px] lg:px-[30px] xl:py-[30px] xl:px-[50px] 2xl:px-[100px]"
                style={{
                  boxShadow: "0px 4px 30px 0px rgba(146, 139, 221, 0.10)",
                }}
              >
                {menuItems.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`uppercase tracking-[1.8px] text-xs font-medium transition-colors hover:text-emerald ${
                        pathname === item.href
                          ? "text-emerald"
                          : "text-black dark:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>

              <Link
                href="/#waitlist"                className="btn-press group inline-block rounded-[60px] bg-emerald p-[7px] md:p-[10px] uppercase text-xs font-bold text-navy-950 tracking-[1px] md:tracking-[1.8px] hover:bg-lime"
                >
                <span className="ltr:ml-[15px] rtl:mr-[15px] ltr:md:ml-[20px] rtl:md:mr-[20px] flex items-center justify-center gap-[15px] md:gap-[20px]">
                  JOIN THE WAITLIST{" "}
                  <i className="ri-arrow-right-up-line w-[30px] md:w-[36px] h-[30px] md:h-[36px] rounded-full bg-navy-950/15 text-navy-950 flex items-center justify-center text-md transition-transform duration-300 group-hover:translate-x-[2px] group-hover:-translate-y-[1px]"></i>
                </span>
              </Link>
            </div>

            {/* For Responsive */}
            <div
              className={`bg-white dark:bg-navy-900 rounded-[15px] border border-gray-200 dark:border-white/10 mt-[20px] p-[20px] md:p-[30px] w-full hidden lg:!hidden ${
                isActiveMobileMenu ? "" : "active"
              }`}
              id="navbar-collapse"
            >
              <ul>
                {menuItems.map((item, i) => (
                  <li
                    key={item.href}
                    className={`my-[14px] md:my-[16px] first:mt-0 last:mb-0 transition-all duration-300 ${
                      isActiveMobileMenu ? "opacity-0 translate-y-3" : "opacity-100 translate-y-0"
                    }`}
                    style={{ transitionDelay: isActiveMobileMenu ? "0ms" : `${60 + i * 45}ms` }}
                  >
                    <Link
                      href={item.href}
                      onClick={() => setActiveMobileMenu(true)}
                      className={`uppercase tracking-[1.8px] text-xs font-medium transition-colors hover:text-emerald ${
                        pathname === item.href
                          ? "text-emerald"
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
                onClick={() => setActiveMobileMenu(true)}
                className="btn-press inline-block rounded-[60px] bg-emerald p-[7px] md:p-[10px] uppercase text-xs font-bold text-navy-950 tracking-[1px] md:tracking-[1.8px] hover:bg-lime mt-[15px]"
              >
                <span className="ltr:ml-[15px] rtl:mr-[15px] ltr:md:ml-[20px] rtl:md:mr-[20px] flex items-center justify-center gap-[15px] md:gap-[20px]">
                  JOIN THE WAITLIST{" "}
                  <i className="ri-arrow-right-up-line w-[30px] md:w-[36px] h-[30px] md:h-[36px] rounded-full bg-navy-950/15 text-navy-950 flex items-center justify-center text-md"></i>
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
