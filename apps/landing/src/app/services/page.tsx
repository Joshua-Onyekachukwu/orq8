 
import FunFacts from "@/components/Common/FunFacts";
import PageBanner from "@/components/Common/PageBanner";
import Partners from "@/components/Common/Partners";
import Testimonials from "@/components/Common/Testimonials";
import ServicesLists from "@/components/Services/ServicesLists";

export default function Page() {
  return (
    <>
      <PageBanner pageTitle="Services" />

      <ServicesLists />

      <Partners />

      <Testimonials />

      <FunFacts />
    </>
  );
}
