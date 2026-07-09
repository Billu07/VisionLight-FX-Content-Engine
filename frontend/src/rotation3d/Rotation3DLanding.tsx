import { useState } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  Sparkles,
  Code2,
  MousePointerClick,
  BarChart3,
  ShieldCheck,
  Boxes,
  Check,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import SpinViewer, { type SpinManifest } from "./SpinViewer";
import { LoginModal } from "../components/LoginModal";

/**
 * Rotation3D marketing landing page (rotation3d.com/). On-theme with the studio
 * system: Bai Jamjuree, --primary-brand → --secondary-brand gradient, cyan glow,
 * studio gradient + glass. The hero and showcase reuse the real SpinViewer in its
 * chrome-less "hero" variant so visitors interact with live spins immediately.
 */

const DEMO: SpinManifest = { frameCount: 36, defaultFrame: 3 };

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

function HeroSpin({ className = "" }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-0 -z-10 rounded-[32px] bg-gradient-to-br from-brand-primary/20 to-brand-secondary/10 blur-3xl" />
      <div className="relative aspect-square w-full overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.02] shadow-[0_40px_120px_-40px_rgba(2,8,23,0.9)]">
        <SpinViewer manifest={DEMO} variant="hero" />
      </div>
    </div>
  );
}

function Section({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>
      {children}
    </section>
  );
}

const STEPS = [
  {
    icon: Upload,
    title: "Send your product photos",
    body: "Bulk-upload shots of each product from our simple angle guide. No 3D skills, no special rig — just photos.",
  },
  {
    icon: Sparkles,
    title: "We craft the 3D spin",
    body: "Our team turns your photos into a smooth, interactive 360° spin — background removed, edges clean, ready to embed.",
  },
  {
    icon: Code2,
    title: "Embed anywhere",
    body: "Drop one line of code on your store, or share a link. Your customers grab, rotate, and explore every angle.",
  },
];

const FEATURES = [
  { icon: Boxes, title: "True 360° interactivity", body: "Drag, spin, and zoom on any device — no app, no plugin, no video buffering." },
  { icon: Code2, title: "One-line embed", body: "A single iframe on your product page. It just works, on any platform." },
  { icon: MousePointerClick, title: "Your calls-to-action", body: "Two brand-controlled buttons per product — Buy Now, Next Product, or any URL." },
  { icon: BarChart3, title: "Engagement analytics", body: "See views, interaction rate, and click-throughs for every product you publish." },
  { icon: ShieldCheck, title: "Fully managed", body: "White-glove production. You send photos; we deliver a ready-made interactive studio." },
  { icon: Sparkles, title: "Pixel-clean spins", body: "Transparent cutouts that sit perfectly on your page background, every frame." },
];

const PLANS = [
  {
    name: "Starter",
    tagline: "For small catalogs",
    features: ["Up to 25 products", "Interactive 360° player", "Embed + share links", "Basic analytics"],
    highlight: false,
  },
  {
    name: "Growth",
    tagline: "For growing brands",
    features: ["Up to 250 products", "Everything in Starter", "Custom CTAs per product", "Priority production", "Full engagement analytics"],
    highlight: true,
  },
  {
    name: "Enterprise",
    tagline: "For large catalogs",
    features: ["Unlimited products", "Everything in Growth", "Custom brand domain", "Dedicated production SLA", "Team seats & support"],
    highlight: false,
  },
];

