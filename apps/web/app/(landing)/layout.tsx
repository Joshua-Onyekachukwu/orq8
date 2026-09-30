import "remixicon/fonts/remixicon.css";
import "swiper/css";
import "swiper/css/bundle";

import Navbar from "@/components/landing/Layout/Navbar";
import Footer from "@/components/landing/Layout/Footer";
import GoTop from "@/components/landing/Layout/GoTop";
import CookieConsent from "@/components/landing/Legal/CookieConsent";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* The marketing site uses the same tokens as the product (docs/65_COLOR_SYSTEM.md).
        * The page is the pale mint environment, cards are white against it, and the
        * hero, the platform section, the pricing band and the footer are deliberate
        * black moments in a light system. */}
      <div className="bg-surface-marketing">
        <Navbar />
        <main id="main" className="overflow-x-hidden">
          {children}
        </main>
        <Footer />
        <GoTop />
        <CookieConsent />
      </div>
    </>
  );
}
