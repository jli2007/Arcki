"use client";

import {
  CursorArrowIcon,
  Pencil2Icon,
  CubeIcon,
  MagicWandIcon,
  UploadIcon,
} from "@radix-ui/react-icons";
import * as Tooltip from "@radix-ui/react-tooltip";

type ToolType = "select" | "draw" | "insert" | null;

interface ToolbarProps {
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  showPromptGenerator: boolean;
  onTogglePromptGenerator: () => void;
  selectedModelId?: string | null;
  onSaveToLibrary?: () => void | Promise<void>;
  isModelFavorited?: boolean;
}

export function Toolbar({
  activeTool,
  setActiveTool,
  showPromptGenerator,
  onTogglePromptGenerator,
  selectedModelId,
  onSaveToLibrary,
  isModelFavorited,
}: ToolbarProps) {
  const handleToolSelect = (tool: ToolType) => {
    if (showPromptGenerator) onTogglePromptGenerator();
    setActiveTool(activeTool === tool ? null : tool);
  };

  const handleGenerateClick = () => {
    setActiveTool(null);
    onTogglePromptGenerator();
  };

  return (
    <Tooltip.Provider delayDuration={0}>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-row items-center h-16 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 px-8 shadow-xl">
        <div className="flex flex-row gap-6 items-center">
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                data-tutorial="toolbar-select"
                onClick={() => handleToolSelect("select")}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg transition-all w-14 ${
                  activeTool === "select"
                    ? "bg-white/20 text-white shadow-lg"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                <CursorArrowIcon width={20} height={20} />
                <span className="text-xs font-medium font-serif italic">
                  Select
                </span>
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content
              className="select-none rounded-lg bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 text-sm font-medium text-white shadow-xl z-50"
              side="bottom"
              sideOffset={5}
            >
              Select buildings to view details
              <Tooltip.Arrow className="fill-white/10" />
            </Tooltip.Content>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                data-tutorial="toolbar-delete"
                onClick={() => handleToolSelect("draw")}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg transition-all w-14 ${
                  activeTool === "draw"
                    ? "bg-white/20 text-white shadow-lg"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                <Pencil2Icon width={20} height={20} />
                <span className="text-xs font-medium font-serif italic">
                  Delete
                </span>
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content
              className="select-none rounded-lg bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 text-sm font-medium text-white shadow-xl z-50"
              side="bottom"
              sideOffset={5}
            >
              Draw an area to remove buildings
              <Tooltip.Arrow className="fill-white/10" />
            </Tooltip.Content>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                data-tutorial="toolbar-insert"
                onClick={() => handleToolSelect("insert")}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg transition-all w-14 ${
                  activeTool === "insert"
                    ? "bg-white/20 text-white shadow-lg"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                <CubeIcon width={20} height={20} />
                <span className="text-xs font-medium font-serif italic">
                  Insert
                </span>
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content
              className="select-none rounded-lg bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 text-sm font-medium text-white shadow-xl z-50"
              side="bottom"
              sideOffset={5}
            >
              Insert custom 3D models
              <Tooltip.Arrow className="fill-white/10" />
            </Tooltip.Content>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                data-tutorial="toolbar-generate"
                onClick={handleGenerateClick}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg transition-all w-14 ${
                  showPromptGenerator
                    ? "bg-white/20 text-white shadow-lg"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                <MagicWandIcon width={20} height={20} />
                <span className="text-xs font-medium font-serif italic">
                  Generate
                </span>
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content
              className="select-none rounded-lg bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 text-sm font-medium text-white shadow-xl z-50"
              side="bottom"
              sideOffset={5}
            >
              Generate 3D objects from prompts
              <Tooltip.Arrow className="fill-white/10" />
            </Tooltip.Content>
          </Tooltip.Root>

          {selectedModelId && onSaveToLibrary && (
            <>
              <div className="w-px h-8 bg-white/20" />
              <button
                onClick={() => onSaveToLibrary()}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg transition-all w-14 border ${
                  isModelFavorited
                    ? "bg-amber-500/30 text-amber-200 border-amber-400/40 hover:bg-amber-500/40"
                    : "bg-emerald-500/40 text-white hover:bg-emerald-500/60 border-emerald-400/50"
                }`}
              >
                <UploadIcon width={20} height={20} />
                <span className="text-xs font-medium font-serif italic">
                  {isModelFavorited ? "Saved" : "Save"}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </Tooltip.Provider>
  );
}
