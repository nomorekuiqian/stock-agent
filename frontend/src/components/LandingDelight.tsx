"use client";

import { useEffect } from "react";

type Cleanup = () => void;

export default function LandingDelight() {
  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (reduceMotion) return;

    let disposed = false;
    let cleanup: Cleanup | undefined;

    async function setup() {
      const { gsap } = await import("gsap");
      if (disposed) return;

      const sections = Array.from(
        document.querySelectorAll<HTMLElement>("[data-delight-section]")
      );
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>("[data-delight-card]")
      );
      const actions = Array.from(
        document.querySelectorAll<HTMLElement>("[data-delight-action]")
      );
      const animated = new WeakSet<Element>();

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting || animated.has(entry.target)) continue;

            animated.add(entry.target);
            const target = entry.target as HTMLElement;
            const children = target.querySelectorAll<HTMLElement>(
              "[data-delight-card], [data-delight-action]"
            );

            gsap.fromTo(
              target,
              { autoAlpha: 0, y: 18 },
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.55,
                ease: "power3.out",
                clearProps: "opacity,visibility,transform",
              }
            );

            if (children.length > 0) {
              gsap.fromTo(
                children,
                { autoAlpha: 0, y: 10 },
                {
                  autoAlpha: 1,
                  y: 0,
                  duration: 0.42,
                  ease: "power3.out",
                  stagger: 0.035,
                  delay: 0.08,
                  clearProps: "opacity,visibility,transform",
                }
              );
            }

            observer.unobserve(target);
          }
        },
        { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
      );

      sections.forEach((section) => observer.observe(section));

      const listenerCleanups: Cleanup[] = [];
      const finePointer = window.matchMedia("(pointer: fine)").matches;

      if (finePointer) {
        for (const element of [...cards, ...actions]) {
          const handleEnter = () => {
            gsap.to(element, {
              y: -3,
              duration: 0.22,
              ease: "power2.out",
              overwrite: "auto",
            });
          };
          const handleLeave = () => {
            gsap.to(element, {
              y: 0,
              duration: 0.28,
              ease: "power2.out",
              overwrite: "auto",
            });
          };

          element.addEventListener("mouseenter", handleEnter);
          element.addEventListener("mouseleave", handleLeave);
          listenerCleanups.push(() => {
            element.removeEventListener("mouseenter", handleEnter);
            element.removeEventListener("mouseleave", handleLeave);
          });
        }
      }

      cleanup = () => {
        observer.disconnect();
        listenerCleanups.forEach((dispose) => dispose());
        gsap.killTweensOf([...sections, ...cards, ...actions]);
      };
    }

    void setup();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return null;
}
