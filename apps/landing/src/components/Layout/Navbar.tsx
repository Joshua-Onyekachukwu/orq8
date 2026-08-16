"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Menu items. `href` points at a section (`/#id`) when the content lives on the
// landing page, or at a dedicated route when it has its own page. The nav is
// section-aware: section links scroll in place on the homepage and navigate +
// scroll from any subpage; page links get a proper active state.
const menuItems = [
  { label: "Home", href: "/", section: null as string | null },
  { label: "Platform", href: "/#features", section: "features" },
  { label: "How it works", href: "/#how-it-works", section: "how-it-works" },
  { label: "About", href: "/about", section: null },
  { label: "Pricing", href: "/pricing", section: null },
  { label: "Contact", href: "/contact", section: null },
];

/** Normalize trailing slashes so "/pricing" matches pathname "/pricing". */
function normalized(path: string): string {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return clean === "" ? "/" : clean;
}

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

  // Scroll-spy: on the homepage, highlight the section currently in view.
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Section anchor coming from a subpage: navigate home, then scroll after the
  // page mounts (Next.js does not auto-scroll hashes on client-side nav).
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);

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

  // Scroll-spy on the homepage: the section whose top band is nearest the
  // viewport's 35% line is "active". Position-based (getBoundingClientRect)
  // so it works everywhere, including reduced-motion and embedded webviews.
  useEffect(() => {
    if (!isHome) {
      setActiveSection(null);
      return;
    }
    const ids = menuItems
      .map((item) => item.section)
      .filter((s): s is string => Boolean(s));
    const update = () => {
      const band = window.innerHeight * 0.35;
      // The active section is the one LOWEST on the page whose top has
      // crossed the band line (null while the hero is in view). Using the
      // greatest crossing top, not array order, since menu order and page
      // order differ.
      let current: string | null = null;
      let currentTop = -Infinity;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= band && top > currentTop) {
          currentTop = top;
          current = id;
        }
      }
      setActiveSection(current);
    };
    update();
    document.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [isHome]);

  // After navigating to the homepage with a section hash, scroll to it.
  useEffect(() => {
    if (!pendingScroll || !isHome) return;
    const timer = setTimeout(() => {
      document
        .getElementById(pendingScroll)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingScroll(null);
    }, 120);
    return () => clearTimeout(timer);
  }, [pendingScroll, isHome]);

  // Add active class to mobile menu
  const [isActiveMobileMenu, setActiveMobileMenu] = useState<boolean>(true);

  const handleToggleMobileMenu = (): void => {
    setActiveMobileMenu(!isActiveMobileMenu);
  };

  /** Section link: scroll in place on the homepage, navigate + scroll elsewhere. */
  const handleSectionClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    section: string,
  ) => {
    if (isHome) {
      e.preventDefault();
      document
        .getElementById(section)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      // Let the Link navigate to "/#section"; the effect above does the scroll.
      setPendingScroll(section);
    }
  };

  const isItemActive = (item: (typeof menuItems)[number]): boolean => {
    if (item.section) {
      return isHome && activeSection === item.section;
    }
    if (item.href === "/") {
      // Home is active only at the top of the homepage, not while a section
      // is in view (the section item takes over).
      return isHome && !activeSection;
    }
    return normalized(pathname) === normalized(item.href);
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
                className="navbar-nav flex mx-auto flex-row gap-[18px] xl:gap-[30px] 2xl:gap-[46px] bg-white dark:bg-navy-900 rounded-[60px] lg:py-[20px] lg:px-[24px] xl:py-[30px] xl:px-[40px] 2xl:px-[80px]"
                style={{
                  boxShadow: "0px 4px 30px 0px rgba(146, 139, 221, 0.10)",
                }}
              >
                {menuItems.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={
                        item.section
                          ? (e) => handleSectionClick(e, item.section!)
                          : undefined
                      }
                      aria-current={
                        isItemActive(item) ? "true" : undefined
                      }
                      className={`uppercase tracking-[1.8px] text-xs font-medium transition-colors hover:text-emerald ${
                        isItemActive(item)
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
                onClick={(e) => handleSectionClick(e, "waitlist")}
                className="btn-press group inline-block rounded-[60px] bg-emerald p-[7px] md:p-[10px] uppercase text-xs font-bold text-navy-950 tracking-[1px] md:tracking-[1.8px] hover:bg-lime"
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
                      onClick={(e) => {
                        if (item.section) {
                          // Same treatment as the desktop nav: smooth-scroll in
                          // place on the homepage, navigate + scroll elsewhere.
                          handleSectionClick(e, item.section);
                        }
                        setActiveMobileMenu(true);
                      }}
                      aria-current={isItemActive(item) ? "true" : undefined}
                      className={`uppercase tracking-[1.8px] text-xs font-medium transition-colors hover:text-emerald ${
                        isItemActive(item)
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
                onClick={(e) => {
                  handleSectionClick(e, "waitlist");
                  setActiveMobileMenu(true);
                }}
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
