 
import PageBanner from "@/components/Common/PageBanner";
import Partners from "@/components/Common/Partners"; 
import ContactForm from "@/components/Contact/ContactForm";

export default function Page() {
  return (
    <>
      <PageBanner pageTitle="Contact Us" />

      <ContactForm />
 
      <Partners /> 
    </>
  );
}
