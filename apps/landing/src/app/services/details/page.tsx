 
import PageBanner from "@/components/Common/PageBanner";
import Partners from "@/components/Common/Partners"; 
import ServiceDetailsContent from "@/components/Services/ServiceDetailsContent";

export default function Page() {
  return (
    <>
      <PageBanner pageTitle="Service Details" />

      <ServiceDetailsContent />

      <Partners /> 
    </>
  );
}
