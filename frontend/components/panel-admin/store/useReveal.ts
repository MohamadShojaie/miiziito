"use client";

import { useEffect } from "react";

const REVEAL_SELECTOR = ".mzt-reveal";

function observeRevealElements() {
  const els = document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR);
  if (!els.length) return () => {};

  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          obs.unobserve(e.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px 0px 0px" },
  );

  els.forEach((el) => {
    if (!el.classList.contains("is-visible")) obs.observe(el);
  });

  return () => obs.disconnect();
}

/** Adds `.is-visible` to `.mzt-reveal` elements when they enter the viewport. */
export function useReveal(deps: unknown[] = []) {
  useEffect(() => {
    const disconnect = observeRevealElements();
    return disconnect;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
