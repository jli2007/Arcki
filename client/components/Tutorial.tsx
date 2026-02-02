"use client";

import { useState, useEffect, useRef } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Cross2Icon,
} from "@radix-ui/react-icons";
import Image from "next/image";

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  image: string;
  target?: string;
  position?: "top" | "bottom" | "left" | "right" | "center";
}

interface TutorialProps {
  onComplete: () => void;
  onSkip: () => void;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome",
    description: "Let's get you started with the essentials.",
    image: "/icons/welcome.png",
    position: "center",
  },
  {
    id: "toolbar-select",
    title: "Select",
    description: "Click any building to inspect its properties.",
    image: "/icons/select.png",
    target: '[data-tutorial="toolbar-select"]',
    position: "bottom",
  },
  {
    id: "toolbar-delete",
    title: "Delete",
    description: "Draw around buildings to remove them.",
    image: "/icons/delete.png",
    target: '[data-tutorial="toolbar-delete"]',
    position: "bottom",
  },
  {
    id: "toolbar-insert",
    title: "Insert",
    description: "Add models from the library or upload your own.",
    image: "/icons/insert.png",
    target: '[data-tutorial="toolbar-insert"]',
    position: "bottom",
  },
  {
    id: "toolbar-generate",
    title: "Generate",
    description: "Describe anything. AI builds it for you.",
    image: "/icons/generate.png",
    target: '[data-tutorial="toolbar-generate"]',
    position: "bottom",
  },
  {
    id: "search-bar",
    title: "Search",
    description: "Find places or use natural language commands.",
    image: "/icons/search.png",
    target: '[data-tutorial="search-bar"]',
    position: "top",
  },
  {
    id: "map-controls",
    title: "Controls",
    description: "Zoom, rotate, and toggle 2D/3D views.",
    image: "/icons/controls.png",
    target: '[data-tutorial="map-controls"]',
    position: "left",
  },
  {
    id: "weather-panel",
    title: "Environment",
    description: "Set the time of day and weather.",
    image: "/icons/environment.png",
    target: '[data-tutorial="weather-panel"]',
    position: "right",
  },
  {
    id: "complete",
    title: "Ready",
    description: "Go build something incredible.",
    image: "/icons/ready.png",
    position: "center",
  },
];

const STORAGE_KEY = "arcki_tutorial_completed";

