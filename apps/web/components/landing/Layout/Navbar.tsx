"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const menuItems = [
  { label: "Home", href: "/", section: null as string | null },
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
    const el = document.getElementById("navbar");
    const h = () => { const s = window.scrollY > 80; setIsSticky(s); if (s) el?.classList.add("is-sticky"); else el?.classList.remove("is-sticky"); };
    document.addEventListener("scroll", h, { passive: true });
    return () => document.removeEventListener("scroll", h);
  }, []);

  useEffect(() => {
    if (!isHome) { setActiveSection(null); return; }
    const ids = menuItems.map(i => i.section).filter((s): s is string => Boolean(s));
    const u = () => { const b = window.innerHeight * 0.35; let c: string | null = null, ct = -Infinity; for (const id of ids) { const el = document.getElementById(id); if (!el) continue; const t = el.getBoundingClientRect().top; if (t <= b && t > ct) { ct = t; c = id; } } setActiveSection(c); };
    u(); document.addEventListener("scroll", u, { passive: true }); window.addEventListener("resize", u);
    return () => { document.removeEventListener("scroll", u); window.removeEventListener("resize", u); };
  }, [isHome]);

  useEffect(() => {
    if (!pendingScroll || !isHome) return;
    const t = setTimeout(() => { document.getElementById(pendingScroll)?.scrollIntoView({ behavior: "smooth", block: "start" }); setPendingScroll(null); }, 120);
    return () => clearTimeout(t);
  }, [pendingScroll, isHome]);

  const [mob, setMob] = useState(true);
  const hsc = (e: React.MouseEvent<HTMLAnchorElement>, s: string) => { if (isHome) { e.preventDefault(); document.getElementById(s)?.scrollIntoView({ behavior: "smooth", block: "start" }); } else { setPendingScroll(s); } };
  const isa = (i: typeof menuItems[number]) => { if (i.section) return isHome && activeSection === i.section; if (i.href === "/") return isHome && !activeSection; return normalized(pathname) === normalized(i.href); };
  const wLogo = !isSticky && isHome;

  return (<>
    <div className={`finance-navbar fixed top-0 right-0 left-0 transition-[background-color,box-shadow,padding] duration-300 h-auto z-[50] py-[20px] md:py-[24px] ${isSticky ? "bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm" : "bg-transparent"}`} id="navbar">
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
        <div className="flex items-center relative flex-wrap lg:flex-nowrap justify-between">
          <Link href="/" className="inline-block flex-none" aria-label="ORQ8 home">
            {wLogo ? <Image src="/images/logo-white.png" alt="ORQ8" width={100} height={26} className="h-[26px] w-auto" /> : <Image src="/images/logo-dark.png" alt="ORQ8" width={100} height={26} className="h-[26px] w-auto" />}
          </Link>
          <button type="button" className="inline-block relative leading-none lg:hidden" onClick={() => setMob(!mob)}>
            <span className={`h-[3px] w-[30px] my-[5px] block ${wLogo ? "bg-white" : "bg-black"}`}></span>
            <span className={`h-[3px] w-[30px] my-[5px] block ${wLogo ? "bg-white" : "bg-black"}`}></span>
            <span className={`h-[3px] w-[30px] my-[5px] block ${wLogo ? "bg-white" : "bg-black"}`}></span>
          </button>
          <div className="hidden lg:flex items-center grow basis-full">
            <ul className="navbar-nav flex mx-auto flex-row gap-[25px] xl:gap-[50px] bg-white rounded-[60px] lg:py-[20px] lg:px-[30px] xl:py-[30px] xl:px-[50px] 2xl:px-[100px]" style={{boxShadow:"0px 4px 30px 0px rgba(146,139,221,0.10)"}}>
              {menuItems.map(i=>(<li key={i.href}><Link href={i.href} onClick={i.section?(e)=>hsc(e,i.section!):undefined} className={`uppercase tracking-[1.8px] text-xs font-medium transition-all hover:text-[#1a5c2e] relative ${isa(i)?"text-[#1a5c2e]":"text-black"}`}>{i.label}{isa(i)&&<span className="absolute -bottom-[6px] left-0 right-0 h-[2px] bg-[#1a5c2e] rounded-full"></span>}</Link></li>))}
            </ul>
            <Link href="/register" className="inline-block rounded-[60px] bg-[#E86A33] px-[24px] py-[12px] uppercase text-[11px] font-bold text-white tracking-[1.8px] transition-all hover:bg-[#d45e2a]"><span className="flex items-center justify-center gap-[12px]">Get Started <i className="ri-arrow-right-up-line w-[24px] h-[24px] rounded-full bg-white/15 text-white flex items-center justify-center text-[13px]"></i></span></Link>
          </div>
          <div className={`bg-white rounded-[15px] border border-gray-200 mt-[20px] p-[20px] md:p-[30px] w-full hidden lg:!hidden ${mob?"":"active"}`} id="navbar-collapse">
            <ul>{menuItems.map(i=>(<li key={i.href} className="my-[14px] md:my-[16px] first:mt-0 last:mb-0"><Link href={i.href} onClick={(e)=>{if(i.section)hsc(e,i.section);setMob(true);}} className={`uppercase tracking-[1.8px] text-xs font-medium transition-all hover:text-[#1a5c2e] ${isa(i)?"text-[#1a5c2e]":"text-black"}`}>{i.label}</Link></li>))}</ul>
            <Link href="/register" onClick={()=>setMob(true)} className="inline-block rounded-[60px] bg-[#E86A33] px-[24px] py-[12px] uppercase text-[11px] font-bold text-white tracking-[1.8px] transition-all hover:bg-[#d45e2a] mt-[15px]"><span className="flex items-center justify-center gap-[12px]">Get Started <i className="ri-arrow-right-up-line w-[24px] h-[24px] rounded-full bg-white/15 text-white flex items-center justify-center text-[13px]"></i></span></Link>
          </div>
        </div>
      </div>
    </div>
  </>);
};
export default Navbar;