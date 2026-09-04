import type { Metadata } from "next";
import About from "@/components/landing/Common/About";
import Faqs from "@/components/landing/Common/Faqs";
import FeaturesOrbital from "@/components/landing/Common/Features";
import HowItWorks from "@/components/landing/Common/HowItWorks";
import Pricing from "@/components/landing/Common/Pricing";
import Testimonials from "@/components/landing/Common/Testimonials";
import { Reveal } from "@/components/landing/Common/Reveal";
import Cta from "@/components/landing/Common/Cta";
import HeroBanner from "@/components/landing/Home/HeroBanner";

export const metadata: Metadata = {
  title: "ORQ8: Run your company with AI employees",
  description:
    "You set the direction. ORQ8 hires the team, does the work, and reports back under your approvals and your budget.",
};

export default function Home() {
  return (
    <>
      <HeroBanner />

      <Reveal>
        <About />
      </Reveal>

      <Reveal>
        <HowItWorks />
      </Reveal>

      <Reveal>
        <FeaturesOrbital />
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
