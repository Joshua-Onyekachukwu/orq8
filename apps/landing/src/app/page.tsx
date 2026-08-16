import About from "@/components/Common/About";
import Faqs from "@/components/Common/Faqs";
import Features from "@/components/Common/Features";
import FunFacts from "@/components/Common/FunFacts";
import Integrations from "@/components/Common/Integrations";
import Partners from "@/components/Common/Partners";
import Pricing from "@/components/Common/Pricing";
import { Reveal } from "@/components/Common/Reveal";
import Testimonials from "@/components/Common/Testimonials";
import Cta from "@/components/Common/Cta";
import HeroBanner from "@/components/Home/HeroBanner";

export default function Home() {
  return (
    <>
      <HeroBanner />

      <Reveal>
        <Partners />
      </Reveal>

      <Reveal>
        <About />
      </Reveal>

      <Reveal>
        <Features />
      </Reveal>

      <Reveal>
        <Integrations />
      </Reveal>

      <Reveal>
        <Testimonials />
      </Reveal>

      <Reveal>
        <FunFacts />
      </Reveal>

      <Reveal>
        <Pricing />
      </Reveal>

      <Reveal>
        <Faqs />
      </Reveal>

      <Reveal>
        <Cta />
      </Reveal>
    </>
  );
}
