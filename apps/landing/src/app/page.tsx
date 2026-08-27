import About from "@/components/Common/About";
import Faqs from "@/components/Common/Faqs";
import FeaturesOrbital from "@/components/Common/Features";
import HowItWorks from "@/components/Common/HowItWorks";
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
        <HowItWorks />
      </Reveal>

      <Reveal>
        <About />
      </Reveal>

      <Reveal>
        <FeaturesOrbital />
      </Reveal>

      <Reveal>
        <Integrations />
      </Reveal>

      <Reveal>
        <Testimonials />
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
