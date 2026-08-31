import "remixicon/fonts/remixicon.css";
import "swiper/css";
import "swiper/css/bundle";

import Navbar from "@/components/landing/Layout/Navbar";
import Footer from "@/components/landing/Layout/Footer";
import GoTop from "@/components/landing/Layout/GoTop";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main id="main" className="overflow-x-hidden">
        {children}
      </main>
      <Footer />
      <GoTop />
    </>
  );
}
