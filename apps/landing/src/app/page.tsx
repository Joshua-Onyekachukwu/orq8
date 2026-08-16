import About from "@/components/Common/About";
import Faqs from "@/components/Common/Faqs";
import Features from "@/components/Common/Features";
import FunFacts from "@/components/Common/FunFacts";
import Integrations from "@/components/Common/Integrations";
import Partners from "@/components/Common/Partners";
import Pricing from "@/components/Common/Pricing";
import Testimonials from "@/components/Common/Testimonials";
import Cta from "@/components/Common/Cta";
import HeroBanner from "@/components/Home/HeroBanner";

export default function Home() {
  return (
    <>
      <HeroBanner />

      <Partners />

      <About />

      <Features />

      <Integrations />

      <Testimonials />

      <FunFacts />

      <Pricing />

      <Faqs />

      <Cta />
    </>
  );
}
