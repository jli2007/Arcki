"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import getStarfield from "@/utils/getStarfield";
import { latLongToVector3 } from "@/utils/coordinates";

interface Location {
  lat: number;
  long: number;
  label?: string;
  color?: string;
  confidence?: number; // 0-100 confidence score
}

interface SimpleGlobeProps {
  markers?: Location[];
  targetMarkerIndex?: number; // Index of marker to center on
  isLocked?: boolean; // Whether globe is locked to marker or free to rotate
  onUnlock?: () => void; // Callback when user clicks globe to unlock
  onLock?: () => void; // Callback when user clicks marker to lock
  onMarkerClick?: (index: number) => void; // Callback when marker is clicked
}

export default function SimpleGlobe({ markers = [], targetMarkerIndex = 0, isLocked = true, onUnlock, onLock, onMarkerClick }: SimpleGlobeProps) {
  // Camera zoom constants
  const ZOOM_OUT = 4.5; // Unlocked/zoomed out state
  const ZOOM_IN = 2.5; // Locked/zoomed in state
  
  // Helper function to convert confidence (0-100) to color gradient from blue to green
  const getConfidenceColor = (confidence: number = 50): string => {
    // Clamp confidence between 0 and 100
    const conf = Math.max(0, Math.min(100, confidence));
    
    // Normalize to 0-1 range for smooth interpolation
    const t = conf / 100;
    
    // Smooth gradient from blue to green
    // Blue at 0%: rgb(50, 100, 255)
    // Cyan at 50%: rgb(0, 200, 200)
    // Green at 100%: rgb(50, 255, 100)
    
    const startColor = { r: 50, g: 100, b: 255 };  // Blue
    const midColor = { r: 0, g: 200, b: 200 };     // Cyan
    const endColor = { r: 50, g: 255, b: 100 };    // Green
    
    let r, g, b;
    
    if (t < 0.5) {
      // Interpolate between start (blue) and mid (cyan)
      const localT = t * 2; // Map 0-0.5 to 0-1
      r = Math.round(startColor.r + (midColor.r - startColor.r) * localT);
      g = Math.round(startColor.g + (midColor.g - startColor.g) * localT);
      b = Math.round(startColor.b + (midColor.b - startColor.b) * localT);
    } else {
      // Interpolate between mid (cyan) and end (green)
      const localT = (t - 0.5) * 2; // Map 0.5-1 to 0-1
      r = Math.round(midColor.r + (endColor.r - midColor.r) * localT);
      g = Math.round(midColor.g + (endColor.g - midColor.g) * localT);
      b = Math.round(midColor.b + (endColor.b - midColor.b) * localT);
    }
    
    return `rgb(${r}, ${g}, ${b})`;
  };
  
  const mountRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<{
    targetRotationY: number;
    targetRotationX: number;
    isAnimating: boolean;
    targetCameraZ: number;
  }>({ targetRotationY: 0, targetRotationX: 0, isAnimating: false, targetCameraZ: ZOOM_OUT });
  
  // Store isLocked in a ref so the animate function can access current value
  const isLockedRef = useRef(isLocked);
  
  // Store refs to avoid recreating Three.js scene
  const sceneRef = useRef<{
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    renderer: THREE.WebGLRenderer | null;
    globeYRotationGroup: THREE.Group | null;
    globeXRotationGroup: THREE.Group | null;
    markerGroup: THREE.Group | null;
    markerMeshes: THREE.Mesh[];
  }>({ scene: null, camera: null, renderer: null, globeYRotationGroup: null, globeXRotationGroup: null, markerGroup: null, markerMeshes: [] });

  // Keep isLockedRef in sync with isLocked prop
  useEffect(() => {
    isLockedRef.current = isLocked;
    if (!isLocked) {
      // Stop any ongoing animation when unlocked
      animationRef.current.isAnimating = false;
      // Zoom out when unlocking
      animationRef.current.targetCameraZ = ZOOM_OUT;
    } else {
      // Zoom in when locking
      animationRef.current.targetCameraZ = ZOOM_IN;
    }
  }, [isLocked, ZOOM_OUT, ZOOM_IN]);

  // Effect for handling target marker changes without recreating scene
  useEffect(() => {
    if (!isLocked || !sceneRef.current.globeYRotationGroup) return;
    
    function rotateToMarker(markerIndex: number) {
      if (markerIndex < 0 || markerIndex >= markers.length) return;
      
      const marker = markers[markerIndex];
      
      // Convert lat/long to rotation angles with 80 degree Y offset
      const offsetDegreesY = 80;
      const targetY = -(marker.long * Math.PI / 180) + (offsetDegreesY * Math.PI / 180);

      const targetX = (marker.lat * Math.PI / 180);

      animationRef.current.targetRotationY = targetY;
      animationRef.current.targetRotationX = targetX;
      animationRef.current.isAnimating = true;
    }

    if (markers.length > 0 && targetMarkerIndex >= 0 && targetMarkerIndex < markers.length) {
      rotateToMarker(targetMarkerIndex);
    }
  }, [targetMarkerIndex, isLocked, markers.length]); // Only depend on index and length, not the array itself

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 4.5); // Position camera to center the globe

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "default" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for performance
    
    // Style the canvas to cover full screen
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    
    mountRef.current.appendChild(renderer.domElement);

    // Manual rotation variables
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    const rotationSpeed = 0.005;

    const raycaster = new THREE.Raycaster();
    const pointerPos = new THREE.Vector2();
    const globeUV = new THREE.Vector2();

    const textureLoader = new THREE.TextureLoader();
    const starSprite = textureLoader.load("/circle.png");
    const otherMap = textureLoader.load("/texture3.jpg");
    const colorMap = textureLoader.load("/00_earthmap1k.jpg");
    const elevMap = textureLoader.load("/texture1.jpg");
    const alphaMap = textureLoader.load("/texture2.jpg");

    // Create separate groups for horizontal and vertical rotation
    const globeYRotationGroup = new THREE.Group(); // Horizontal rotation (always around world Y-axis)
    const globeXRotationGroup = new THREE.Group(); // Vertical tilt (child of Y rotation)
    
    globeYRotationGroup.position.set(0, 0, 0);
    scene.add(globeYRotationGroup);
    globeYRotationGroup.add(globeXRotationGroup);
    
    camera.lookAt(0, 0, 0);

    // Simple globe geometry and material - optimized
    const geo = new THREE.IcosahedronGeometry(1, 12); // Reduced from 16 to 12
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0099ff,
      wireframe: true,
      displacementMap: elevMap,
      displacementScale: 0.04, // Reduced slightly
      transparent: true,
      opacity: 0.8,
      metalness: 0.3,
      roughness: 0.7,
    });
    const globe = new THREE.Mesh(geo, mat);
    globeXRotationGroup.add(globe);

    // Create interactive points layer - optimized
    const detail = 50; // Reduced from 80 for better performance
    const pointsGeo = new THREE.IcosahedronGeometry(1.01, detail); // Slightly larger radius to avoid z-fighting

    // Shaders for interactive points
    const vertexShader = `
      uniform float size;
      uniform sampler2D elevTexture;
      uniform vec2 mouseUV;

      varying vec2 vUv;
      varying float vVisible;
      varying float vDist;

      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        float elv = texture2D(elevTexture, vUv).r;
        vec3 vNormal = normalMatrix * normal;
        vVisible = step(0.0, dot( -normalize(mvPosition.xyz), normalize(vNormal)));
        mvPosition.z += 0.35 * elv;

        float dist = distance(mouseUV, vUv);
        float zDisp = 0.0;
        float thresh = 0.03;
        if (dist < thresh) {
          zDisp = (thresh - dist) * 4.0;
        }
        vDist = dist;
        mvPosition.z += zDisp;

        gl_PointSize = size;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      uniform sampler2D colorTexture;
      uniform sampler2D alphaTexture;
      uniform sampler2D otherTexture;

      varying vec2 vUv;
      varying float vVisible;
      varying float vDist;

      void main() {
        if (floor(vVisible + 0.1) == 0.0) discard;
        float alpha = (1.0 - texture2D(alphaTexture, vUv).r) * 0.6;
        vec3 color = texture2D(otherTexture, vUv).rgb;
        vec3 other = texture2D(colorTexture, vUv).rgb;
        float thresh = 0.03;
        if (vDist < thresh) {
          color = mix(color, other, (thresh - vDist) * 30.0);
        }
        gl_FragColor = vec4(color, alpha);
      }
    `;

    const uniforms = {
      size: { type: "f", value: 5.0 }, // Reduced point size for performance
      colorTexture: { type: "t", value: colorMap },
      otherTexture: { type: "t", value: otherMap },
      elevTexture: { type: "t", value: elevMap },
      alphaTexture: { type: "t", value: alphaMap },
      mouseUV: { type: "v2", value: new THREE.Vector2(0.0, 0.0) },
    };

    const pointsMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending, // Optimize blending
    });

    const points = new THREE.Points(pointsGeo, pointsMat);
    globeXRotationGroup.add(points);

    // Create marker group (will be populated dynamically)
    const markerGroup = new THREE.Group();
    globeXRotationGroup.add(markerGroup);
    
    // Store refs for use in other effects (after markerGroup is created)
    sceneRef.current = { scene, camera, renderer, globeYRotationGroup, globeXRotationGroup, markerGroup, markerMeshes: [] };
    
    let hoveredMarker: THREE.Mesh | null = null;

    // Basic lighting setup
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x080820, 2);
    scene.add(hemiLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);

    const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
    scene.add(ambientLight);

    // Add stars background
    const stars = getStarfield({ numStars: 1500, sprite: starSprite }); // Reduced for performance
    scene.add(stars);


    let frameCount = 0;
    function handleRaycast() {
      raycaster.setFromCamera(pointerPos, camera);
      // Update world matrix to account for rotations
      globe.updateMatrixWorld(true);
      const intersects = raycaster.intersectObject(globe, false);
      if (intersects.length > 0 && intersects[0].uv) {
        globeUV.copy(intersects[0].uv);
        uniforms.mouseUV.value.copy(globeUV);
      }
      
      // Check for marker hover
      if (sceneRef.current.markerMeshes.length > 0) {
        const markerIntersects = raycaster.intersectObjects(sceneRef.current.markerMeshes, false);
        
        // Get the parent group of the intersected mesh (the pin group)
        let hoveredPinGroup: THREE.Object3D | null = null;
        if (markerIntersects.length > 0) {
          let obj = markerIntersects[0].object;
          while (obj.parent && obj.parent !== sceneRef.current.markerGroup) {
            obj = obj.parent;
          }
          hoveredPinGroup = obj;
        }
        
        // Reset previous hovered marker
        if (hoveredMarker && hoveredMarker !== hoveredPinGroup) {
          hoveredMarker.scale.setScalar(1);
          hoveredMarker = null;
          if (mountRef.current) {
            mountRef.current.style.cursor = 'grab';
          }
        }
        
        // Set new hovered marker
        if (hoveredPinGroup && hoveredPinGroup !== hoveredMarker) {
          hoveredMarker = hoveredPinGroup as THREE.Mesh;
          hoveredMarker.scale.setScalar(1.2);
          if (mountRef.current) {
            mountRef.current.style.cursor = 'pointer';
          }
        }
      }
    }

    function animate() {
      frameCount++;
      
      // Only run raycast every 3 frames for better performance
      if (frameCount % 3 === 0) {
        handleRaycast();
      }
      
      // Passive rotation of stars
      stars.rotation.y += 0.0002;
      stars.rotation.x += 0.0001;
      
      // Handle camera zoom animation
      const zoomLerpFactor = 0.06;
      const cameraDeltaZ = animationRef.current.targetCameraZ - camera.position.z;
      if (Math.abs(cameraDeltaZ) > 0.01) {
        camera.position.z += cameraDeltaZ * zoomLerpFactor;
      }
      
      // Handle smooth rotation animation to target (only when locked)
      if (isLockedRef.current && animationRef.current.isAnimating && !isDragging) {
        const lerpFactor = 0.05; // Smoothness of animation (lower = smoother but slower)
        
        // Smoothly interpolate towards target rotation
        const deltaY = animationRef.current.targetRotationY - globeYRotationGroup.rotation.y;
        const deltaX = animationRef.current.targetRotationX - globeYRotationGroup.rotation.x;
        
        // Rotate the globe
        globeYRotationGroup.rotation.y += deltaY * lerpFactor;
        globeYRotationGroup.rotation.x += deltaX * lerpFactor;
        
        // Stop animating when rotation is complete
        if (Math.abs(deltaY) < 0.001 && Math.abs(deltaX) < 0.001) {
          animationRef.current.isAnimating = false;
        }
      } else if (!isLockedRef.current && !isDragging && !animationRef.current.isAnimating) {
        // Passive rotation of globe (only when unlocked, not dragging, and not animating)
        globeYRotationGroup.rotation.y += 0.001;
      }
      
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    animate();

    function onMouseMove(evt: MouseEvent) {
      // Get mouse position relative to the canvas
      const rect = renderer.domElement.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const y = evt.clientY - rect.top;
      
      pointerPos.set(
        (x / rect.width) * 2 - 1,
        -(y / rect.height) * 2 + 1
      );

      if (isDragging) {
        const deltaX = evt.clientX - previousMousePosition.x;
        const deltaY = evt.clientY - previousMousePosition.y;

        // Horizontal rotation - always around world Y-axis
        globeYRotationGroup.rotation.y += deltaX * rotationSpeed;
        globeYRotationGroup.rotation.x += deltaY * rotationSpeed;

        previousMousePosition = { x: evt.clientX, y: evt.clientY };
      }
    }

    function onMouseDown(evt: MouseEvent) {
      // Check if clicking on a marker
      if (hoveredMarker) {
        const markerData = hoveredMarker.userData.markerData;
        const markerIndex = hoveredMarker.userData.markerIndex;
        console.log('Marker clicked:', markerData);
        
        // Lock to this marker and notify parent
        if (onLock) {
          onLock();
        }
        if (onMarkerClick) {
          onMarkerClick(markerIndex);
        }
        
        return; // Don't start dragging if clicking a marker
      }
      
      // If clicking on globe (not marker) and currently locked, unlock it
      if (isLockedRef.current && onUnlock) {
        onUnlock();
      }
      
      isDragging = true;
      previousMousePosition = { x: evt.clientX, y: evt.clientY };
    }

    function onMouseUp() {
      isDragging = false;
    }

    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // Set initial cursor
    if (mountRef.current) {
      mountRef.current.style.cursor = 'grab';
    }
    
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("resize", onResize);

    // Initial rotation to first marker if locked
    if (isLocked && markers.length > 0 && targetMarkerIndex >= 0 && targetMarkerIndex < markers.length) {
      const marker = markers[targetMarkerIndex];
      const offsetDegrees = 80;
      const targetY = -(marker.long * Math.PI / 180) + (offsetDegrees * Math.PI / 180);
      const targetX = (marker.lat * Math.PI / 180);
      
      animationRef.current.targetRotationY = targetY;
      animationRef.current.targetRotationX = targetX;
      animationRef.current.isAnimating = true;
      animationRef.current.targetCameraZ = ZOOM_IN; // Zoom in for locked state
    } else if (!isLocked) {
      animationRef.current.targetCameraZ = ZOOM_OUT; // Stay zoomed out for unlocked state
    }

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("resize", onResize);
      
      const mount = mountRef.current;
      if (mount && mount.contains(renderer.domElement)) {
        mount.style.cursor = 'default';
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
      
      // Clear refs
      sceneRef.current = { scene: null, camera: null, renderer: null, globeYRotationGroup: null, globeXRotationGroup: null, markerGroup: null, markerMeshes: [] };
    };
  }, []); // Only create scene once on mount

  // Effect to update markers when they change
  useEffect(() => {
    if (!sceneRef.current.markerGroup) return;

    const markerGroup = sceneRef.current.markerGroup;
    
    // Clear existing markers
    while (markerGroup.children.length > 0) {
      const child = markerGroup.children[0];
      markerGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => mat.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
    sceneRef.current.markerMeshes = [];

    // Add new markers
    if (markers.length > 0) {
      // Create a pin shape using a group of geometries
      // confidence: 0-100, scales pin height from 0.5x to 2x base height
      const createPinGeometry = (confidence: number = 50) => {
        const pinGroup = new THREE.Group();
        
        // Scale factor based on confidence (0-100)
        // Map: 0% confidence -> 0.5x height, 50% -> 1x height, 100% -> 2x height
        const heightScale = 0.5 + (confidence / 100) * 1.5;
        
        // Base dimensions (30% smaller)
        const baseHeadSize = 0.0175;
        const baseStemHeight = 0.028;
        const stemRadius = 0.0042;
        
        // Scaled dimensions
        const scaledHeadSize = baseHeadSize * heightScale;
        const scaledStemHeight = baseStemHeight * heightScale;
        
        // Pin head (teardrop shape)
        const headGeometry = new THREE.SphereGeometry(scaledHeadSize, 8, 8);
        const head = new THREE.Mesh(headGeometry);
        head.scale.set(1, 1.3, 1); // Elongate slightly
        head.position.set(0, scaledStemHeight / 2 + scaledHeadSize * 0.7, 0);
        
        // Pin stem
        const stemGeometry = new THREE.CylinderGeometry(stemRadius, stemRadius, scaledStemHeight, 6);
        const stem = new THREE.Mesh(stemGeometry);
        stem.position.set(0, 0, 0);
        
        pinGroup.add(head);
        pinGroup.add(stem);
        
        return pinGroup;
      };
      
      markers.forEach((marker, index) => {
        const [x, y, z] = latLongToVector3(marker.lat, marker.long, 1.02);
        
        // Use red for the locked/target marker, blue-to-green gradient for others
        const isTargetMarker = isLocked && index === targetMarkerIndex;
        const markerColor = isTargetMarker 
          ? '#ff0000' // Red for locked/selected marker
          : (marker.color || getConfidenceColor(marker.confidence || 50)); // Use confidence gradient (blue to green)
        
        const markerMaterial = new THREE.MeshStandardMaterial({
          color: markerColor,
          transparent: true,
          opacity: 0.9,
          metalness: 0.3,
          roughness: 0.4,
        });
        
        // Create pin group with height based on confidence
        const pinGroup = createPinGeometry(marker.confidence || 50);
        
        // Apply material to all meshes in the pin
        pinGroup.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = markerMaterial;
          }
        });
        
        // Position the pin
        pinGroup.position.set(x, y, z);
        
        // Orient the pin to point outward from the globe center
        const direction = new THREE.Vector3(x, y, z).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(up, direction);
        pinGroup.setRotationFromQuaternion(quaternion);
        
        pinGroup.userData = { markerIndex: index, markerData: marker, originalScale: 1 };

        markerGroup.add(pinGroup);
        
        // Store all meshes in the pin for raycasting
        pinGroup.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.userData = pinGroup.userData;
            sceneRef.current.markerMeshes.push(child);
          }
        });
      });
    }
  }, [markers, targetMarkerIndex, isLocked]);

  return <div ref={mountRef} style={{ width: "100vw", height: "100vh", position: "fixed", top: 0, left: 0 }} />;
}