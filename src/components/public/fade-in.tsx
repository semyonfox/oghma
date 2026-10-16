"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

type FadeInProps = { children: ReactNode; delay?: number; className?: string };

// server markup is always visible so crawlers, no-JS visitors and the LCP
// paint never wait on hydration. only content still below the fold when the
// page hydrates is hidden and revealed on scroll
export default function FadeIn({ children, delay = 0, className }: FadeInProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;

    setHidden(true);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setHidden(false);
          observer.disconnect();
        }
      },
      { rootMargin: "-50px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: hidden ? 0 : 1,
        transform: hidden ? "translateY(20px)" : "translateY(0)",
        transition: `opacity 0.5s ease-out ${delay}s, transform 0.5s ease-out ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}
