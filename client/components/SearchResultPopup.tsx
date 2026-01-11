"use client";

import { useRef, useEffect } from "react";

interface SearchResult {
  intent: {
    action: string;
    location_query?: string;
    building_attributes?: {
      sort_by?: string;
      building_type?: string;
      limit?: number;
    };
    reasoning?: string;
  };
  answer: string;
  coordinates?: [number, number] | null;
  target?: GeoJSON.Feature | null;
  candidates: GeoJSON.Feature[];
  should_fly_to: boolean;
  zoom_level?: number | null;
}

interface SearchResultPopupProps {
  result: SearchResult;
  onClose: () => void;
  onCandidateClick: (candidate: GeoJSON.Feature) => void;
}

function getBuildingName(feature: GeoJSON.Feature): string {
  const props = feature.properties || {};
  return (
    props.name ||
    props["addr:housename"] ||
    props["addr:housenumber"] ||
    `Building ${feature.id || ""}`
  );
}

export function SearchResultPopup({
  result,
  onClose,
  onCandidateClick,
}: SearchResultPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node)
      ) {
        // Don't close if clicking on the search bar
        const searchBar = document.querySelector('[data-search-container]');
        if (searchBar && searchBar.contains(event.target as Node)) {
          return;
        }
        onClose();
      }
    };

    // Delay to avoid closing immediately on search
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={popupRef}
      className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 w-[500px] max-h-[320px] rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 shadow-xl overflow-hidden animate-[fadeIn_0.2s_ease-out_forwards]"
    >
      {/* Header with close button */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-white/60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <span className="text-xs text-white/50 uppercase tracking-wide font-medium">
            Search Result
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors duration-200"
        >
          <svg
            className="w-4 h-4 text-white/60 hover:text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="p-4 overflow-y-auto max-h-[250px]">
        {/* Main answer */}
        <div className="text-white font-medium text-base leading-relaxed mb-4">
          {result.answer}
        </div>

        {/* Candidates list */}
        {result.candidates && result.candidates.length > 0 && (
          <div className="border-t border-white/10 pt-3">
            <div className="text-xs text-white/50 uppercase tracking-wide font-medium mb-2.5">
              Other results
            </div>
            <div className="flex flex-col gap-2">
              {result.candidates.map((candidate, idx) => (
                <button
                  key={candidate.id || idx}
                  onClick={() => onCandidateClick(candidate)}
                  className="w-full text-left px-3 py-2.5 text-sm bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-lg border border-white/10 transition-all duration-200 flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4 text-white/40 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                  <span className="truncate">{getBuildingName(candidate)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