export default function Rotation3DLanding() {
  const [showLogin, setShowLogin] = useState(false);
  return (
    <div className="min-h-screen bg-studio-gradient font-sans text-white antialiased">
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-gray-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-brand-primary to-brand-secondary shadow-glow">
              <Boxes className="h-4 w-4 text-white" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Rotation3D</span>
          </div>
          <nav className="hidden items-center gap-8 text-sm text-gray-300 md:flex">
            <a href="#how" className="transition-colors hover:text-white">How it works</a>
            <a href="#showcase" className="transition-colors hover:text-white">Showcase</a>
            <a href="#features" className="transition-colors hover:text-white">Features</a>
            <a href="#pricing" className="transition-colors hover:text-white">Pricing</a>
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
            Interactive 360° product viewer
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Let customers{" "}
            <span className="bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent">
              hold your product
            </span>{" "}
            in their hands.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-gray-300 sm:text-lg">
            Send us your product photos. We turn them into a buttery, drag-to-rotate
            3D spin your shoppers can explore from every angle — embedded right on
            your store.
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
          <p className="mt-6 text-xs text-gray-500">
            Fully managed · No 3D software · Works on every device
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <HeroSpin />
          <p className="mt-4 text-center text-xs text-gray-500">
            ↑ This is live — drag it to spin
          </p>
        </motion.div>
      </Section>

      {/* How it works */}
      <Section id="how" className="py-16 sm:py-24">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            From photos to interactive in three steps
          </h2>
          <p className="mt-4 text-gray-400">
            You do one thing — send photos. We handle everything else.
          </p>
        </motion.div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.title}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.1 }}
              className="relative rounded-2xl border border-white/8 bg-glass-panel p-7 backdrop-blur"
            >
              <span className="absolute right-6 top-6 text-5xl font-bold text-white/[0.05]">
                {i + 1}
              </span>
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary shadow-glow-sm">
                <s.icon className="h-6 w-6 text-white" />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Showcase */}
      <Section id="showcase" className="py-16 sm:py-24">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Grab one and spin it</h2>
          <p className="mt-4 text-gray-400">
            Every product below is a live, interactive spin — exactly what your customers get.
          </p>
        </motion.div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {["Sneaker", "Handbag", "Headphones"].map((name, i) => (
            <motion.div
              key={name}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.1 }}
              className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]"
            >
              <div className="relative aspect-square">
                <SpinViewer manifest={{ frameCount: 36, defaultFrame: (i + 1) * 4 }} variant="hero" />
              </div>
              <div className="flex items-center justify-between border-t border-white/8 px-5 py-4">
                <span className="text-sm font-medium">{name}</span>
                <span className="text-xs text-gray-500">Drag to rotate</span>
              </div>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Features */}
      <Section id="features" className="py-16 sm:py-24">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything a modern product page needs
          </h2>
        </motion.div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: (i % 3) * 0.08 }}
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

      {/* Embed demo */}
      <Section className="py-16 sm:py-24">
        <div className="grid items-center gap-10 rounded-3xl border border-white/8 bg-glass-panel p-8 backdrop-blur sm:p-12 lg:grid-cols-2">
          <motion.div {...fadeUp}>
            <h2 className="text-3xl font-bold tracking-tight">One line. Live on your site.</h2>
            <p className="mt-4 text-gray-400">
              No SDK, no build step. Paste the snippet where you want the spin to appear —
              it renders instantly, on any platform.
            </p>
            <pre className="mt-6 overflow-x-auto rounded-xl border border-white/10 bg-gray-950/80 p-4 text-xs leading-relaxed text-gray-300">
              <code>{`<iframe
  src="https://rotation3d.com/embed/your-product"
  width="100%" height="520"
  style="border:0" allowfullscreen>
</iframe>`}</code>
            </pre>
          </motion.div>
          <motion.div
            {...fadeUp}
            className="relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]"
          >
            <SpinViewer manifest={{ frameCount: 36, defaultFrame: 9 }} variant="hero" />
          </motion.div>
        </div>
      </Section>

      {/* Pricing */}
      <Section id="pricing" className="py-16 sm:py-24">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Plans that scale with your catalog</h2>
          <p className="mt-4 text-gray-400">Every plan is fully managed. You send photos; we produce the spins.</p>
        </motion.div>
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {PLANS.map((p, i) => (
            <motion.div
              key={p.name}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.1 }}
              className={`relative rounded-2xl border p-7 backdrop-blur ${
                p.highlight
                  ? "border-brand-primary/40 bg-gradient-to-b from-brand-primary/10 to-transparent shadow-glow"
                  : "border-white/8 bg-glass-panel"
              }`}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-7 rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary px-3 py-1 text-[11px] font-semibold">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-1 text-sm text-gray-400">{p.tagline}</p>
              <ul className="mt-6 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-gray-300">
                    <Check className="mt-0.5 h-4 w-4 flex-none text-brand-accent" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="#contact"
                className={`mt-8 block rounded-xl py-3 text-center text-sm font-semibold transition-all ${
                  p.highlight
                    ? "bg-gradient-to-r from-brand-primary to-brand-secondary shadow-glow-sm hover:brightness-110"
                    : "border border-white/12 bg-white/[0.04] text-gray-200 hover:bg-white/[0.08]"
                }`}
              >
                Request access
              </a>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* CTA band */}
      <Section id="contact" className="py-16 sm:py-24">
        <motion.div
          {...fadeUp}
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-brand-primary/15 via-transparent to-brand-secondary/15 p-10 text-center sm:p-16"
        >
          <div className="absolute inset-0 -z-10 bg-gray-950/40" />
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to make your products spin?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-gray-300">
            Tell us about your catalog and we'll set up your interactive studio.
          </p>
          <a
            href="mailto:hello@rotation3d.com?subject=Rotation3D%20demo%20request"
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
            <span className="font-medium text-gray-300">Rotation3D</span>
          </div>
          <span>© {new Date().getFullYear()} Rotation3D. All rights reserved.</span>
        </Section>
      </footer>
    </div>
  );
}
