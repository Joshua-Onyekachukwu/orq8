"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const menuItems = [
  { label: "Home", href: "/", section: null as string | null },
  { label: "Platform", href: "/#features", section: "features" },
  { label: "How it works", href: "/#how-it-works", section: "how-it-works" },
  { label: "About", href: "/about", section: null },
  { label: "Pricing", href: "/pricing", section: null },
  { label: "Contact", href: "/contact", section: null },
];

function normalized(path: string): string {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return clean === "" ? "/" : clean;
}

const Navbar: React.FC = () => {
  const pathname = usePathname();
  const [isSticky, setIsSticky] = useState<boolean>(false);
  const isHome = pathname === "/";

  const [activeSection, setActiveSection] = useState<string | null>(null);
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

  const [isActiveMobileMenu, setActiveMobileMenu] = useState<boolean>(true);
  const handleToggleMobileMenu = (): void => {
    setActiveMobileMenu(!isActiveMobileMenu);
  };

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
      setPendingScroll(section);
    }
  };

  const isItemActive = (item: (typeof menuItems)[number]): boolean => {
    if (item.section) {
      return isHome && activeSection === item.section;
    }
    if (item.href === "/") {
      return isHome && !activeSection;
    }
    return normalized(pathname) === normalized(item.href);
  };

  return (
    <>
      <div
        className={`finance-navbar fixed top-0 right-0 left-0 transition-[background-color,box-shadow,padding] duration-300 h-auto z-[50] py-[20px] md:py-[24px] ${
          isSticky
            ? "bg-white/95 dark:bg-[#0a0e19]/95 backdrop-blur-md border-b border-hairline dark:border-white/[0.06] shadow-sm"
            : ""
        }`}
        id="navbar"
      >
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1200px] mx-auto px-[20px] md:px-[24px]">
          <div className="flex items-center relative flex-wrap lg:flex-nowrap justify-between">
            {/* Logo */}
            <Link href="/" className="inline-block flex-none" aria-label="ORQ8 home">
              <span className="inline-flex items-center gap-[7px] text-[24px] font-bold tracking-[-1.2px] leading-none text-ink dark:text-white transition-colors duration-300">
                ORQ8
                <span className="w-[8px] h-[8px] rounded-full bg-emerald inline-block"></span>
              </span>
            </Link>

            {/* Mobile hamburger + theme toggle */}
            <div className="flex items-center gap-[10px] ml-auto lg:hidden">
              <ThemeToggle />
              <button
                type="button"
                aria-label="Toggle menu"
                aria-expanded={!isActiveMobileMenu}
                className="inline-block relative leading-none"
                onClick={handleToggleMobileMenu}
              >
                <span className="h-[2px] w-[24px] my-[5px] block bg-ink dark:bg-white transition-transform duration-300"></span>
                <span className="h-[2px] w-[24px] my-[5px] block bg-ink dark:bg-white transition-opacity duration-300"></span>
                <span className="h-[2px] w-[24px] my-[5px] block bg-ink dark:bg-white transition-transform duration-300"></span>
              </button>
            </div>

            {/* Desktop: centered menu, theme toggle + CTA */}
            <div className="hidden lg:flex items-center grow basis-full">
              {/* Centered nav — Trezo Finance pill style */}
              <div className="flex-1 flex justify-center">
                <ul
                  className="navbar-nav flex flex-row items-center gap-[24px] xl:gap-[32px] bg-white dark:bg-dark rounded-[60px] lg:py-[18px] lg:px-[30px] xl:py-[22px] xl:px-[40px]"
                  style={{
                    boxShadow: "0px 4px 30px 0px rgba(146, 139, 221, 0.08)",
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
                        aria-current={isItemActive(item) ? "true" : undefined}
                        className={`uppercase tracking-[0.12em] text-[11px] font-medium transition-colors hover:text-emerald ${
                          isItemActive(item)
                            ? "text-emerald"
                            : "text-ink dark:text-white/70"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Theme toggle + CTA */}
              <div className="flex items-center gap-[12px] ml-[20px]">
                <ThemeToggle />
                <Link
                  href="/#waitlist"
                  onClick={(e) => handleSectionClick(e, "waitlist")}
                  className="btn-press group inline-block flex-none rounded-full bg-emerald px-[20px] py-[10px] uppercase text-[11px] font-bold text-navy-950 tracking-[0.12em] hover:bg-emerald-dark transition-colors"
                >
                  <span className="flex items-center justify-center gap-[10px]">
                    JOIN THE WAITLIST{" "}
                    <i className="ri-arrow-right-up-line w-[24px] h-[24px] rounded-full bg-navy-950/10 text-navy-950 flex items-center justify-center text-[12px] transition-transform duration-300 group-hover:translate-x-[2px] group-hover:-translate-y-[1px]"></i>
                  </span>
                </Link>
              </div>
            </div>

            {/* Mobile menu */}
            <div
              className={`bg-white dark:bg-[#0a0e19] border border-hairline dark:border-white/[0.06] rounded-[12px] mt-[20px] p-[24px] w-full lg:!hidden transition-all duration-300 ${
                isActiveMobileMenu ? "hidden" : "block"
              }`}
              id="navbar-collapse"
            >
              <ul>
                {menuItems.map((item, i) => (
                  <li
                    key={item.href}
                    className={`my-[16px] first:mt-0 last:mb-0 transition-all duration-300 ${
                      isActiveMobileMenu ? "opacity-0 translate-y-3" : "opacity-100 translate-y-0"
                    }`}
                    style={{ transitionDelay: isActiveMobileMenu ? "0ms" : `${60 + i * 45}ms` }}
                  >
                    <Link
                      href={item.href}
                      onClick={(e) => {
                        if (item.section) {
                          handleSectionClick(e, item.section);
                        }
                        setActiveMobileMenu(true);
                      }}
                      aria-current={isItemActive(item) ? "true" : undefined}
                      className={`uppercase tracking-[0.12em] text-[11px] font-medium transition-colors hover:text-emerald ${
                        isItemActive(item)
                          ? "text-emerald"
                          : "text-ink dark:text-white/70"
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
                className="btn-press inline-block rounded-full bg-emerald px-[20px] py-[10px] uppercase text-[11px] font-bold text-navy-950 tracking-[0.12em] hover:bg-emerald-dark mt-[16px]"
              >
                <span className="flex items-center justify-center gap-[10px]">
                  JOIN THE WAITLIST{" "}
                  <i className="ri-arrow-right-up-line w-[24px] h-[24px] rounded-full bg-navy-950/10 text-navy-950 flex items-center justify-center text-[12px]"></i>
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
