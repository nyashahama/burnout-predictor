"use client";

import { useEffect } from "react";

export default function ScrollAnimation() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("in");
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -32px 0px" },
    );

    document.querySelectorAll(".appear").forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return null;
}
