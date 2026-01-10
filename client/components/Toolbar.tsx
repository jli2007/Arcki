"use client";

import { CursorArrowIcon, GlobeIcon, InfoCircledIcon, Pencil2Icon } from "@radix-ui/react-icons";

type ToolType = "select" | "teleport" | "draw" | null;

interface ToolbarProps {
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
}

export function Toolbar({ activeTool, setActiveTool }: ToolbarProps) {
  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex flex-col justify-between w-14 h-[440px] rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 py-4 shadow-xl">
      <div className="flex flex-col gap-4 items-center">
        <button
          onClick={() => setActiveTool("select")}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all w-10 ${
            activeTool === "select"
              ? "bg-white/20 text-white shadow-lg"
              : "text-white/60 hover:text-white hover:bg-white/10"
          }`}
        >
          <CursorArrowIcon width={20} height={20} />
          <span className="text-[10px] font-medium">Select</span>
        </button>

        <button
          onClick={() => setActiveTool("teleport")}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all w-10 ${
            activeTool === "teleport"
              ? "bg-white/20 text-white shadow-lg"
              : "text-white/60 hover:text-white hover:bg-white/10"
          }`}
        >
          <GlobeIcon width={20} height={20} />
          <span className="text-[10px] font-medium">Teleport</span>
        </button>

        <button
          onClick={() => setActiveTool("draw")}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all w-10 ${
            activeTool === "draw"
              ? "bg-white/20 text-white shadow-lg"
              : "text-white/60 hover:text-white hover:bg-white/10"
          }`}
        >
          <Pencil2Icon width={20} height={20} />
          <span className="text-[10px] font-medium">Draw</span>
        </button>
      </div>

      <div className="flex flex-col gap-4 items-center">
        <button className="flex flex-col items-center gap-1 p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all w-10">
          <InfoCircledIcon width={20} height={20} />
          <span className="text-[10px] font-medium">About</span>
        </button>
      </div>
    </div>
  );
}
