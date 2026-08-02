import { useEffect, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { Waves, MousePointerClick, Code2, Repeat, Boxes, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import SpinViewer, { type SpinManifest } from "./SpinViewer";
import { LoginModal } from "../components/LoginModal";
import { apiEndpoints } from "../lib/api";
import { PLAYER_BRANDING } from "../lib/branding";

/**
 * Drift (drift.li) marketing landing. Drift is the generic interactive
 * image-sequence player; Rotation3D runs on top of it as one use case. Same
 * content/data as Rotation3D — this page just wears the Drift skin (cyan/blue)
 * and the players auto-loop ("drift"). Bespoke aesthetic still to be refined.
 */

const DRIFT = PLAYER_BRANDING.drift;

// Cyan/blue Drift theme — swaps the brand CSS vars the whole page reads through.
const driftTheme: CSSProperties = {
  ["--primary-brand" as string]: DRIFT.primary,
  ["--secondary-brand" as string]: DRIFT.secondary,
};

type Featured = {
  id: string;
  name: string;
  background?: string | null;
  defaultFrame?: number;
  featured?: boolean;
  heroFeatured?: boolean;
  manifest?: { frameCount?: number; frames?: string[] };
};

const STUDIO_GRADIENT =
  "radial-gradient(120% 80% at 50% -10%,#0e2a33 0%,rgba(15,23,42,0) 55%),linear-gradient(to bottom right,#0b1220,#070c16)";
const containerBg = (p: Featured) => p.background || STUDIO_GRADIENT;
const man = (p: Featured): SpinManifest => ({
  frameCount: p.manifest?.frameCount || p.manifest?.frames?.length || 36,
  frames: p.manifest?.frames,
  defaultFrame: p.defaultFrame ?? 0,
});

const DEMO: SpinManifest = { frameCount: 36, defaultFrame: 3 };

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

function Section({ id, children, className = "" }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>
      {children}
    </section>
  );
}

const FEATURES = [
  { icon: Waves, title: "Motion that loops", body: "Every sequence drifts on its own — seamless, no jarring restart. Pause it any time to explore by hand." },
  { icon: MousePointerClick, title: "Grab and steer", body: "Drag to take control of the path, spin to any point, pinch to zoom. It's fully interactive on any device." },
  { icon: Repeat, title: "Any image sequence", body: "360° spins, product angles, before/after — Drift turns any ordered frame set into a living, interactive view." },
  { icon: Code2, title: "One-line embed", body: "Drop a single iframe anywhere. Loops on load, works on every platform, no plugins." },
];

export default function DriftLanding() {
  const [showLogin, setShowLogin] = useState(false);
  const [featured, setFeatured] = useState<Featured[]>([]);
  useEffect(() => {
    apiEndpoints
      .r3dPublicFeatured()
      .then((r) => setFeatured(r.data.products || []))
      .catch(() => undefined);
  }, []);
  const hero = featured.find((p) => p.heroFeatured) || featured[0];
  const showcase = featured.filter((p) => p.featured);

  return (
    <div
      style={driftTheme}
      className="min-h-screen overflow-x-hidden bg-[#070c16] font-sans text-white antialiased"
    >
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#070c16]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-brand-primary to-brand-secondary shadow-glow">
              <Waves className="h-4 w-4 text-white" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Drift</span>
          </div>
          <nav className="hidden items-center gap-8 text-sm text-gray-300 md:flex">
            <a href="#showcase" className="transition-colors hover:text-white">Showcase</a>
            <a href="#features" className="transition-colors hover:text-white">Features</a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLogin(true)}
              className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-gray-200 transition-colors hover:bg-white/[0.08]"
            >
              Log in
            </button>
            <a
              href="#contact"
              className="hidden rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary px-4 py-2 text-sm font-semibold shadow-glow-sm transition-all hover:brightness-110 sm:inline-block"
            >
              Request a demo
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <Section className="grid items-center gap-10 pb-16 pt-14 sm:pt-20 lg:grid-cols-2 lg:gap-16 lg:pb-24">
        <motion.div {...fadeUp}>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-brand-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-accent shadow-glow-sm" />
            The interactive drift player
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Bring any sequence{" "}
            <span className="bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent">
              to life
            </span>
            .
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-gray-300 sm:text-lg">
            Drift turns an ordered set of frames into a living, looping, fully
            interactive view — grab it, steer it, zoom it. One player for every
            kind of motion.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#contact"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary px-5 py-3 text-sm font-semibold shadow-glow transition-all hover:brightness-110"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              to="/p/demo"
              className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-gray-200 backdrop-blur transition-colors hover:bg-white/[0.08]"
            >
              See it full-screen
            </Link>
          </div>
          <p className="mt-6 text-xs text-gray-500">Loops on its own · Grab to steer · Works on every device</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="relative">
            <div className="absolute inset-0 -z-10 rounded-[32px] bg-gradient-to-br from-brand-primary/20 to-brand-secondary/10 blur-3xl" />
            <div className="relative aspect-square w-full overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.02] shadow-[0_40px_120px_-40px_rgba(2,8,23,0.9)]">
              <SpinViewer
                manifest={hero ? man(hero) : DEMO}
                variant="hero"
                background={hero ? containerBg(hero) : undefined}
                enableLoop
              />
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-gray-500">↑ This is live — grab it to steer</p>
        </motion.div>
      </Section>

      {/* Showcase */}
      <Section id="showcase" className="py-16 sm:py-24">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Live and drifting</h2>
          <p className="mt-4 text-gray-400">Every one below is interactive — grab it, or let it drift.</p>
        </motion.div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(showcase.length > 0 ? showcase.slice(0, 6) : []).map((p, i) => (
            <motion.div
              key={p.id}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: (i % 3) * 0.1 }}
              className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]"
            >
              <div className="relative aspect-square">
                <SpinViewer manifest={man(p)} variant="hero" background={containerBg(p)} enableLoop />
              </div>
              <div className="flex items-center justify-between border-t border-white/8 px-5 py-4">
                <Link to={`/p/${p.id}`} className="text-sm font-medium transition-colors hover:text-brand-accent">
                  {p.name}
                </Link>
                <span className="text-xs text-gray-500">Grab to steer</span>
              </div>
            </motion.div>
          ))}
          {showcase.length === 0 &&
            ["Sequence 01", "Sequence 02", "Sequence 03"].map((name, i) => (
              <motion.div
                key={name}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.1 }}
                className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]"
              >
                <div className="relative aspect-square">
                  <SpinViewer manifest={{ frameCount: 36, defaultFrame: (i + 1) * 4 }} variant="hero" enableLoop />
                </div>
                <div className="flex items-center justify-between border-t border-white/8 px-5 py-4">
                  <span className="text-sm font-medium">{name}</span>
                  <span className="text-xs text-gray-500">Grab to steer</span>
                </div>
              </motion.div>
            ))}
        </div>
      </Section>

      {/* Features */}
      <Section id="features" className="py-16 sm:py-24">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">One player, endless motion</h2>
        </motion.div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: (i % 4) * 0.08 }}
              className="rounded-2xl border border-white/8 bg-glass-panel p-6 backdrop-blur transition-colors hover:border-white/15"
            >
              <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-brand-accent">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-400">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section id="contact" className="py-16 sm:py-24">
        <motion.div
          {...fadeUp}
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-brand-primary/15 via-transparent to-brand-secondary/15 p-10 text-center sm:p-16"
        >
          <div className="absolute inset-0 -z-10 bg-[#070c16]/40" />
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Ready to make it drift?</h2>
          <p className="mx-auto mt-4 max-w-xl text-gray-300">
            Tell us about your sequences and we'll set up your interactive Drift player.
          </p>
          <a
            href="mailto:hello@drift.li?subject=Drift%20demo%20request"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary px-6 py-3.5 text-sm font-semibold shadow-glow transition-all hover:brightness-110"
          >
            Request a demo <ArrowRight className="h-4 w-4" />
          </a>
        </motion.div>
      </Section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10">
        <Section className="flex flex-col items-center justify-between gap-4 text-sm text-gray-500 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-brand-primary to-brand-secondary">
              <Boxes className="h-3.5 w-3.5 text-white" />
            </span>
            <span className="font-medium text-gray-300">Drift</span>
          </div>
          <span>© {new Date().getFullYear()} Drift. All rights reserved.</span>
        </Section>
      </footer>
    </div>
  );
}
