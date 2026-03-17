"use client";

import { useScrollAppear } from "@/components/useScrollAppear";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Recognition from "@/components/Recognition";
import Benefits from "@/components/Benefits";
import CrashTimeline from "@/components/CrashTimeline";
import HowItWorks from "@/components/HowItWorks";
import Score from "@/components/Score";
import Demo from "@/components/Demo";
import Testimonials from "@/components/Testimonials";
import Pricing from "@/components/Pricing";
import FinalCta from "@/components/FinalCta";
import Footer from "@/components/Footer";

export default function Home() {
  useScrollAppear();
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Recognition />
        <Benefits />
        <CrashTimeline />
        <HowItWorks />
        <Score />
        <Demo />
        <Testimonials />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
