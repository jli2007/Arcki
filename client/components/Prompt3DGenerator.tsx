"use client";

import { useState, useEffect, useRef } from "react";
import { Cross2Icon, CubeIcon, ReloadIcon, CheckCircledIcon, ExclamationTriangleIcon, ImageIcon, Pencil1Icon, ChevronLeftIcon, ChevronRightIcon, EnterFullScreenIcon, MinusIcon } from "@radix-ui/react-icons";
import { supabase } from "@/lib/supabase";
import Image from "next/image";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const STORAGE_KEY = "prompt3d_generator_state";

interface PendingModel {
  file: File;
  url: string;
  scale: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  isFavorited?: boolean;
  generatedFrom?: string;
}

interface Prompt3DGeneratorProps {
  isVisible: boolean;
  onClose: () => void;
  onRequestExpand: () => void;
  onPlaceModel?: (model: PendingModel) => void;
}

interface PreviewResult {
  job_id: string;
  original_prompt: string;
  cleaned_prompt: string;
  dalle_prompt: string;
  image_urls: string[];
  preview_3d_url?: string;
}

interface ThreeDJobResult {
  job_id: string;
  status: string;
  progress: number;
  message: string;
  model_url?: string;
  model_file?: string;
  download_url?: string;
  generation_time?: number;
}

type WorkflowStage = "input" | "preview" | "placing";

interface GeneratorState {
  prompt: string;
  style: "architectural" | "modern" | "classical" | "futuristic";
  numViews: number;
  workflowStage: WorkflowStage;
  previewResult: PreviewResult | null;
  selectedImageIndex: number;
  threeDJob: ThreeDJobResult | null;
}

