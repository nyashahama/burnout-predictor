"use client";

import { useEffect } from "react";

/**
 * Wires up the .appear → .in scroll animation.
 * Call this once in a top-level client component (e.g. page.tsx or a
 * layout wrapper). The observer watches every .appear element and adds
 * the .in class when it enters the viewport.
 */
export function useScrollAppear() {
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
}
