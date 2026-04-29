import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LoginModal } from "../LoginModal";
import picdriftLogo from "../../assets/picdrift.png";

const mockCards = [
  {
    title: "Portrait FX",
    tone: "from-fuchsia-500 to-purple-700",
    rotate: "-10deg",
    x: "2%",
    y: "15%",
    chip: "Portrait",
  },
  {
    title: "Landscape FX",
    tone: "from-orange-400 to-amber-600",
    rotate: "-4deg",
    x: "27%",
    y: "7%",
    chip: "Landscape",
  },
  {
    title: "Story FX",
    tone: "from-emerald-400 to-cyan-600",
    rotate: "4deg",
    x: "51%",
    y: "2%",
    chip: "Story",
  },
  {
    title: "Cinematic FX",
    tone: "from-cyan-300 to-sky-600",
    rotate: "10deg",
    x: "75%",
    y: "8%",
    chip: "Cinematic",
  },
];

const posterTones = [
  "from-slate-300 to-slate-500",
  "from-fuchsia-400 to-purple-600",
  "from-orange-400 to-red-500",
  "from-cyan-300 to-blue-600",
  "from-emerald-300 to-teal-600",
  "from-indigo-300 to-indigo-600",
];

export const Hero = () => {
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("login_email")) {
      setShowLogin(true);
    }
  }, []);

  return (
    <>
      <div className="relative min-h-screen overflow-hidden bg-[#070a20] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(157,57,255,0.2),transparent_38%),radial-gradient(circle_at_82%_18%,rgba(26,103,255,0.35),transparent_42%),radial-gradient(circle_at_50%_64%,rgba(15,12,40,0.65),transparent_62%)]" />
        <div className="absolute inset-x-0 top-0 h-[52%] bg-gradient-to-r from-[#170316] via-[#1a164f] to-[#0d2f59]" />
        <div
          className="absolute inset-x-0 bottom-[-140px] h-[68%] bg-gradient-to-r from-[#2f58df] via-[#5364f2] to-[#3f58dd]"
          style={{ clipPath: "polygon(0 16%, 100% 0, 100% 100%, 0 100%)" }}
        />

        <header className="relative z-20 border-b border-white/10 bg-[#120f2b]/65 backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
            <a
              href="https://picdrift.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3"
            >
              <img
                src={picdriftLogo}
                alt="PicDrift"
                className="h-9 w-auto object-contain sm:h-10"
              />
            </a>

            <div className="hidden items-center gap-5 text-sm text-slate-200/85 md:flex">
              <span className="border-b-2 border-cyan-400 pb-1 font-semibold text-white">
                Home
              </span>
              <Link to="/terms" className="hover:text-white transition-colors">
                Terms
              </Link>
              <Link to="/privacy" className="hover:text-white transition-colors">
                Privacy
              </Link>
              <a
                href="https://www.picdrift.com/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                Contact
              </a>
            </div>

            <button
              onClick={() => setShowLogin(true)}
              className="rounded-full border border-white/35 bg-white/5 px-5 py-1.5 text-sm font-semibold text-white transition hover:bg-white/12"
            >
              Login
            </button>
          </div>

          <div className="mx-auto flex w-full max-w-7xl items-center gap-2 overflow-x-auto px-4 pb-3 text-xs text-slate-100/90 md:hidden">
            <span className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1 font-semibold text-cyan-100">
              Home
            </span>
            <Link
              to="/terms"
              className="rounded-full border border-white/20 bg-white/5 px-3 py-1 font-medium whitespace-nowrap"
            >
              Terms
            </Link>
            <Link
              to="/privacy"
              className="rounded-full border border-white/20 bg-white/5 px-3 py-1 font-medium whitespace-nowrap"
            >
              Privacy
            </Link>
            <a
              href="https://www.picdrift.com/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/20 bg-white/5 px-3 py-1 font-medium whitespace-nowrap"
            >
              Contact
            </a>
          </div>
        </header>

        <main className="relative z-10">
          <section className="mx-auto grid w-full max-w-7xl gap-10 px-4 pb-10 pt-12 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:pt-14">
            <div className="max-w-xl">
              <h1 className="text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
                <span className="block">Welcome to</span>
                <span className="mt-1 block bg-gradient-to-r from-cyan-300 to-blue-300 bg-clip-text text-transparent">
                  Your Creative Studio
                </span>
              </h1>

              <p className="mt-4 text-lg text-slate-200 sm:text-2xl">
                Start Generating Cinematic Stories
              </p>

              <p className="mt-8 text-sm font-bold uppercase tracking-[0.16em] text-slate-300/75">
                Download PicDrift Studio Beta Now
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href="https://www.picdrift.com/studio-signup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-[#72cf06] px-7 py-3 text-sm font-black text-[#0b1205] transition hover:bg-[#83e30f]"
                >
                  Sign Up Now
                </a>
                <button
                  onClick={() => setShowLogin(true)}
                  className="rounded-full border border-white/45 bg-white/5 px-7 py-3 text-sm font-bold text-white transition hover:bg-white/12"
                >
                  Login
                </button>
              </div>
            </div>

            <div className="relative h-[300px] sm:h-[340px] lg:h-[370px]">
              {mockCards.map((card) => (
                <div
                  key={card.title}
                  className={`absolute h-[255px] w-[150px] rounded-3xl border border-white/20 bg-gradient-to-b ${card.tone} p-3 shadow-[0_22px_40px_rgba(0,0,0,0.45)] sm:h-[290px] sm:w-[175px]`}
                  style={{
                    left: card.x,
                    top: card.y,
                    transform: `rotate(${card.rotate})`,
                  }}
                >
                  <div className="flex h-full flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="rounded-full border border-white/30 bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/90 backdrop-blur-sm">
                          {card.chip}
                        </span>
                        <span className="h-2 w-2 rounded-full bg-white/80 shadow-[0_0_14px_rgba(255,255,255,0.85)]" />
                      </div>

                      <div className="rounded-xl border border-white/20 bg-black/15 p-2 backdrop-blur-[1px]">
                        <div className="grid grid-cols-3 gap-1.5">
                          {Array.from({ length: 6 }).map((_, idx) => (
                            <div
                              key={`${card.title}-${idx}`}
                              className="aspect-[3/4] rounded-md border border-white/20 bg-gradient-to-b from-white/30 to-white/10"
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <span className="w-full rounded-xl bg-black/30 px-2 py-1 text-center text-xs font-bold text-white/90 backdrop-blur-sm">
                      {card.title}
                    </span>
                  </div>
                </div>
              ))}

              <div className="absolute left-[42%] top-[34%] flex h-20 w-20 items-center justify-center rounded-full border border-white/30 bg-white/20 backdrop-blur-xl shadow-[0_12px_30px_rgba(5,10,35,0.55)]">
                <div className="ml-1 h-0 w-0 border-y-[12px] border-l-[18px] border-y-transparent border-l-white" />
              </div>
            </div>
          </section>

          <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 pb-16 pt-5 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:pt-0">
            <div className="rounded-[2rem] border border-indigo-300/25 bg-[#070c2b]/85 p-4 shadow-[0_24px_70px_rgba(10,12,38,0.45)] backdrop-blur-sm sm:p-6">
              <div className="rounded-[1.4rem] border border-white/10 bg-gradient-to-br from-[#090b24] to-[#07081c] p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold tracking-wide text-slate-200">
                    Continue Watching
                  </span>
                  <span className="rounded-full bg-slate-800/80 px-2.5 py-1">
                    Library
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {posterTones.map((tone, idx) => (
                    <div
                      key={`poster-${idx}`}
                      className={`aspect-[3/4] rounded-lg border border-white/10 bg-gradient-to-b ${tone}`}
                    />
                  ))}
                </div>

                <div className="mt-6 text-xs font-semibold tracking-[0.15em] text-slate-400">
                  Popular Movies
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {posterTones.slice().reverse().map((tone, idx) => (
                    <div
                      key={`poster-bottom-${idx}`}
                      className={`aspect-[3/4] rounded-lg border border-white/10 bg-gradient-to-b ${tone}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="max-w-xl text-slate-100">
              <p className="text-xl leading-relaxed sm:text-3xl sm:leading-[1.45]">
                Imagine it. Create it.
                <br />
                <span className="font-semibold text-white">All from one dashboard.</span>
              </p>

              <p className="mt-6 text-sm leading-relaxed text-slate-200/90 sm:text-base">
                Transform your content creation with AI-powered video, image, and
                carousel generation.
              </p>
            </div>
          </section>
        </main>
      </div>

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </>
  );
};
