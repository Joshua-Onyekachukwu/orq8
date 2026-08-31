import type { Metadata } from "next";
import AboutContent from "@/components/landing/About/AboutContent";
import OurJourney from "@/components/landing/About/OurJourney";

export const metadata: Metadata = {
  title: "About",
  description:
    "ORQ8 is the operating system for a company of one. You set the direction. It hires the team, does the work, and reports back.",
};

export default function AboutPage() {
  return (
    <>
      <AboutContent />
      <OurJourney />
    </>
  );
}
