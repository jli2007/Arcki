"use client";

import { useState, useEffect, useRef } from "react";
import { Cross2Icon, CubeIcon, ReloadIcon, CheckCircledIcon, ExclamationTriangleIcon, ImageIcon } from "@radix-ui/react-icons";
import { supabase } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PendingModel {
  file: File;
  url: string;
  scale: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
}

interface Prompt3DGeneratorProps {
  onClose: () => void;
  onPlaceModel?: (model: PendingModel) => void;
}

interface GenerationStage {
  name: string;
  status: "pending" | "active" | "completed" | "error";
  message?: string;
}

interface JobResult {
  job_id: string;
  status: string;
  original_prompt: string;
  cleaned_prompt: string;
  dalle_prompt: string;
  image_urls: string[];
  model_url: string | null;
  model_file: string | null;
  download_url: string | null;
  total_time: number;
}

export function Prompt3DGenerator({ onClose, onPlaceModel }: Prompt3DGeneratorProps) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<"architectural" | "modern" | "classical" | "futuristic">("architectural");
  const [numViews, setNumViews] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [result, setResult] = useState<JobResult | null>(null);
  const [stages, setStages] = useState<GenerationStage[]>([
    { name: "Cleaning Prompt", status: "pending" },
    { name: "Generating Images", status: "pending" },
    { name: "Creating 3D Model", status: "pending" },
  ]);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const updateStage = (index: number, status: GenerationStage["status"], message?: string) => {
    setStages(prev => prev.map((stage, i) =>
      i === index ? { ...stage, status, message } : stage
    ));
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);
    setProgress(0);
    setGeneratedImages([]);
    setResult(null);
    setStages([
      { name: "Cleaning Prompt", status: "pending" },
      { name: "Generating Images", status: "pending" },
      { name: "Creating 3D Model", status: "pending" },
    ]);

    try {
      // Start async job
      const response = await fetch(`${API_BASE}/generate-architecture-async`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          style,
          num_views: numViews,
          texture_size: 1024,
          high_quality: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to start generation");
      }

      const { job_id } = await response.json();

      // Start polling for status
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE}/job/${job_id}`);
          if (!statusRes.ok) throw new Error("Failed to get job status");

          const status = await statusRes.json();
          setProgress(status.progress);
          setStatusMessage(status.message);

          // Update stages based on status
          if (status.status === "cleaning_prompt") {
            updateStage(0, "active");
          } else if (status.status === "generating_images") {
            updateStage(0, "completed");
            updateStage(1, "active");
          } else if (status.status === "generating_3d") {
            updateStage(0, "completed");
            updateStage(1, "completed");
            updateStage(2, "active");
          } else if (status.status === "completed") {
            updateStage(0, "completed");
            updateStage(1, "completed");
            updateStage(2, "completed");

            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
            }

            const jobResult = status.result as JobResult;
            setResult(jobResult);
            setGeneratedImages(jobResult.image_urls || []);
            setIsGenerating(false);

          } else if (status.status === "failed") {
            throw new Error(status.message || "Generation failed");
          }
        } catch (e) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
          throw e;
        }
      }, 1500);

    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error occurred");
      setIsGenerating(false);
      updateStage(0, "error");
      updateStage(1, "error");
      updateStage(2, "error");
    }
  };

  const handlePlaceModel = async () => {
    if (!result?.download_url || !onPlaceModel) return;

    try {
      // Download the GLB file
      const response = await fetch(`${API_BASE}${result.download_url}`);
      if (!response.ok) throw new Error("Failed to download model");

      const blob = await response.blob();
      const file = new File([blob], result.model_file || "model.glb", { type: "model/gltf-binary" });
      const url = URL.createObjectURL(blob);

      // Upload to Supabase library (don't wait for it)
      uploadToLibrary(file, result).catch(err => {
        console.error('Failed to upload generated model to library:', err);
      });

      // Place the model on the map
      onPlaceModel({
        file,
        url,
        scale: 1,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
      });

      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load model");
    }
  };

  const uploadToLibrary = async (file: File, jobResult: JobResult) => {
    try {
      const timestamp = Date.now();
      const glbFilename = `${timestamp}-generated.glb`;

      // Upload GLB
      const { error: uploadError } = await supabase.storage
        .from('models')
        .upload(glbFilename, file, {
          contentType: 'model/gltf-binary',
          cacheControl: '3600',
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl: glbUrl } } = supabase.storage
        .from('models')
        .getPublicUrl(glbFilename);

      // Upload thumbnail if available
      let thumbnailUrl = `https://placehold.co/200x200/1a1a1a/white?text=Generated`;

      if (jobResult.image_urls && jobResult.image_urls.length > 0) {
        try {
          const thumbnailResponse = await fetch(`${API_BASE}${jobResult.image_urls[0]}`);
          const thumbnailBlob = await thumbnailResponse.blob();
          const thumbnailFilename = `${timestamp}-thumbnail.jpg`;

          const { error: thumbError } = await supabase.storage
            .from('thumbnails')
            .upload(thumbnailFilename, thumbnailBlob, {
              contentType: 'image/jpeg',
              cacheControl: '3600',
            });

          if (!thumbError) {
            const { data: { publicUrl } } = supabase.storage
              .from('thumbnails')
              .getPublicUrl(thumbnailFilename);
            thumbnailUrl = publicUrl;
          }
        } catch (e) {
          console.warn('Failed to upload thumbnail, using placeholder');
        }
      }

      // Insert metadata
      const { error: insertError } = await supabase
        .from('models')
        .insert({
          name: jobResult.cleaned_prompt.substring(0, 100),
          description: `Generated from: "${jobResult.original_prompt}"`,
          glb_url: glbUrl,
          thumbnail_url: thumbnailUrl,
          category: 'AI Generated',
          file_size: file.size,
        });

      if (insertError) throw insertError;

      console.log('Successfully uploaded generated model to library');
    } catch (error) {
      throw error;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.metaKey) {
      handleGenerate();
    }
  };

  const quickPrompts = [
    { label: "Paris Haussmann", prompt: "Classic Parisian Haussmann-style building with ornate balconies and mansard roof" },
    { label: "Modern Tower", prompt: "Sleek glass skyscraper with geometric facade patterns" },
    { label: "Neo-Gothic", prompt: "Gothic revival cathedral with pointed arches and flying buttresses" },
    { label: "Brutalist", prompt: "Raw concrete brutalist apartment block with angular forms" },
  ];

  return (
    <div className="absolute right-4 top-4 z-20 w-[420px] rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 border border-white/20">
            <CubeIcon width={16} height={16} className="text-white/80" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-base">3D Model Generator</h3>
            <p className="text-white/50 text-xs">Text-to-3D Pipeline</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-white/60 hover:text-white transition-all"
        >
          <Cross2Icon width={16} height={16} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Prompt Input */}
        <div className="space-y-2">
          <label className="text-white/70 text-sm font-medium">Building Description</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="e.g., A classic Parisian building with cream stone facade, wrought iron balconies, and blue mansard roof"
            className="w-full h-24 px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30 resize-none text-sm"
            disabled={isGenerating}
          />
        </div>

        {/* Quick Prompts */}
        <div className="space-y-2">
          <label className="text-white/70 text-sm font-medium">Presets</label>
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((qp) => (
              <button
                key={qp.label}
                onClick={() => setPrompt(qp.prompt)}
                disabled={isGenerating}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs transition-all border border-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {qp.label}
              </button>
            ))}
          </div>
        </div>

        {/* Style Selection */}
        <div className="space-y-2">
          <label className="text-white/70 text-sm font-medium">Style</label>
          <div className="grid grid-cols-2 gap-2">
            {(["architectural", "modern", "classical", "futuristic"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStyle(s)}
                disabled={isGenerating}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                  style === s
                    ? "bg-white/20 border-white/30 text-white"
                    : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                } disabled:opacity-50`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Views Selection */}
        <div className="space-y-2">
          <label className="text-white/70 text-sm font-medium">Image Views</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setNumViews(n)}
                disabled={isGenerating}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                  numViews === n
                    ? "bg-white/20 border-white/30 text-white"
                    : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                } disabled:opacity-50`}
              >
                {n} {n === 1 ? "View" : "Views"}
              </button>
            ))}
          </div>
          <p className="text-white/40 text-xs">More views improve quality but increase generation time</p>
        </div>

        {/* Generation Progress */}
        {isGenerating && (
          <div className="space-y-3 p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-white/70 text-sm font-medium">Generating...</span>
              <span className="text-white/80 text-sm">{progress}%</span>
            </div>

            {/* Progress Bar */}
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/80 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Stages */}
            <div className="space-y-2">
              {stages.map((stage, i) => (
                <div key={i} className="flex items-center gap-2">
                  {stage.status === "pending" && (
                    <div className="w-4 h-4 rounded-full border border-white/20" />
                  )}
                  {stage.status === "active" && (
                    <ReloadIcon className="w-4 h-4 text-white/80 animate-spin" />
                  )}
                  {stage.status === "completed" && (
                    <CheckCircledIcon className="w-4 h-4 text-green-400" />
                  )}
                  {stage.status === "error" && (
                    <ExclamationTriangleIcon className="w-4 h-4 text-red-400" />
                  )}
                  <span className={`text-xs ${
                    stage.status === "active" ? "text-white/80" :
                    stage.status === "completed" ? "text-green-400" :
                    stage.status === "error" ? "text-red-400" :
                    "text-white/40"
                  }`}>
                    {stage.name}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-white/50 text-xs">{statusMessage}</p>
          </div>
        )}

        {/* Generated Images Preview */}
        {generatedImages.length > 0 && (
          <div className="space-y-2">
            <label className="text-white/70 text-sm font-medium flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              Generated Views
            </label>
            <div className="grid grid-cols-2 gap-2">
              {generatedImages.map((url, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-white/10">
                  <img
                    src={url}
                    alt={`View ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white/70">
                    View {i + 1}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Result */}
        {result && !isGenerating && (
          <div className="space-y-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2">
              <CheckCircledIcon className="w-5 h-5 text-green-400" />
              <span className="text-green-400 font-medium">3D Model Ready!</span>
            </div>
            <p className="text-white/60 text-xs">
              Generated in {result.total_time?.toFixed(1) || "~"}s
            </p>
            <button
              onClick={handlePlaceModel}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-green-500 hover:bg-green-400 text-black font-semibold transition-all"
            >
              <CubeIcon width={16} height={16} />
              <span>Place on Map</span>
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon className="w-5 h-5 text-red-400" />
              <span className="text-red-400 font-medium">Error</span>
            </div>
            <p className="text-red-300/70 text-xs mt-1">{error}</p>
          </div>
        )}

        {/* Generate Button */}
        {!result && (
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white text-black font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/90"
          >
            {isGenerating ? (
              <>
                <ReloadIcon width={16} height={16} className="animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <CubeIcon width={16} height={16} />
                <span>Generate Model</span>
              </>
            )}
          </button>
        )}

        {/* Info */}
        <p className="text-white/40 text-xs text-center">
          {!result
            ? "Press ⌘ + Enter to generate"
            : "Click 'Place on Map' then click where you want the model"
          }
        </p>
      </div>
    </div>
  );
}
