"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import getStarfield from "@/utils/getStarfield";    
import { latLongToVector3 } from "@/utils/coordinates";

interface Location {
  lat: number;
  long: number;
  label?: string;
  color?: string;
}

interface EarthSceneProps {
  markers?: Location[];
  currentSection?: number;
  onWaterlooScreenPosition?: (position: { x: number; y: number }) => void;
}

export default function EarthScene({ markers = [], currentSection = 0, onWaterlooScreenPosition }: EarthSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const targetPosition = useRef(new THREE.Vector3(7, 0, 4));
  const targetLookAt = useRef(new THREE.Vector3(-7.7, 0, 0));
  const currentSectionRef = useRef(currentSection);
  const targetRotationY = useRef(0);
  const targetRotationX = useRef(0);
  const targetRotationZ = useRef(0);
  const globeRef = useRef<THREE.Mesh | null>(null);
  const connectionLineRef = useRef<THREE.Line | null>(null);
  const waterlooScreenPos = useRef({ x: 0, y: 0 });
  const waterlooLabelRef = useRef<HTMLDivElement | null>(null);
  const mouseRef = useRef(new THREE.Vector2());
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const animationFrameRef = useRef<number | null>(null);


  // Add Waterloo as a default marker
  const defaultMarkers = [
    { lat: 43.4643, long: -80.5204, label: "Waterloo, Canada" },
  ];

  useEffect(() => {
    // Cleanup any existing renderer before initializing
    if (rendererRef.current) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      rendererRef.current.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    }

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(7, 0, 4); // Position camera to view globe
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;

    if (mountRef.current) {
      // Clear any existing canvas elements first
      const existingCanvas = mountRef.current.querySelector('canvas');
      if (existingCanvas) {
        mountRef.current.removeChild(existingCanvas);
      }
      mountRef.current.appendChild(renderer.domElement);
    }

    const orbitCtrl = new OrbitControls(camera, renderer.domElement);
    orbitCtrl.enableDamping = true;
    orbitCtrl.target.set(-7.7, 0, 0);

    orbitCtrl.enableZoom = false; // Disable zooming
    orbitCtrl.minDistance = 4; // Set minimum distance
    orbitCtrl.maxDistance = 4; // Set maximum distance to same as minimum to prevent zoom

    const raycaster = new THREE.Raycaster();
    const pointerPos = new THREE.Vector2();
    const globeUV = new THREE.Vector2();

    // Mouse tracking for emoji lookAt calculations
    const emojiRaycaster = new THREE.Raycaster();
    const targetPoint = new THREE.Vector3();

    // Store reference to emoji for mouse following
    let emojiModel: THREE.Group | null = null;
    let emojiHead: THREE.Object3D | null = null;

    // Mouse tracking variables for proper raycasting (like the working example)
    const intersectionPoint = new THREE.Vector3();
    const planeNormal = new THREE.Vector3();
    const plane = new THREE.Plane();
    const mousePosition = new THREE.Vector2();
    const headRaycaster = new THREE.Raycaster();

    const textureLoader = new THREE.TextureLoader();
    const starSprite = textureLoader.load("/circle.png");
    const otherMap = textureLoader.load("/texture3.jpg");
    const colorMap = textureLoader.load("/00_earthmap1k.jpg");
    const elevMap = textureLoader.load("/texture1.jpg");
    const alphaMap = textureLoader.load("/texture2.jpg");

    const globeGroup = new THREE.Group();
    globeGroup.position.x = -6;
    globeGroup.position.y = 0;
    globeGroup.position.z = -0.5;
    scene.add(globeGroup);

    const geo = new THREE.IcosahedronGeometry(1, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0099ff,
      wireframe: true,
      displacementMap: elevMap,
      displacementScale: 0.05,
      transparent: true,
      opacity: 0.8, // Increased from 0.4 to make it more visible
      metalness: 0.3,
      roughness: 0.7,
    });
    const globe = new THREE.Mesh(geo, mat);
    globeGroup.add(globe);

    console.log('Globe created and added to globeGroup at position:', globeGroup.position);

    // Load and add emoji 3D model in the center of the sphere
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      '/rainbolt.glb', // Your GLB file
      (gltf) => {
        console.log('GLB model loaded successfully:', gltf);
        emojiModel = gltf.scene; // Store reference globally

        // Position the emoji at the WORLD center, same as globe center
        // Globe is at globeGroup position (-6, 0, -0.5), so put emoji there too
        emojiModel.position.set(-5.8, 0, -0.5);

        // Make it MUCH bigger so we can definitely see it
        emojiModel.scale.set(0.3, 0.3, 0.3);

        // Store the original rotation to account for model facing -Y in Blender
        // Don't apply fixed rotation - let lookAt() handle full orientation
        emojiModel.rotation.set(0, 0, 0);

        // Enable rotation animation

        // Preserve original Blender materials - don't override them
        emojiModel.traverse((child) => {
          console.log('Traversing child:', child.name, child.type);
          if (child instanceof THREE.Mesh) {
            console.log('Found mesh child:', child.name, child);
            if (child.material) {
              // Keep original material properties from Blender
              child.material.transparent = false;
              child.material.opacity = 1.0;
              child.castShadow = true;
              child.receiveShadow = true;
              // DON'T override color or emissive - keep Blender materials!
            }
          }

          // Try to find head bone/object for mouse following
          if (child.name.toLowerCase().includes('head') ||
            child.name.toLowerCase().includes('face') ||
            child.name.toLowerCase().includes('skull')) {
            console.log('Found potential head object:', child.name);
            emojiHead = child;
          }
        });

        // If no specific head found, use the whole model
        if (!emojiHead) {
          console.log('No specific head found, using whole model');
          emojiHead = emojiModel;
        } else {
          console.log('Using head object:', emojiHead);
        }

        // Add bright point lights specifically for the emoji
        const emojiLight = new THREE.PointLight(0xffffff, 1, 100); // Increased intensity and range
        emojiLight.position.copy(emojiModel.position);
        emojiLight.position.y += 1; // Move light slightly above emoji
        scene.add(emojiLight);

        // Add a second fill light from the front
        const emojiFillLight = new THREE.PointLight(0xffffff, 15, 100);
        emojiFillLight.position.set(
          emojiModel.position.x + 2, // In front of emoji
          emojiModel.position.y,
          emojiModel.position.z + 2
        );
        scene.add(emojiFillLight);

        console.log('Adding emoji model to SCENE at position:', emojiModel.position);
        console.log('GlobeGroup position:', globeGroup.position);
        console.log('Emoji model scale:', emojiModel.scale);
        scene.add(emojiModel); // Add to scene, NOT globeGroup
      },
      (progress) => {
        console.log('Loading progress:', progress);
      },
      (error) => {
        console.error('Error loading GLB model:', error);
      }
    );

    // Add markers
    const markerGroup = new THREE.Group();
    defaultMarkers.forEach((marker) => {
      const [x, y, z] = latLongToVector3(marker.lat, marker.long, 1.02); // Slightly larger radius to place markers above surface

      const markerGeometry = new THREE.SphereGeometry(0.02, 16, 16);
      const markerMaterial = new THREE.MeshBasicMaterial({
        color: '#ff0000',
        transparent: true,
        opacity: 0.8,
      });

      const markerMesh = new THREE.Mesh(markerGeometry, markerMaterial);
      markerMesh.position.set(x, y, z);

      // Add glow effect to marker
      const markerGlowGeometry = new THREE.SphereGeometry(0.03, 16, 16);
      const markerGlowMaterial = new THREE.MeshBasicMaterial({
        color: '#ff0000',
        transparent: true,
        opacity: 0.3,
      });
      const markerGlow = new THREE.Mesh(markerGlowGeometry, markerGlowMaterial);
      markerMesh.add(markerGlow);

      markerGroup.add(markerMesh);
    });
    globeGroup.add(markerGroup);

    // Create connection line from Waterloo marker to UI badge (only visible in Team section)
    const [waterlooX, waterlooY, waterlooZ] = latLongToVector3(43.4643, -80.5204, 1.02);
    const waterlooWorldPos = new THREE.Vector3(waterlooX, waterlooY, waterlooZ);

    // Create line geometry - starts at Waterloo, extends toward screen right
    const lineGeometry = new THREE.BufferGeometry();
    const linePoints = [
      waterlooWorldPos,
      new THREE.Vector3(waterlooX + 2, waterlooY + 0.5, waterlooZ + 1) // Extend toward UI badge area
    ];
    lineGeometry.setFromPoints(linePoints);

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      linewidth: 2
    });

    const connectionLine = new THREE.Line(lineGeometry, lineMaterial);
    connectionLine.visible = false; // Initially hidden
    connectionLineRef.current = connectionLine;
    globeGroup.add(connectionLine);

    // Create Waterloo text label (visible on Team section)
    const waterlooLabel = document.createElement('div');
    waterlooLabel.className = 'waterloo-label';
    waterlooLabel.style.cssText = `
      position: fixed;
      background: rgba(0, 0, 0, 0.92);
      color: white;
      padding: 28px 32px;
      border-radius: 16px;
      font-family: Inter, system-ui, sans-serif;
      pointer-events: none;
      display: none;
      z-index: 100;
      min-width: 450px;
      max-width: 520px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(10px);
    `;
    waterlooLabel.innerHTML = `
      <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
        <div style="width: 56px; height: 56px; background: rgba(59, 130, 246, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgb(59, 130, 246)" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
        </div>
        <div>
          <div style="font-size: 26px; font-weight: 700; margin-bottom: 4px;">Waterloo, Canada</div>
          <div style="font-size: 14px; color: rgba(255, 255, 255, 0.6);">43.4643°N • -80.5204°W</div>
        </div>
      </div>
      <div style="font-size: 15px; line-height: 1.7; color: rgba(255, 255, 255, 0.85); margin-top: 16px;">
        Home to the University of Waterloo, one of Canada's leading tech universities. Known for its innovation ecosystem, startup culture, and producing top engineering talent. The birthplace of rainbolt.ai.
      </div>
      <div style="margin-top: 20px; border-radius: 10px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1);">
        <img 
          src="/uw-sign-dp-scaled.jpeg" 
          alt="University of Waterloo" 
          style="width: 100%; height: auto; display: block; object-fit: cover;"
        />
      </div>
    `;
    waterlooLabelRef.current = waterlooLabel;
    if (mountRef.current) {
      mountRef.current.appendChild(waterlooLabel);
    }

    // Add glow effect
    const glowVertexShader = `
      varying vec3 vNormal;
      varying vec3 vPositionNormal;
      
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPositionNormal = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const glowFragmentShader = `
      varying vec3 vNormal;
      varying vec3 vPositionNormal;
      
      void main() {
        float alignment = dot(vNormal, vPositionNormal);
// Flip it so edges are bright, center is dim
float intensity = 1.0 - smoothstep(0.0, 1.0, 1.0-abs(alignment));
intensity = pow(intensity, 1.5); // Reduced exponent for larger middle gradient
        
        vec3 glowColor = vec3(1.0, 0.1, 0.1);
        vec3 glow = glowColor * intensity * 3.0;
        
        gl_FragColor = vec4(glow, intensity * 0.5);
      }
    `;

    const glowMaterial = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: glowVertexShader,
      fragmentShader: glowFragmentShader,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false // Ensure proper transparency
    });

    const glowMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.08, 32), // Reduced size to be closer to globe
      glowMaterial
    );
    globeGroup.add(glowMesh);

    // Add flying streak particles (head/tail only, not full orbits)
    const streakParticles: Array<{
      head: THREE.Mesh;
      tail: THREE.Mesh[];
      angle: number;
      speed: number;
      radius: number;
      axis: THREE.Vector3;
    }> = [];

    function createStreakParticle(radius: number, color: number, speed: number, axis: THREE.Vector3) {
      // Head particle (bright)
      const headGeometry = new THREE.SphereGeometry(0.015, 8, 8); // Reduced from 0.02 to match tail size
      const headMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1.0,
      });
      const head = new THREE.Mesh(headGeometry, headMaterial);

      // Tail particles (fading)
      const tail: THREE.Mesh[] = [];
      const tailLength = 15; // Increased from 8 to make longerhead streaks

      for (let i = 0; i < tailLength; i++) {
        const tailGeometry = new THREE.SphereGeometry(0.015 - (i * 0.0003), 6, 6); // Smaller size reduction
        const opacity = 1.0 - (i / tailLength) * 0.9; // Fade from 1.0 to 0.1
        const tailMaterial = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
        });
        const tailSegment = new THREE.Mesh(tailGeometry, tailMaterial);
        tail.push(tailSegment);
        globeGroup.add(tailSegment);
      }

      globeGroup.add(head);

      return {
        head,
        tail,
        angle: Math.random() * Math.PI * 2,
        speed,
        radius,
        axis,
      };
    }

    // Create multiple streak particles
    streakParticles.push(
      createStreakParticle(1.3, 0xffffff, 0.02, new THREE.Vector3(0, 1, 0)), // Horizontal white
      createStreakParticle(1.4, 0xccddff, 0.015, new THREE.Vector3(1, 0.5, 0).normalize()), // Tilted blue
      createStreakParticle(1.5, 0xffccdd, 0.018, new THREE.Vector3(0.5, 0, 1).normalize()), // Tilted pink
      createStreakParticle(1.35, 0xddffcc, 0.012, new THREE.Vector3(1, 1, 0).normalize()), // Green (now positive speed)
    );

    // Create a second layer for interactive points
    const detail = 120;
    const pointsGeo = new THREE.IcosahedronGeometry(1.01, detail); // Slightly larger radius to avoid z-fighting

    // Shaders
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
  uniform sampler2D newTexture;


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
      size: { type: "f", value: 8.0 },
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
      depthTest: false,
    });

    const points = new THREE.Points(pointsGeo, pointsMat);
    globeGroup.add(points);

    // Enhanced lighting setup for better visibility
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x080820, 4);
    globeGroup.add(hemiLight);

    // Add a directional light to simulate sunlight
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(5, 3, 5);
    globeGroup.add(directionalLight);

    // Add ambient light for overall brightness
    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    globeGroup.add(ambientLight);

    // Add a point light for additional illumination
    const pointLight = new THREE.PointLight(0xffffff, 1, 10);
    pointLight.position.set(2, 2, 2);
    globeGroup.add(pointLight);

    const stars = getStarfield({ numStars: 4500, sprite: starSprite });
    scene.add(stars); // Stars stay in main scene

    function handleRaycast() {
      raycaster.setFromCamera(pointerPos, camera);
      const intersects = raycaster.intersectObjects([globe], false);
      if (intersects.length > 0 && intersects[0].uv) {
        globeUV.copy(intersects[0].uv);
        uniforms.mouseUV.value.copy(globeUV);
      }
    }

    function animate() {
      // Store animation frame ID for cleanup
      animationFrameRef.current = requestAnimationFrame(animate);

      // Smooth camera movement (synchronized slow transitions)
      if (cameraRef.current) {
        cameraRef.current.position.lerp(targetPosition.current, 0.009);

        // Smooth orbit controls target (same rate for consistency)
        orbitCtrl.target.lerp(targetLookAt.current, 0.009);
      }

      // Update emoji tracking continuously (even when mouse not moving)
      if (emojiModel) {
        // Cast ray from camera through mouse position
        emojiRaycaster.setFromCamera(mouseRef.current, camera);

        // Get cursor point in 3D space at distance 1 from camera
        const cursorPoint = new THREE.Vector3();
        emojiRaycaster.ray.at(1, cursorPoint); // 1 unit out from camera

        // Calculate direction from emoji to cursor point
        const direction = cursorPoint.clone().sub(emojiModel.position).normalize();

        // Create target point by moving from emoji position in direction of cursor
        const targetPoint = emojiModel.position.clone().add(direction);

        // Make emoji look at the target point (toward cursor)
        emojiModel.lookAt(targetPoint);
      }

      // Calculate screen coordinates for Waterloo marker (for Team section connection line)
      if (currentSectionRef.current === 3) {
        const [waterlooX, waterlooY, waterlooZ] = latLongToVector3(43.4643, -80.5204, 1.02);
        const waterlooWorldPos = new THREE.Vector3(waterlooX, waterlooY, waterlooZ);

        // Apply globe group transformations
        waterlooWorldPos.applyMatrix4(globeGroup.matrixWorld);

        // Project to screen coordinates
        const vector = waterlooWorldPos.clone().project(camera);

        // Convert to screen pixels
        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (vector.y * -0.5 + 0.5) * window.innerHeight;

        waterlooScreenPos.current = { x, y };

        // Update Waterloo label position
        if (waterlooLabelRef.current) {
          const isVisible = vector.z < 1; // Check if marker is in front of camera
          if (isVisible) {
            waterlooLabelRef.current.style.display = 'block';
            waterlooLabelRef.current.style.left = `${x + 100}px`; // Position to the right of marker
            waterlooLabelRef.current.style.top = `${y - 150}px`; // Position above the marker with more offset
            waterlooLabelRef.current.style.transform = 'translateX(0)'; // No horizontal centering
          } else {
            waterlooLabelRef.current.style.display = 'none';
          }
        }
      } else {
        // Hide label on other sections
        if (waterlooLabelRef.current) {
          waterlooLabelRef.current.style.display = 'none';
        }
      }

      renderer.render(scene, camera);

      // Handle rotation: either animate to target rotation (Team section) or continue normal rotation
      if (currentSectionRef.current === 3) {
        // Fast rotate to bring Waterloo to the front and tilt downwards
        globeGroup.rotation.y += (targetRotationY.current - globeGroup.rotation.y) * 0.09;
        globeGroup.rotation.x += (targetRotationX.current - globeGroup.rotation.x) * 0.09;
        globeGroup.rotation.z += (targetRotationZ.current - globeGroup.rotation.z) * 0.09;
      } else {
        // Normal continuous rotation for other sections
        globeGroup.rotation.y += 0.001;
        // Reset X and Z rotation for other sections
        globeGroup.rotation.x += (0 - globeGroup.rotation.x) * 0.03;
        globeGroup.rotation.z += (0 - globeGroup.rotation.z) * 0.03;
      }

      // Animate streak particles (head and tail movement)
      streakParticles.forEach((streak) => {
        // Update angle
        streak.angle += streak.speed;

        // Calculate new position around the orbit
        const basePos = new THREE.Vector3(
          Math.cos(streak.angle) * streak.radius,
          0,
          Math.sin(streak.angle) * streak.radius
        );

        // Apply axis rotation for different orbital planes
        basePos.applyAxisAngle(streak.axis, streak.angle * 0.5);

        // Position head
        streak.head.position.copy(basePos);

        // Position tail segments (follow behind head)
        streak.tail.forEach((tailSegment, i) => {
          const trailAngle = streak.angle - (i + 1) * 0.02; // Much closer spacing
          const trailPos = new THREE.Vector3(
            Math.cos(trailAngle) * streak.radius,
            0,
            Math.sin(trailAngle) * streak.radius
          );
          trailPos.applyAxisAngle(streak.axis, trailAngle * 0.5);
          tailSegment.position.copy(trailPos);
        });
      });

      handleRaycast();
      orbitCtrl.update();
    }
    animate();

    function onMouseMove(evt: MouseEvent) {
      pointerPos.set(
        (evt.clientX / window.innerWidth) * 2 - 1,
        -(evt.clientY / window.innerHeight) * 2 + 1
      );

      // Update mouse coordinates for emoji tracking
      mouseRef.current.x = (evt.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(evt.clientY / window.innerHeight) * 2 + 1;
    }

    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("resize", onResize);

    return () => {
      // Cancel animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);

      // Cleanup DOM elements
      if (mountRef.current) {
        if (renderer.domElement && mountRef.current.contains(renderer.domElement)) {
          mountRef.current.removeChild(renderer.domElement);
        }
        if (waterlooLabelRef.current && mountRef.current.contains(waterlooLabelRef.current)) {
          mountRef.current.removeChild(waterlooLabelRef.current);
        }
      }

      // Dispose Three.js resources
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  // Update camera position when section changes
  useEffect(() => {
    // Don't update if scene isn't initialized yet
    if (!cameraRef.current) return;

    // Define camera positions for each section
    const positions: Record<number, { position: [number, number, number]; lookAt: [number, number, number] }> = {
      0: { position: [7, 0, 4], lookAt: [-7.7, 0, 0] },        // Hero - default view
      1: { position: [6, -4, 2], lookAt: [-7.7, 1, -0.85] },      // Features - globe at bottom, camera lower
      2: { position: [12, 0, -24], lookAt: [-7.7, 0, 0] },       // About - globe on left, camera further away
      3: { position: [10, -3, 1], lookAt: [-7.7, 0, 10] },       // Team - camera lower to show Waterloo higher, zoom on Waterloo
      4: { position: [20, 15, 20], lookAt: [30, 20, 30] },       // Contact - moderate zoom showing stars with earth smaller
    };

    const config = positions[currentSection] || positions[0];

    // Special handling for Team section (3) - calculate Waterloo position for lookAt
    if (currentSection === 3) {
      // Calculate Waterloo's position on the globe (lat: 43.4643, long: -80.5204)
      const [waterlooX, waterlooY, waterlooZ] = latLongToVector3(43.4643, -80.5204, 1);
      // Offset from globe center (-7.7, 0, 0)
      const waterlooWorldX = waterlooX - 7.7;
      const waterlooWorldY = waterlooY;
      const waterlooWorldZ = waterlooZ;

      // Calculate rotation needed to bring Waterloo to the front
      // Waterloo longitude is -80.5204°, we need to rotate the globe to bring this longitude to the front
      // Adding extra rotation to account for globe's initial orientation
      const waterlooRotationY = (80.5204 + 160) * (Math.PI / 180);
      const waterlooRotationX = (90) * (Math.PI / 180); // Slight upward tilt (80 degrees)
      const waterlooRotationZ = (90) * (Math.PI / 180); // Slight Z-axis rotation (-20 degrees)

      targetRotationY.current = waterlooRotationY;
      targetRotationX.current = waterlooRotationX;
      targetRotationZ.current = waterlooRotationZ;

      // Show connection line for Team section
      if (connectionLineRef.current) {
        connectionLineRef.current.visible = true;
      }

      targetPosition.current.set(...config.position);
      targetLookAt.current.set(waterlooWorldX, waterlooWorldY, waterlooWorldZ);
    } else {
      // Reset rotation for other sections
      targetRotationY.current = 0;
      targetRotationX.current = 0;
      targetRotationZ.current = 0;

      // Hide connection line for other sections
      if (connectionLineRef.current) {
        connectionLineRef.current.visible = false;
      }

      targetPosition.current.set(...config.position);
      targetLookAt.current.set(...config.lookAt);
    }
  }, [currentSection]);

  // Update currentSection ref for use in animation loop
  useEffect(() => {
    currentSectionRef.current = currentSection;
  }, [currentSection]);

  // Separate effect for mouse tracking to ensure it persists
  useEffect(() => {
    function handleMouseMove(evt: MouseEvent) {
      mouseRef.current.x = (evt.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(evt.clientY / window.innerHeight) * 2 + 1;
    }

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []); // Empty dependency array ensures this runs once and persists

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} className="absolute inset-0" />;
}
