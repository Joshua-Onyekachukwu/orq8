import PageBanner from "@/components/Common/PageBanner";
import Partners from "@/components/Common/Partners";
import Pricing from "@/components/Common/Pricing";

export default function Page() {
  return (
    <>
      <PageBanner pageTitle="Pricing" />

      <Pricing />

      <div className="pt-[70px] md:pt-[90px] lg:pt-[110px] xl:pt-[130px] 2xl:pt-[150px]">
        <Partners />
      </div>
    </>
  );
}
