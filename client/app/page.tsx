"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import { motion, useScroll, useTransform } from "motion/react";
import * as Accordion from "@radix-ui/react-accordion";
import {
  Globe,
  Layers,
  Box,
  MousePointer2,
  FolderOpen,
  ArrowRight,
  ChevronDown,
  Map,
  Wand2,
  Play,
} from "lucide-react";

const LandingGlobe = dynamic(() => import("@/components/LandingGlobe"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-black" />,
});

const fadeInUp = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-100px" },
  transition: { duration: 0.6, ease: [0, 0, 0.2, 1] as const },
};

const staggerContainer = {
  initial: {},
  whileInView: {
    transition: {
      staggerChildren: 0.1,
    },
  },
  viewport: { once: true },
};

const features = [
  {
    icon: Globe,
    title: "Global Coverage",
    description:
      "Access detailed 3D maps of any location worldwide.",
  },
  {
    icon: Layers,
    title: "Layer Management",
    description:
      "Organize your designs with powerful layer controls. Toggle visibility, lock elements, group objects.",
  },
  {
    icon: Box,
    title: "3D Generation",
    description:
      "Transform text into detailed 3D models in seconds.",
  },
  {
    icon: MousePointer2,
    title: "Intuitive Controls",
    description:
      "Drag, drop, rotate, and scale with natural gestures. No learning curve required.",
  },
  {
    icon: FolderOpen,
    title: "Asset Library",
    description:
      "Thousands of pre-built models. Import your own 3D assets.",
  },
  {
    icon: Wand2,
    title: "AI-Powered",
    description:
      "Let AI do literally do anything.",
  },
];

const steps = [
  {
    number: "01",
    title: "Choose a Location",
    description:
      "Search any address. Our platform loads the 3D terrain and existing structures automatically.",
  },
  {
    number: "02",
    title: "Generate and Import Anything",
    description:
      "Create your own 3D models with text prompts or import your own 3D models.",
  },
  {
    number: "03",
    title: "Design to Your Upmost Creativity",
    description:
      "Delete existing buildings, replacing it with your own vision.",
  },
];

