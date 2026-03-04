import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Recognition from "@/components/Recognition";
import Benefits from "@/components/Benefits";
import CrashTimeline from "@/components/CrashTimeline";
import HowItWorks from "@/components/HowItWorks";
import Score from "@/components/Score";
import Testimonials from "@/components/Testimonials";
import Pricing from "@/components/Pricing";
import FinalCta from "@/components/FinalCta";
import Footer from "@/components/Footer";
import ScrollAnimation from "@/components/ScrollAnimation";

export default function Home() {
  return (
    <>
      <Nav />
      <Hero />
      <Recognition />
      <Benefits />
      <CrashTimeline />
      <HowItWorks />
      <Score />
      <Testimonials />
      <Pricing />
      <FinalCta />
      <Footer />
      <ScrollAnimation />
    </>
  );
}
