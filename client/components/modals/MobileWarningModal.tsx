"use client";

interface MobileWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileWarningModal({
  isOpen,
  onClose,
}: MobileWarningModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/80 p-8">
      <div className="max-w-md text-center bg-black border border-white/20 rounded-2xl p-8">
        <h1 className="text-white text-2xl font-bold mb-4">Desktop Required</h1>
        <p className="text-white/70 mb-6">
          Arcki is a 3D visualization tool that requires a larger screen for the
          best experience. Please switch to a desktop or laptop computer.
        </p>
        <p className="text-white/40 text-sm mb-6">
          Minimum recommended: 1024px width
        </p>
        <button
          onClick={onClose}
          className="px-6 py-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
