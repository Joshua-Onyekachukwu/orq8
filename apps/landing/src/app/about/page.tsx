import AboutContent from "@/components/About/AboutContent";
import OurJourney from "@/components/About/OurJourney";
import FunFacts from "@/components/Common/FunFacts";
import PageBanner from "@/components/Common/PageBanner";
import Partners from "@/components/Common/Partners";
import Testimonials from "@/components/Common/Testimonials";

export default function Page() {
  return (
    <>
      <PageBanner pageTitle="About Us" />

      <AboutContent />

      <OurJourney />

      <Partners />

      <Testimonials />

      <FunFacts />
    </>
  );
}
