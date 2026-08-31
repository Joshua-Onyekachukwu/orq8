import type { Metadata } from "next";
import AboutHero from "@/components/landing/About/AboutHero";
import AboutContent from "@/components/landing/About/AboutContent";
import OurJourney from "@/components/landing/About/OurJourney";

export const metadata: Metadata = {
  title: "About — ORQ8",
  description:
    "ORQ8 is the operating system for a company of one. You set the direction. It hires the team, does the work, and reports back.",
};

export default function AboutPage() {
  return (
    <>
      <AboutHero />
      <AboutContent />
      <OurJourney />
    </>
  );
}