export function Prompt3DGenerator({ isVisible, onClose, onRequestExpand, onPlaceModel }: Prompt3DGeneratorProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<"architectural" | "modern" | "classical" | "futuristic">("architectural");
  const [numViews, setNumViews] = useState(1);

  const [workflowStage, setWorkflowStage] = useState<WorkflowStage>("input");
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isExpandedView, setIsExpandedView] = useState(false);
  const [threeDJob, setThreeDJob] = useState<ThreeDJobResult | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state: GeneratorState = JSON.parse(saved);
        setPrompt(state.prompt);
        setStyle(state.style);
        setNumViews(state.numViews);
        setWorkflowStage(state.workflowStage);
        setPreviewResult(state.previewResult);
        setSelectedImageIndex(state.selectedImageIndex);
        setThreeDJob(state.threeDJob);

        if (state.previewResult && state.workflowStage === "preview") {
          start3DGeneration(state.previewResult.job_id);
        }
      }
    } catch (e) {
      console.error("Failed to restore generator state:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const state: GeneratorState = {
      prompt,
      style,
      numViews,
      workflowStage,
      previewResult,
      selectedImageIndex,
      threeDJob,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [prompt, style, numViews, workflowStage, previewResult, selectedImageIndex, threeDJob]);

  useEffect(() => {
    if (!isVisible && !isMinimized) {
      setIsMinimized(true);
    } else if (isVisible && isMinimized) {
      setIsMinimized(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (previewResult && workflowStage === "preview" && !threeDJob) {
      start3DGeneration(previewResult.job_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewResult, workflowStage]);

  const handleGeneratePreview = async () => {
    if (!prompt.trim()) return;

    setIsGeneratingPreview(true);
    setError(null);
    setPreviewResult(null);
    setThreeDJob(null);

    try {
      const response = await fetch(`${API_BASE}/generate-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          prompt,
          style,
          num_views: numViews,
          high_quality: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to generate preview");
      }

      const result = await response.json();
      setPreviewResult(result);
      setWorkflowStage("preview");
      
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error occurred");
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const start3DGeneration = async (jobId: string) => {
    if (!previewResult) return;

    try {
      const response = await fetch(`${API_BASE}/start-3d`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          image_urls: previewResult.image_urls,
          texture_size: 1024, // Max texture resolution...
          use_multi: numViews > 1,
        }),
      });

      if (!response.ok) {
        console.log("3D generation already started, resuming polling...");
      }

      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE}/3d-job/${jobId}`, {
            credentials: 'include'
          });
          if (!statusRes.ok) return;

          const status: ThreeDJobResult = await statusRes.json();
          setThreeDJob(status);

          if (status.status === "completed" || status.status === "failed") {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
            }
          }
        } catch {
          // Silent fail, keep polling
        }
      }, 1500);

    } catch (e) {
      console.error("Failed to start 3D generation:", e);
    }
  };

  const handleRefinePrompt = async () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    
    if (previewResult?.job_id) {
      try {
        await fetch(`${API_BASE}/jobs/${previewResult.job_id}/cancel`, {
          method: "POST",
        });
      } catch (e) {
        console.log("Could not cancel job:", e);
      }
    }
    
    setWorkflowStage("input");
    setPreviewResult(null);
    setThreeDJob(null);
    setSelectedImageIndex(0);
    setIsExpandedView(false);
  };

  const handleFinish = async () => {
    if (!onPlaceModel || !previewResult) return;

    if (threeDJob?.status === "completed" && threeDJob.download_url) {
      await placeModel(threeDJob.download_url, threeDJob.model_file);
    } else {
      setWorkflowStage("placing");
      setIsPlacing(true);
      
      const waitForModel = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE}/3d-job/${previewResult.job_id}`);
          if (!statusRes.ok) return;

          const status: ThreeDJobResult = await statusRes.json();
          setThreeDJob(status);

          if (status.status === "completed" && status.download_url) {
            clearInterval(waitForModel);
            await placeModel(status.download_url, status.model_file);
          } else if (status.status === "failed") {
            clearInterval(waitForModel);
            setError("3D generation failed. Please try again.");
            setIsPlacing(false);
            setWorkflowStage("preview");
          }
        } catch {
          // Keep waiting
        }
      }, 1000);
    }
  };

  const placeModel = async (downloadUrl: string, modelFile?: string) => {
    if (!downloadUrl || !onPlaceModel) return;

    try {
      const response = await fetch(`${API_BASE}${downloadUrl}`);
      if (!response.ok) throw new Error("Failed to download model");

      const blob = await response.blob();
      const file = new File([blob], modelFile || "model.glb", { type: "model/gltf-binary" });
      const modelUrl = URL.createObjectURL(blob);

      onPlaceModel({
        file,
        url: modelUrl,
        scale: 50,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        isFavorited: false,
        generatedFrom: previewResult?.cleaned_prompt?.substring(0, 100),
      });

      localStorage.removeItem(STORAGE_KEY);
      setIsPlacing(false);
      setWorkflowStage("input");
      setPreviewResult(null);
      setThreeDJob(null);
      setPrompt("");
      setIsMinimized(false);
      
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load model");
      setIsPlacing(false);
      setWorkflowStage("preview");
    }
  };

  const uploadToLibrary = async (file: File, preview: PreviewResult): Promise<string | null> => {
    try {
      const timestamp = Date.now();
      const glbFilename = `${timestamp}-generated.glb`;

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

      let thumbnailUrl = `https://placehold.co/200x200/1a1a1a/white?text=Generated`;

      if (preview.image_urls && preview.image_urls.length > 0) {
        try {
          const thumbnailResponse = await fetch(preview.image_urls[0]);
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
        } catch {}
      }

      const { error: insertError } = await supabase
        .from('models')
        .insert({
          name: preview.cleaned_prompt.substring(0, 100),
          description: `Generated from: "${preview.original_prompt}"`,
          glb_url: glbUrl,
          thumbnail_url: thumbnailUrl,
          category: 'AI Generated',
          file_size: file.size,
        });

      if (insertError) throw insertError;
      return glbUrl;
    } catch (error) {
      throw error;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.metaKey) {
      handleGeneratePreview();
    }
  };

  const nextImage = () => {
    if (previewResult) {
      setSelectedImageIndex((prev) => (prev + 1) % previewResult.image_urls.length);
    }
  };

  const prevImage = () => {
    if (previewResult) {
      setSelectedImageIndex((prev) => (prev - 1 + previewResult.image_urls.length) % previewResult.image_urls.length);
    }
  };

  const quickPrompts = [
    { label: "Art Deco", prompt: "Art Deco skyscraper with geometric patterns, stepped facade, and ornamental metalwork" },
    { label: "Brutalist", prompt: "Brutalist concrete building with bold geometric forms and exposed structural elements" },
    { label: "Victorian", prompt: "Victorian-era building with decorative trim, bay windows, and colorful painted facade" },
  ];

  const ExpandedModal = () => {
    if (!isExpandedView || !previewResult) return null;
    
    return (
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-8"
        onClick={() => setIsExpandedView(false)}
      >
        <button
          onClick={() => setIsExpandedView(false)}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all"
        >
          <Cross2Icon width={20} height={20} />
        </button>
        
        {previewResult.image_urls.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); prevImage(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white transition-all"
            >
              <ChevronLeftIcon width={28} height={28} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); nextImage(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white transition-all"
            >
              <ChevronRightIcon width={28} height={28} />
            </button>
          </>
        )}
        
        <div 
          className="flex flex-col items-center justify-center w-full h-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex-1 flex items-center justify-center w-full min-h-0">
            <Image
              src={previewResult.image_urls[selectedImageIndex]}
              alt={`View ${selectedImageIndex + 1}`}
              width={800}
              height={800}
              unoptimized
              className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-2xl"
            />
          </div>
          
          {previewResult.image_urls.length > 1 && (
            <div className="flex gap-3 justify-center mt-6 shrink-0">
              {previewResult.image_urls.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImageIndex(i)}
                  className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                    selectedImageIndex === i
                      ? "border-white ring-2 ring-white/30"
                      : "border-white/20 hover:border-white/40"
                  }`}
                >
                  <Image src={url} alt={`View ${i + 1}`} fill unoptimized className="object-cover" />
                </button>
              ))}
            </div>
          )}
          
          <div className="text-center mt-3 text-white/60 text-sm shrink-0">
            {selectedImageIndex + 1} / {previewResult.image_urls.length}
          </div>
        </div>
      </div>
    );
  };

  const handleClose = () => {
    localStorage.removeItem(STORAGE_KEY);
    setIsMinimized(false);
    onClose();
  };

  if (!isVisible && !isMinimized && workflowStage === "input" && !prompt && !previewResult) {
    return null;
  }

  const handleExpand = () => {
    setIsMinimized(false);
    if (!isVisible) {
      onRequestExpand();
    }
  };

  if (isMinimized || !isVisible) {
    return (
      <div className="absolute right-4 top-4 z-20">
        <button
          onClick={handleExpand}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 shadow-xl hover:bg-black/50 transition-all"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 border border-white/20">
            <CubeIcon width={16} height={16} className="text-white/80" />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-white font-semibold text-sm font-serif">3D Generator</span>
            <span className="text-white/50 text-xs">
              {workflowStage === "input" && "Ready to create"}
              {workflowStage === "preview" && threeDJob?.status === "generating" && `${threeDJob.progress}% complete`}
              {workflowStage === "preview" && threeDJob?.status === "completed" && "Model ready!"}
              {workflowStage === "preview" && !threeDJob && "Previewing..."}
              {workflowStage === "placing" && "Placing model..."}
            </span>
          </div>
          {threeDJob?.status === "generating" && (
            <ReloadIcon width={14} height={14} className="text-white/60 animate-spin ml-auto" />
          )}
          {threeDJob?.status === "completed" && (
            <CheckCircledIcon width={14} height={14} className="text-green-400 ml-auto" />
          )}
        </button>
      </div>
    );
  }

  return (
    <>
      <ExpandedModal />

      <div className="absolute right-4 top-4 z-20 w-105 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 border border-white/20">
              <CubeIcon width={16} height={16} className="text-white/80" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-lg tracking-tight font-serif">3D Generator</h3>
              <p className="text-white/50 text-xs">
                {workflowStage === "input" && "Describe your building"}
                {(workflowStage === "preview" || workflowStage === "placing") && "Review your design"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-white/60 hover:text-white transition-all"
            title="Minimize"
          >
            <MinusIcon width={16} height={16} />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {workflowStage === "input" && (
            <>
              <div>
                <label className="block text-white/80 text-base font-medium font-serif italic tracking-wide mb-3">Building Description</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="e.g., A classic Parisian building with cream stone facade, wrought iron balconies, and blue mansard roof"
                  className="w-full h-24 px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30 resize-none text-sm"
                  disabled={isGeneratingPreview}
                />
              </div>

              <div className="pt-2">
                <label className="block text-white/80 text-base font-medium font-serif italic tracking-wide mb-3">Popular Snippets</label>
                <div className="flex flex-wrap gap-2">
                  {quickPrompts.map((qp) => (
                    <button
                      key={qp.label}
                      onClick={() => setPrompt(qp.prompt)}
                      disabled={isGeneratingPreview}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs transition-all border border-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <label className="block text-white/80 text-base font-medium font-serif italic tracking-wide mb-3">Style</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["architectural", "modern", "classical", "futuristic"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStyle(s)}
                      disabled={isGeneratingPreview}
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

              <div className="pt-2">
                <label className="block text-white/80 text-base font-medium font-serif italic tracking-wide mb-3">Image Views</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      onClick={() => setNumViews(n)}
                      disabled={isGeneratingPreview}
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
              </div>

              <button
                onClick={handleGeneratePreview}
                disabled={!prompt.trim() || isGeneratingPreview}
                className="relative w-full flex items-center justify-center gap-3 px-5 py-4 rounded-xl bg-white/90 hover:bg-white text-black font-semibold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
              >
                <ImageIcon
                  width={80}
                  height={80}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-black/[0.07] pointer-events-none"
                />
                {isGeneratingPreview ? (
                  <>
                    <ReloadIcon width={18} height={18} className="animate-spin relative z-10" />
                    <span className="relative z-10">Generating Preview...</span>
                  </>
                ) : (
                  <>
                    <ImageIcon width={18} height={18} className="relative z-10" />
                    <span className="relative z-10 font-serif">Generate Preview</span>
                  </>
                )}
              </button>

              {(prompt || previewResult) && (
                <button
                  onClick={() => {
                    if (confirm("Clear everything and start over?")) {
                      handleClose();
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-black/40 hover:bg-black/60 text-white/60 hover:text-white text-sm transition-all"
                >
                  <Cross2Icon width={14} height={14} />
                  <span>Clear & Start Over</span>
                </button>
              )}

              <p className="text-white/40 text-xs text-center">
                Press ⌘ + Enter to generate
              </p>
            </>
          )}

          {(workflowStage === "preview" || workflowStage === "placing") && previewResult && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    Generated Views
                  </label>
                  <button
                    onClick={() => setIsExpandedView(true)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs transition-all border border-white/10"
                  >
                    <EnterFullScreenIcon className="w-3 h-3" />
                    Expand
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  {previewResult.image_urls.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSelectedImageIndex(i);
                        setIsExpandedView(true);
                      }}
                      className={`relative aspect-square rounded-lg overflow-hidden border transition-all hover:scale-[1.02] ${
                        selectedImageIndex === i
                          ? "border-white/40 ring-2 ring-white/20"
                          : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      <Image
                        src={url}
                        alt={`View ${i + 1}`}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                      <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white/70">
                        View {i + 1}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {previewResult.preview_3d_url && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                      <CubeIcon className="w-4 h-4" />
                      3D Preview
                      <span className="text-white/40 text-xs font-normal">(visualization only)</span>
                    </label>
                  </div>
                  <button
                    onClick={() => window.open(previewResult.preview_3d_url, '_blank')}
                    className="relative w-full aspect-video rounded-lg overflow-hidden border border-white/10 hover:border-white/30 transition-all hover:scale-[1.01]"
                  >
                    <Image
                      src={previewResult.preview_3d_url}
                      alt="3D Preview"
                      fill
                      unoptimized
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                      <span className="text-white/80 text-xs font-medium">3D Perspective Render</span>
                      <span className="px-2 py-0.5 rounded bg-white/20 text-white/70 text-[10px]">Click to expand</span>
                    </div>
                  </button>
                  <p className="text-white/40 text-xs text-center">
                    This is a preview of how your model might look. The actual 3D model is generated from the elevation views above.
                  </p>
                </div>
              )}

              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-white/50 text-xs line-clamp-2">
                  <span className="text-white/70 font-medium">Prompt: </span>
                  {previewResult.cleaned_prompt}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleRefinePrompt}
                  disabled={isPlacing}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-all border border-white/10 disabled:opacity-50"
                >
                  <Pencil1Icon width={14} height={14} />
                  <span>Refine</span>
                </button>
                
                <button
                  onClick={handleFinish}
                  disabled={isPlacing}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-white hover:bg-white/90 text-black text-sm font-semibold transition-all disabled:opacity-80"
                >
                  {isPlacing ? (
                    <>
                      <ReloadIcon width={14} height={14} className="animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <CubeIcon width={14} height={14} />
                      <span>Finish & Place</span>
                    </>
                  )}
                </button>
              </div>

              <p className="text-white/40 text-xs text-center">
                Click an image to expand • Click Finish when ready
              </p>
            </>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-2">
                <ExclamationTriangleIcon className="w-4 h-4 text-red-400" />
                <span className="text-red-400 text-sm">{error}</span>
                <button
                  onClick={() => setError(null)}
                  className="ml-auto text-xs text-red-300/50 hover:text-red-300"
                >
                  ×
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
