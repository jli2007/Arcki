"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CubeIcon } from "@radix-ui/react-icons";

// Shared renderer singleton - only one WebGL context for all thumbnails
let sharedRenderer: THREE.WebGLRenderer | null = null;
let sharedScene: THREE.Scene | null = null;
let sharedCamera: THREE.PerspectiveCamera | null = null;
let renderQueue: Array<() => void> = [];
let isProcessing = false;

function getSharedRenderer() {
  if (!sharedRenderer) {
    // Create offscreen canvas for shared renderer
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;

    sharedRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true, // Required for toDataURL
    });
    sharedRenderer.setPixelRatio(1);
    sharedRenderer.setClearColor(0x1f1f1f, 1);
    sharedRenderer.outputColorSpace = THREE.SRGBColorSpace;

    sharedScene = new THREE.Scene();
    sharedScene.background = new THREE.Color(0x1f1f1f);

    // Add lighting to shared scene
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    sharedScene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
    directionalLight.position.set(5, 10, 7.5);
    sharedScene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
    fillLight.position.set(-5, 5, -5);
    sharedScene.add(fillLight);

    sharedCamera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
  }

  return { renderer: sharedRenderer, scene: sharedScene!, camera: sharedCamera! };
}

function processQueue() {
  if (isProcessing || renderQueue.length === 0) return;

  isProcessing = true;
  const task = renderQueue.shift();
  if (task) {
    task();
  }
  isProcessing = false;

  // Process next item in queue
  if (renderQueue.length > 0) {
    requestAnimationFrame(processQueue);
  }
}

function queueRender(task: () => void) {
  renderQueue.push(task);
  if (!isProcessing) {
    requestAnimationFrame(processQueue);
  }
}

interface ModelThumbnailProps {
  glbUrl: string;
  size?: number;
  className?: string;
}

export function ModelThumbnail({ glbUrl, size = 64, className = "" }: ModelThumbnailProps) {
  const [imageData, setImageData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let disposed = false;

    const loader = new GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        if (disposed) return;

        // Queue the render task
        queueRender(() => {
          if (disposed) return;

          const { renderer, scene, camera } = getSharedRenderer();

          // Clear previous model from scene (keep lights)
          const toRemove: THREE.Object3D[] = [];
          scene.traverse((obj) => {
            if (obj.type === "Group" || obj.type === "Mesh") {
              toRemove.push(obj);
            }
          });
          toRemove.forEach((obj) => {
            if (obj.parent === scene) {
              scene.remove(obj);
            }
          });

          const model = gltf.scene.clone();
          scene.add(model);

          // Center and fit model in view
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          const boxSize = box.getSize(new THREE.Vector3());

          model.position.sub(center);

          const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z);
          if (maxDim === 0) {
            if (!disposed) {
              setHasError(true);
              setIsLoading(false);
            }
            scene.remove(model);
            return;
          }

          const fov = camera.fov * (Math.PI / 180);
          let cameraDistance = maxDim / (2 * Math.tan(fov / 2));
          cameraDistance *= 2.0;

          camera.position.set(
            cameraDistance * 0.7,
            cameraDistance * 0.5,
            cameraDistance * 0.7
          );
          camera.lookAt(0, 0, 0);

          // Set render size
          renderer.setSize(size, size);

          // Render and capture
          renderer.render(scene, camera);
          const dataUrl = renderer.domElement.toDataURL("image/png");

          // Remove model from scene
          scene.remove(model);

          // Dispose model resources
          model.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              obj.geometry?.dispose();
              if (Array.isArray(obj.material)) {
                obj.material.forEach((m) => m.dispose());
              } else if (obj.material) {
                obj.material.dispose();
              }
            }
          });

          if (!disposed) {
            setImageData(dataUrl);
            setIsLoading(false);
          }
        });
      },
      undefined,
      (error) => {
        if (disposed) return;
        console.error("Failed to load model for thumbnail:", error);
        setHasError(true);
        setIsLoading(false);
      }
    );

    // Cleanup: remove from queue if unmounted before processing
    return () => {
      disposed = true;
    };
  }, [glbUrl, size]);

  if (hasError) {
    return (
      <div
        className={`flex items-center justify-center bg-[#1f1f1f] ${className}`}
        style={{ width: size, height: size }}
      >
        <CubeIcon className="text-white/30" width={size * 0.4} height={size * 0.4} />
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {imageData ? (
        <img
          src={imageData}
          alt="Model thumbnail"
          width={size}
          height={size}
          style={{ width: size, height: size, display: "block" }}
        />
      ) : null}
      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-[#1f1f1f]"
          style={{ width: size, height: size }}
        >
          <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