const faqs = [
  {
    question: "What file formats can I export?",
    answer:
      "You can export your projects as high-resolution images (PNG, JPG), 3D models (GLTF, OBJ, FBX), or interactive web embeds. We also support direct integration with popular CAD software.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes! Start with our free tier which includes basic editing tools and limited exports. Upgrade anytime to unlock advanced features, higher resolution exports, and collaboration tools.",
  },
  {
    question: "Can I import my own 3D models?",
    answer:
      "Absolutely. We support GLTF, GLB, OBJ, and FBX formats. Simply drag and drop your models into the editor, and they'll be automatically optimized for web performance.",
  },
  {
    question: "How accurate is the terrain data?",
    answer:
      "Our terrain data comes from high-resolution satellite imagery and LIDAR scans where available. Urban areas typically have sub-meter accuracy, while rural areas vary by region.",
  },
];

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  // Interpolate globe position based on scroll - organic, less predictable movement
  const globeY = useTransform(scrollYProgress, [0, 0.3, 0.6, 1], ["0%", "10%", "5%", "15%"]);
  const globeX = useTransform(scrollYProgress, [0, 0.25, 0.5, 0.75, 1], ["0%", "40%", "-35%", "45%", "-20%"]);
  const globeScale = useTransform(scrollYProgress, [0, 0.4, 0.7, 1], [1, 1.05, 0.95, 1.02]);
  const globeOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [1, 0.85, 0.7]);

  // Stars parallax - organic, non-linear movement
  const starsY = useTransform(scrollYProgress, [0, 0.2, 0.4, 0.6, 0.8, 1], ["0%", "8%", "5%", "18%", "12%", "25%"]);
  const starsX = useTransform(scrollYProgress, [0, 0.15, 0.35, 0.55, 0.75, 1], ["0%", "-3%", "5%", "-8%", "2%", "-12%"]);

  // Second layer moves differently for depth
  const stars2Y = useTransform(scrollYProgress, [0, 0.25, 0.5, 0.75, 1], ["0%", "-5%", "10%", "3%", "20%"]);
  const stars2X = useTransform(scrollYProgress, [0, 0.3, 0.6, 1], ["0%", "6%", "-4%", "8%"]);

  return (
    <div ref={containerRef} className="bg-black text-white relative">
      {/* Stars layer 1 - slower pulse */}
      <motion.div
        className="fixed inset-0 pointer-events-none z-[2]"
        style={{ y: starsY, x: starsX }}
        animate={{ opacity: [0.6, 0.45, 0.6] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(2.5px 2.5px at 3% 8%, rgba(255,255,255,0.7), transparent),
              radial-gradient(2px 2px at 12% 22%, rgba(255,255,255,0.6), transparent),
              radial-gradient(2.5px 2.5px at 7% 48%, rgba(255,255,255,0.7), transparent),
              radial-gradient(2px 2px at 18% 72%, rgba(255,255,255,0.55), transparent),
              radial-gradient(2.5px 2.5px at 5% 91%, rgba(255,255,255,0.7), transparent),
              radial-gradient(2px 2px at 28% 5%, rgba(255,255,255,0.6), transparent),
              radial-gradient(2.5px 2.5px at 35% 33%, rgba(255,255,255,0.7), transparent),
              radial-gradient(2px 2px at 42% 58%, rgba(255,255,255,0.55), transparent),
              radial-gradient(2.5px 2.5px at 31% 85%, rgba(255,255,255,0.7), transparent),
              radial-gradient(2px 2px at 52% 12%, rgba(255,255,255,0.6), transparent),
              radial-gradient(2.5px 2.5px at 58% 41%, rgba(255,255,255,0.7), transparent),
              radial-gradient(2px 2px at 48% 68%, rgba(255,255,255,0.55), transparent),
              radial-gradient(2.5px 2.5px at 55% 94%, rgba(255,255,255,0.7), transparent),
              radial-gradient(2px 2px at 68% 18%, rgba(255,255,255,0.6), transparent),
              radial-gradient(2.5px 2.5px at 75% 52%, rgba(255,255,255,0.7), transparent),
              radial-gradient(2px 2px at 72% 78%, rgba(255,255,255,0.55), transparent),
              radial-gradient(2.5px 2.5px at 85% 6%, rgba(255,255,255,0.7), transparent),
              radial-gradient(2px 2px at 91% 29%, rgba(255,255,255,0.6), transparent),
              radial-gradient(2.5px 2.5px at 88% 55%, rgba(255,255,255,0.7), transparent),
              radial-gradient(2px 2px at 95% 82%, rgba(255,255,255,0.55), transparent)
            `,
          }}
        />
      </motion.div>

      {/* Stars layer 2 - faster pulse, offset timing */}
      <motion.div
        className="fixed inset-0 pointer-events-none z-[2]"
        style={{ y: stars2Y, x: stars2X }}
        animate={{ opacity: [0.55, 0.65, 0.55] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(2px 2px at 9% 15%, rgba(255,255,255,0.6), transparent),
              radial-gradient(2.5px 2.5px at 16% 38%, rgba(255,255,255,0.7), transparent),
              radial-gradient(2px 2px at 11% 62%, rgba(255,255,255,0.55), transparent),
              radial-gradient(2.5px 2.5px at 22% 88%, rgba(255,255,255,0.7), transparent),
              radial-gradient(2px 2px at 38% 11%, rgba(255,255,255,0.6), transparent),
              radial-gradient(2.5px 2.5px at 45% 45%, rgba(255,255,255,0.7), transparent),
              radial-gradient(2px 2px at 33% 71%, rgba(255,255,255,0.55), transparent),
              radial-gradient(2.5px 2.5px at 62% 25%, rgba(255,255,255,0.7), transparent),
              radial-gradient(2px 2px at 66% 62%, rgba(255,255,255,0.6), transparent),
              radial-gradient(2.5px 2.5px at 59% 88%, rgba(255,255,255,0.7), transparent),
              radial-gradient(2px 2px at 78% 8%, rgba(255,255,255,0.55), transparent),
              radial-gradient(2.5px 2.5px at 82% 42%, rgba(255,255,255,0.7), transparent),
              radial-gradient(2px 2px at 79% 72%, rgba(255,255,255,0.6), transparent),
              radial-gradient(2.5px 2.5px at 93% 48%, rgba(255,255,255,0.7), transparent),
              radial-gradient(2px 2px at 97% 75%, rgba(255,255,255,0.55), transparent)
            `,
          }}
        />
      </motion.div>

      {/* Fixed Globe Background */}
      <motion.div
        className="fixed inset-0 z-[1] pointer-events-auto"
        style={{
          x: globeX,
          y: globeY,
          scale: globeScale,
          opacity: globeOpacity,
        }}
      >
        <LandingGlobe />
      </motion.div>

      {/* Hero Section */}
      <div className="relative h-screen overflow-hidden z-10">
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent"
          style={{ height: "50%" }}
        />

        <div className="relative h-full flex flex-col items-center justify-center">
          <motion.div
            className="text-center max-w-4xl px-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-[1.1] tracking-tight">
              <span className="text-white">Architect the world</span>
            <br />
              <span className="text-white/80">the way you imagine it.</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-400 max-w-xl mx-auto mb-8 leading-relaxed">
            Edit layouts, swap structures, visualize changes in real-time.
          </p>
          <Button
            size="lg"
              className="bg-white hover:bg-white/90 text-black font-semibold px-8 sm:px-10 py-5 sm:py-6 rounded-full shadow-lg shadow-white/10 hover:shadow-xl hover:shadow-white/20 transition-all duration-300 text-base sm:text-lg"
            asChild
          >
            <a href="/map">Start Building</a>
          </Button>
          </motion.div>
        </div>
      </div>

      {/* Features Bento Box Section */}
      <section id="features" className="relative z-10 py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div className="text-center mb-16" {...fadeInUp}>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              Everything you need to build
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Powerful tools designed for architects, urban planners, and visionaries.
            </p>
          </motion.div>

          {/* Bento Grid */}
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            variants={staggerContainer}
            initial="initial"
            whileInView="whileInView"
            viewport={{ once: true }}
          >
            {/* Video Card - Large */}
            <motion.div
              className="md:col-span-2 lg:col-span-2 row-span-2 rounded-3xl overflow-hidden bg-neutral-900 border border-white/10 hover:border-white/20 transition-all duration-300 relative min-h-[300px] md:min-h-[400px]"
              variants={fadeInUp}
            >
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900">
                <button className="w-20 h-20 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-all hover:scale-110">
                  <Play className="w-8 h-8 text-white ml-1" />
                </button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                <h3 className="text-xl font-semibold">See it in action</h3>
                <p className="text-gray-400 text-sm">Watch how easy it is to transform any location</p>
              </div>
            </motion.div>

            {/* Global Coverage */}
            <motion.div
              className="p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/[0.07] transition-all duration-300"
              variants={fadeInUp}
            >
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                <Globe className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Global Coverage</h3>
              <p className="text-gray-400 text-sm">Access detailed 3D maps of any location worldwide.</p>
            </motion.div>

            {/* AI-Powered */}
            <motion.div
              className="p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/[0.07] transition-all duration-300"
              variants={fadeInUp}
            >
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                <Wand2 className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-2">AI-Powered</h3>
              <p className="text-gray-400 text-sm">Let AI do literally anything. Change the weather, take you anywhere, delete & insert buildings.</p>
            </motion.div>

            {/* 3D Generation */}
            <motion.div
              className="p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/[0.07] transition-all duration-300"
              variants={fadeInUp}
            >
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                <Box className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-2">3D Generation</h3>
              <p className="text-gray-400 text-sm">Transform text into detailed 3D models in seconds.</p>
            </motion.div>

            {/* Asset Library - Wide */}
            <motion.div
              className="md:col-span-2 p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/[0.07] transition-all duration-300"
              variants={fadeInUp}
            >
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                <FolderOpen className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Asset Library</h3>
              <p className="text-gray-400 text-sm">Import your own 3D assets. All 3D models you generate are saved in this library.</p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div className="text-center mb-16" {...fadeInUp}>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              How it works
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Redesign the world to your own taste.
            </p>
          </motion.div>

          <div className="space-y-12">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                className="flex flex-col md:flex-row items-start gap-6"
                {...fadeInUp}
                transition={{ delay: index * 0.1 }}
              >
                <div className="flex-shrink-0 w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                  <span className="text-2xl font-bold text-white/60">
                    {step.number}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-semibold mb-2">{step.title}</h3>
                  <p className="text-gray-400 text-lg">{step.description}</p>
                </div>
              </motion.div>
        ))}
      </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-24 px-6">
        <motion.div className="max-w-5xl mx-auto text-center" {...fadeInUp}>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
            Ready to reshape the world?
          </h2>
          <p className="text-gray-400 text-lg mb-8 max-w-2xl mx-auto">
            Join thousands of architects and designers who are already building the future.
          </p>
          <Button
            size="lg"
            className="bg-white hover:bg-white/90 text-black font-semibold px-8 py-6 rounded-full"
            asChild
          >
            <a href="/map">
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </a>
          </Button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-8 px-6 bg-black border-t border-white/10">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-400 text-sm">
            © 2026 Arcki. All rights reserved.
          </p>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </a>
        </div>
      </footer>
    </div>
  );
}
