import type { Metadata } from "next";
import ContactHero from "@/components/landing/Contact/ContactHero";
import ContactForm from "@/components/landing/Contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact — ORQ8",
  description:
    "Get in touch with ORQ8. Whether you have questions about the platform, need support, or want to discuss enterprise options.",
};

export default function ContactPage() {
  return (
    <>
      <ContactHero />
      <ContactForm />
    </>
  );
}
