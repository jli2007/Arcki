"use client";

import { useState } from "react";
import { Cross2Icon, CubeIcon, TrashIcon, TargetIcon } from "@radix-ui/react-icons";

interface InsertedModel {
  id: string;
  position: [number, number];
  height: number;
  modelUrl: string;
  scale: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
}

interface AssetManagerPanelProps {
  models: InsertedModel[];
  onClose: () => void;
  onFlyTo: (position: [number, number]) => void;
  onDelete: (id: string) => void;
  onUpdateModel: (id: string, updates: { scale?: number; positionX?: number; positionY?: number; height?: number; rotationX?: number; rotationY?: number; rotationZ?: number }) => void;
}

export function AssetManagerPanel({
  models,
  onClose,
  onFlyTo,
  onDelete,
  onUpdateModel,
}: AssetManagerPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<"scale" | "positionX" | "positionY" | "height" | "rotationX" | "rotationY" | "rotationZ" | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleStartEdit = (model: InsertedModel, field: "scale" | "positionX" | "positionY" | "height" | "rotationX" | "rotationY" | "rotationZ") => {
    setEditingId(model.id);
    setEditingField(field);
    if (field === "scale") {
      setEditValue(model.scale.toFixed(3));
    } else if (field === "positionX") {
      setEditValue(model.position[0].toFixed(6));
    } else if (field === "positionY") {
      setEditValue(model.position[1].toFixed(6));
    } else if (field === "height") {
      setEditValue(model.height.toFixed(1));
    } else if (field === "rotationX") {
      setEditValue(model.rotationX.toString());
    } else if (field === "rotationY") {
      setEditValue(model.rotationY.toString());
    } else {
      setEditValue(model.rotationZ.toString());
    }
  };

  const handleSaveEdit = (modelId: string) => {
    if (editingField === "scale") {
      const newScale = parseFloat(editValue);
      if (!isNaN(newScale) && newScale > 0) {
        onUpdateModel(modelId, { scale: newScale });
      }
    } else if (editingField === "positionX" || editingField === "positionY") {
      const newPos = parseFloat(editValue);
      if (!isNaN(newPos)) {
        onUpdateModel(modelId, { [editingField]: newPos });
      }
    } else if (editingField === "height") {
      const newHeight = parseFloat(editValue);
      if (!isNaN(newHeight)) {
        onUpdateModel(modelId, { height: Math.max(0, newHeight) });
      }
    } else if (editingField) {
      const newRotation = parseInt(editValue);
      if (!isNaN(newRotation)) {
        onUpdateModel(modelId, { [editingField]: newRotation % 360 });
      }
    }
    setEditingId(null);
    setEditingField(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, modelId: string) => {
    if (e.key === "Enter") {
      handleSaveEdit(modelId);
    } else if (e.key === "Escape") {
      setEditingId(null);
      setEditingField(null);
    }
  };

  return (
    <div className="absolute bottom-8 left-4 z-10 w-80 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <CubeIcon className="text-white/60" width={16} height={16} />
          <h3 className="text-white font-semibold text-sm">Assets</h3>
          <span className="text-white/40 text-xs">({models.length})</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-all"
        >
          <Cross2Icon width={14} height={14} />
        </button>
      </div>

      {/* Model list with fixed height and scroll (fits ~3 items) */}
      <div className="max-h-36 overflow-y-auto">
        {models.length === 0 ? (
          <div className="p-3 text-center text-white/40 text-xs">
            No models placed yet.
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {models.map((model, index) => (
              <div
                key={model.id}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 group"
              >
                <div className="w-7 h-7 rounded-lg bg-cyan-500/20 flex items-center justify-center shrink-0">
                  <CubeIcon className="text-cyan-400" width={14} height={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white text-xs font-medium truncate">
                      Model {index + 1}
                    </p>
                    {editingId === model.id && editingField === "scale" ? (
                      <span className="text-cyan-400 text-[10px]">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleSaveEdit(model.id)}
                          onKeyDown={(e) => handleKeyDown(e, model.id)}
                          className="w-12 bg-transparent border-none outline-none text-cyan-400 text-[10px]"
                          autoFocus
                        />x
                      </span>
                    ) : (
                      <button
                        onClick={() => handleStartEdit(model, "scale")}
                        className="text-white/40 text-[10px] hover:text-cyan-400 transition-colors"
                        title="Click to edit scale"
                      >
                        {model.scale.toFixed(2)}x
                      </button>
                    )}
                  </div>
                  {/* Position line */}
                  <div className="flex items-center gap-1 text-white/40 text-[10px]">
                    <span className="text-white/30">Pos:</span>
                    {editingId === model.id && editingField === "positionX" ? (
                      <span className="text-cyan-400">
                        X:<input
                          type="text"
                          inputMode="decimal"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleSaveEdit(model.id)}
                          onKeyDown={(e) => handleKeyDown(e, model.id)}
                          className="w-16 bg-transparent border-none outline-none text-cyan-400 text-[10px]"
                          autoFocus
                        />
                      </span>
                    ) : (
                      <button
                        onClick={() => handleStartEdit(model, "positionX")}
                        className="hover:text-cyan-400 transition-colors"
                        title="Longitude (X)"
                      >
                        X:{model.position[0].toFixed(4)}
                      </button>
                    )}
                    {editingId === model.id && editingField === "positionY" ? (
                      <span className="text-cyan-400">
                        Y:<input
                          type="text"
                          inputMode="decimal"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleSaveEdit(model.id)}
                          onKeyDown={(e) => handleKeyDown(e, model.id)}
                          className="w-16 bg-transparent border-none outline-none text-cyan-400 text-[10px]"
                          autoFocus
                        />
                      </span>
                    ) : (
                      <button
                        onClick={() => handleStartEdit(model, "positionY")}
                        className="hover:text-cyan-400 transition-colors"
                        title="Latitude (Y)"
                      >
                        Y:{model.position[1].toFixed(4)}
                      </button>
                    )}
                    {editingId === model.id && editingField === "height" ? (
                      <span className="text-cyan-400">
                        Z:<input
                          type="text"
                          inputMode="decimal"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleSaveEdit(model.id)}
                          onKeyDown={(e) => handleKeyDown(e, model.id)}
                          className="w-10 bg-transparent border-none outline-none text-cyan-400 text-[10px]"
                          autoFocus
                        />
                      </span>
                    ) : (
                      <button
                        onClick={() => handleStartEdit(model, "height")}
                        className="hover:text-cyan-400 transition-colors"
                        title="Height (Z)"
                      >
                        Z:{model.height.toFixed(1)}
                      </button>
                    )}
                  </div>
                  {/* Rotation line */}
                  <div className="flex items-center gap-1 text-white/40 text-[10px]">
                    <span className="text-white/30">Rot:</span>
                    {editingId === model.id && editingField === "rotationX" ? (
                      <span className="text-cyan-400">
                        X:<input
                          type="text"
                          inputMode="numeric"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleSaveEdit(model.id)}
                          onKeyDown={(e) => handleKeyDown(e, model.id)}
                          className="w-8 bg-transparent border-none outline-none text-cyan-400 text-[10px]"
                          autoFocus
                        />°
                      </span>
                    ) : (
                      <button
                        onClick={() => handleStartEdit(model, "rotationX")}
                        className="hover:text-cyan-400 transition-colors"
                        title="Rotation X"
                      >
                        X:{model.rotationX}°
                      </button>
                    )}
                    {editingId === model.id && editingField === "rotationY" ? (
                      <span className="text-cyan-400">
                        Y:<input
                          type="text"
                          inputMode="numeric"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleSaveEdit(model.id)}
                          onKeyDown={(e) => handleKeyDown(e, model.id)}
                          className="w-8 bg-transparent border-none outline-none text-cyan-400 text-[10px]"
                          autoFocus
                        />°
                      </span>
                    ) : (
                      <button
                        onClick={() => handleStartEdit(model, "rotationY")}
                        className="hover:text-cyan-400 transition-colors"
                        title="Rotation Y"
                      >
                        Y:{model.rotationY}°
                      </button>
                    )}
                    {editingId === model.id && editingField === "rotationZ" ? (
                      <span className="text-cyan-400">
                        Z:<input
                          type="text"
                          inputMode="numeric"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleSaveEdit(model.id)}
                          onKeyDown={(e) => handleKeyDown(e, model.id)}
                          className="w-8 bg-transparent border-none outline-none text-cyan-400 text-[10px]"
                          autoFocus
                        />°
                      </span>
                    ) : (
                      <button
                        onClick={() => handleStartEdit(model, "rotationZ")}
                        className="hover:text-cyan-400 transition-colors"
                        title="Rotation Z"
                      >
                        Z:{model.rotationZ}°
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onFlyTo(model.position)}
                    className="p-1 rounded-md hover:bg-white/10 text-white/60 hover:text-white transition-all"
                    title="Fly to model"
                  >
                    <TargetIcon width={12} height={12} />
                  </button>
                  <button
                    onClick={() => onDelete(model.id)}
                    className="p-1 rounded-md hover:bg-red-500/20 text-white/60 hover:text-red-400 transition-all"
                    title="Delete model"
                  >
                    <TrashIcon width={12} height={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
