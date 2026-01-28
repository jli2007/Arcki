"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const vertexShader = `
  uniform sampler2D bumpTexture;
  uniform float bumpScale;

  varying vec2 vUv;
  varying float vDisplacement;

  void main() {
    vUv = uv;

    // For a sphere, normal is just the normalized position (direction from center)
    vec3 sphereNormal = normalize(position);

    // Sample bump map for elevation
    vec4 bumpData = texture2D(bumpTexture, uv);
    vDisplacement = bumpData.r;

    // Calculate displacement from bump map
    float displacement = bumpData.r * bumpScale;

    // Apply displacement along sphere normal
    vec3 newPosition = position + sphereNormal * displacement;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
    gl_PointSize = 2.5;
  }
`;

const fragmentShader = `
  uniform sampler2D rainbowTexture;
  uniform sampler2D specTexture;

  varying vec2 vUv;
  varying float vDisplacement;

  void main() {
    // Sample textures
    vec4 rainbow = texture2D(rainbowTexture, vUv);
    vec4 spec = texture2D(specTexture, vUv);

    // spec.r: 0 = land (black), 1 = ocean (white)
    float isLand = 1.0 - spec.r;

    // Land gets rainbow color, ocean is very dim
    vec3 landColor = rainbow.rgb * (0.8 + vDisplacement * 0.4);
    vec3 oceanColor = vec3(0.1, 0.15, 0.2);

    vec3 finalColor = mix(oceanColor, landColor, isLand);
    float alpha = mix(0.3, 1.0, isLand);

    // Circular point shape
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    if (dist > 0.5) discard;

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

export default function LandingGlobe() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    // Adjust camera distance based on screen width for mobile compatibility
    const getCameraZ = () => {
      const width = window.innerWidth;
      if (width < 400) return 9.0;  // Small mobile - zoom out significantly
      if (width < 480) return 8.0;  // Mobile
      if (width < 768) return 7.0;  // Larger mobile/small tablet
      if (width < 1024) return 5.5; // Tablet
      return 4.5;                   // Desktop
    };

    camera.position.set(0, 0.3, getCameraZ());

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 1);

    mountRef.current.appendChild(renderer.domElement);

    // Mouse tracking for drag rotation
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    const rotationSpeed = 0.005;

    // Load textures
    const textureLoader = new THREE.TextureLoader();
    const bumpTexture = textureLoader.load("/texture1.jpg");
    const specTexture = textureLoader.load("/texture2.jpg");
    const rainbowTexture = textureLoader.load("/texture3.jpg");

    // Globe group for rotation - shifted down to show whole globe
    const globeGroup = new THREE.Group();
    globeGroup.position.set(0, -0.4, 0);
    scene.add(globeGroup);

    camera.lookAt(0, -0.3, 0);

    const radius = 1.3;
    const scale = 1.4;

    // Create wireframe base (very transparent)
    const wireGeo = new THREE.IcosahedronGeometry(radius, 16);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x3366ff,
      wireframe: true,
      transparent: true,
      opacity: 0.03,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    wireMesh.scale.set(scale, scale, scale);
    globeGroup.add(wireMesh);

    // Create points sphere with shader material
    const pointsGeo = new THREE.IcosahedronGeometry(radius, 120);

    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        rainbowTexture: { value: rainbowTexture },
        bumpTexture: { value: bumpTexture },
        specTexture: { value: specTexture },
        bumpScale: { value: 0.04 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
    });

    const pointsMesh = new THREE.Points(pointsGeo, shaderMaterial);
    pointsMesh.scale.set(scale, scale, scale);
    globeGroup.add(pointsMesh);

    function animate() {
      // Passive rotation when not dragging
      if (!isDragging) {
        globeGroup.rotation.y += 0.0012;
      }

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    animate();

    function onMouseMove(evt: MouseEvent) {
      // Handle drag rotation
      if (isDragging) {
        const deltaX = evt.clientX - previousMousePosition.x;
        const deltaY = evt.clientY - previousMousePosition.y;

        globeGroup.rotation.y += deltaX * rotationSpeed;
        globeGroup.rotation.x += deltaY * rotationSpeed;

        previousMousePosition = { x: evt.clientX, y: evt.clientY };
      }
    }

    function onMouseDown(evt: MouseEvent) {
      isDragging = true;
      previousMousePosition = { x: evt.clientX, y: evt.clientY };
      if (mountRef.current) {
        mountRef.current.style.cursor = "grabbing";
      }
    }

    function onMouseUp() {
      isDragging = false;
      if (mountRef.current) {
        mountRef.current.style.cursor = "grab";
      }
    }

    // Touch event handlers for mobile
    function onTouchStart(evt: TouchEvent) {
      if (evt.touches.length === 1) {
        isDragging = true;
        previousMousePosition = { x: evt.touches[0].clientX, y: evt.touches[0].clientY };
      }
    }

    function onTouchMove(evt: TouchEvent) {
      if (isDragging && evt.touches.length === 1) {
        const deltaX = evt.touches[0].clientX - previousMousePosition.x;
        const deltaY = evt.touches[0].clientY - previousMousePosition.y;

        globeGroup.rotation.y += deltaX * rotationSpeed;
        globeGroup.rotation.x += deltaY * rotationSpeed;

        previousMousePosition = { x: evt.touches[0].clientX, y: evt.touches[0].clientY };
      }
    }

    function onTouchEnd() {
      isDragging = false;
    }

    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.position.z = getCameraZ();
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    if (mountRef.current) {
      mountRef.current.style.cursor = "grab";
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchstart", onTouchStart);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("resize", onResize);

      const mount = mountRef.current;
      if (mount && mount.contains(renderer.domElement)) {
        mount.style.cursor = "default";
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
      }}
    />
  );
}