export function Tutorial({ onComplete, onSkip }: TutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightElement, setHighlightElement] = useState<HTMLElement | null>(null);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const step = TUTORIAL_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === TUTORIAL_STEPS.length - 1;

  useEffect(() => {
    if (!step.target) {
      return;
    }

    const findElement = () => {
      const element = document.querySelector(step.target!) as HTMLElement;
      if (element) {
        setHighlightElement(element);
        const rect = element.getBoundingClientRect();
        setHighlightRect(rect);
      } else {
        setTimeout(findElement, 100);
      }
    };

    findElement();

    const updateRect = () => {
      if (highlightElement) {
        const rect = highlightElement.getBoundingClientRect();
        setHighlightRect(rect);
      }
    };

    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);

    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [step.target, currentStep, highlightElement]);

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    onComplete();
  };

  const handleSkip = () => {
    onSkip();
  };

  const activeRect = step.target ? highlightRect : null;

  const getTooltipPosition = () => {
    if (!activeRect || !step.position || step.position === "center") {
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
    }

    const padding = 24;
    const tooltipWidth = 360;
    const tooltipHeight = 280;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top: string | number = "50%";
    let left: string | number = "50%";
    let transform = "translate(-50%, -50%)";

    switch (step.position) {
      case "top":
        const spaceAbove = activeRect.top;
        if (spaceAbove < tooltipHeight + padding) {
          top = activeRect.bottom + padding;
          left = Math.max(
            padding,
            Math.min(
              activeRect.left + activeRect.width / 2,
              viewportWidth - tooltipWidth / 2 - padding,
            ),
          );
          transform = "translate(-50%, 0)";
        } else {
          top = activeRect.top - padding;
          left = Math.max(
            tooltipWidth / 2 + padding,
            Math.min(
              activeRect.left + activeRect.width / 2,
              viewportWidth - tooltipWidth / 2 - padding,
            ),
          );
          transform = "translate(-50%, -100%)";
        }
        break;
      case "bottom":
        const spaceBelow = viewportHeight - activeRect.bottom;
        if (spaceBelow < tooltipHeight + padding) {
          top = activeRect.top - padding;
          left = Math.max(
            padding,
            Math.min(
              activeRect.left + activeRect.width / 2,
              viewportWidth - tooltipWidth / 2 - padding,
            ),
          );
          transform = "translate(-50%, -100%)";
        } else {
          top = activeRect.bottom + padding;
          left = Math.max(
            tooltipWidth / 2 + padding,
            Math.min(
              activeRect.left + activeRect.width / 2,
              viewportWidth - tooltipWidth / 2 - padding,
            ),
          );
          transform = "translate(-50%, 0)";
        }
        break;
      case "left":
        top = Math.max(
          padding,
          Math.min(
            activeRect.top + activeRect.height / 2,
            viewportHeight - tooltipHeight / 2 - padding,
          ),
        );
        left = Math.max(padding, activeRect.left - padding);
        transform = "translate(-100%, -50%)";
        break;
      case "right":
        top = Math.max(
          padding,
          Math.min(
            activeRect.top + activeRect.height / 2,
            viewportHeight - tooltipHeight / 2 - padding,
          ),
        );
        left = Math.min(
          viewportWidth - tooltipWidth - padding,
          activeRect.right + padding,
        );
        transform = "translate(0, -50%)";
        break;
    }

    return { top: `${top}px`, left: `${left}px`, transform };
  };

  const tooltipStyle = getTooltipPosition();

  return (
    <>
      <div
        ref={overlayRef}
        className="fixed inset-0 z-9998 transition-all duration-500 pointer-events-none bg-black/60"
        style={
          activeRect
            ? {
                clipPath: `polygon(
            0% 0%,
            0% 100%,
            ${activeRect.left - 12}px 100%,
            ${activeRect.left - 12}px ${activeRect.top - 12}px,
            ${activeRect.right + 12}px ${activeRect.top - 12}px,
            ${activeRect.right + 12}px ${activeRect.bottom + 12}px,
            ${activeRect.left - 12}px ${activeRect.bottom + 12}px,
            ${activeRect.left - 12}px 100%,
            100% 100%,
            100% 0%
          )`,
              }
            : undefined
        }
      />

      {activeRect && (
        <div
          className="fixed z-9999 pointer-events-none rounded-2xl transition-all duration-500"
          style={{
            top: activeRect.top - 12,
            left: activeRect.left - 12,
            width: activeRect.width + 24,
            height: activeRect.height + 24,
          }}
        >
          <div className="absolute inset-0 rounded-2xl border border-white/50" />
          <div className="absolute inset-0 rounded-2xl border border-white/15 blur-lg" />
        </div>
      )}

      <div
        className="fixed z-10000 w-90 pointer-events-auto transition-all duration-500"
        style={tooltipStyle}
      >
        <div
          className="relative rounded-2xl overflow-hidden backdrop-blur-xl border border-white/10"
          style={{ background: "rgba(15, 12, 10, 0.88)" }}
        >
          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 z-10 p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all"
          >
            <Cross2Icon width={16} height={16} />
          </button>

          <div className="flex justify-center pt-7 pb-1">
            <div
              className="w-22 h-22 rounded-xl overflow-hidden"
              style={{ filter: "saturate(0.85)" }}
            >
              <Image
                src={step.image}
                alt={step.title}
                width={88}
                height={88}
                className="object-cover w-full h-full"
              />
            </div>
          </div>

          <div className="px-6 pb-6 text-center">
            <h3 className="text-white font-semibold text-2xl tracking-tight font-serif italic mb-1.5">
              {step.title}
            </h3>
            <p className="text-white/50 text-sm leading-relaxed mb-6">
              {step.description}
            </p>

            <div className="mb-5">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-0.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white/40 transition-all duration-500 rounded-full"
                    style={{
                      width: `${((currentStep + 1) / TUTORIAL_STEPS.length) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-white/30 text-xs font-medium tabular-nums">
                  {currentStep + 1}/{TUTORIAL_STEPS.length}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handlePrevious}
                disabled={isFirstStep}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all disabled:opacity-20 disabled:cursor-not-allowed text-sm font-medium"
              >
                <ArrowLeftIcon width={14} height={14} />
                Back
              </button>

              <button
                onClick={handleNext}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-white hover:bg-white/90 text-black transition-all text-sm font-semibold"
              >
                {isLastStep ? "Let's Go" : "Next"}
                <ArrowRightIcon width={14} height={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function shouldShowTutorial(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) !== "true";
}
