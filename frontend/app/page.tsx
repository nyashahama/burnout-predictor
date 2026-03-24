"use client";

import { useEffect } from "react";
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export default function Home() {
  useScrollAppear();

  // Wake up the Render backend on landing so users don't hit a cold start
  // when they reach the login/register flow.
  useEffect(() => {
    fetch(`${API_BASE}/health`).catch(() => {});
  }, []);
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
