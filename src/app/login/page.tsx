import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const sp = searchParams ? await searchParams : {};
  const timedOut = sp.timeout === "1";
  return (
    <div
      className="min-h-screen w-full flex flex-col justify-between relative isolate bg-cover bg-center bg-no-repeat selection:bg-[#E81B75] selection:text-white"
      style={{
        backgroundImage: "url('/images/airship-brand-poster.jpg')",
      }}
    >
      {/* Subtle dark + blurred overlay backdrop for high-contrast accessibility */}
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[6px] -z-10" />

      {/* Decorative gradient vignettes to enhance readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60 pointer-events-none -z-10" />

      {/* Header Branding ("SPEED is the Future...") */}
      <header className="relative z-10 w-full max-w-[1440px] mx-auto px-4 sm:px-6 pt-3 sm:pt-5 pb-2 shrink-0">
        <div className="flex items-center justify-between gap-3 sm:gap-6">
          {/* Left: Brand Logo & Airplane Graphic */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-[24px] sm:text-[30px] font-black tracking-tighter leading-none text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                  AX<span className="text-[#E81B75]">‹‹‹</span>
                </span>
                <div className="hidden sm:flex flex-col leading-none">
                  <span className="text-[10px] font-black tracking-[0.2em] text-white drop-shadow-sm">
                    AIRSHIP
                  </span>
                  <span className="text-[10px] font-black tracking-[0.2em] text-[#FF4081]">
                    EXPRESS
                  </span>
                </div>
              </div>
              {/* Airplane flight path graphic */}
              <div className="hidden md:flex items-center gap-1 mt-1 opacity-90">
                <span className="text-[20px] leading-none -rotate-6 filter drop-shadow">✈️</span>
                <svg width="85" height="20" viewBox="0 0 85 20" className="opacity-90">
                  <path
                    d="M2 14 Q22 4 42 10 T80 6"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="1.6"
                    strokeDasharray="3 3"
                    strokeLinecap="round"
                  />
                  <g fill="#E81B75" stroke="#FFFFFF" strokeWidth="1">
                    <circle cx="12" cy="14" r="3" />
                    <circle cx="42" cy="10" r="3" />
                    <circle cx="70" cy="7" r="3" />
                  </g>
                </svg>
              </div>
            </div>
          </div>

          {/* Center: Main Banner Typography */}
          <div className="flex-1 flex justify-center text-center px-2">
            <div className="max-w-xl">
              <h1 className="text-[22px] sm:text-[36px] lg:text-[46px] font-black italic -skew-x-6 tracking-tighter leading-none text-white drop-shadow-[0_3px_12px_rgba(0,0,0,0.8)]">
                SPEED
                <span className="ml-1 sm:ml-2 text-[11px] sm:text-[17px] lg:text-[21px] font-bold not-italic skew-x-6 text-[#FF4081] tracking-normal align-middle drop-shadow-[0_2px_8px_rgba(232,27,117,0.5)]">
                  is the Future of Business
                </span>
              </h1>
              <div className="mt-1 sm:mt-1.5 inline-flex items-center bg-black/85 text-white text-[9px] sm:text-[11px] font-semibold px-3 sm:px-4 py-1 rounded-full tracking-wide border border-white/20 shadow-lg backdrop-blur-sm">
                <span>Fast and reliable drop-off point for online sellers</span>
              </div>
            </div>
          </div>

          {/* Right: "FOR ONLINE SELLERS" Badge + Rider */}
          <div className="flex items-center gap-2 shrink-0">
            <div
              className="relative w-[58px] h-[58px] sm:w-[68px] sm:h-[68px] rounded-full bg-gradient-to-br from-[#E81B75] to-[#B80F5A] border-[2px] sm:border-[2.5px] border-white flex flex-col items-center justify-center text-white leading-none shadow-[0_4px_14px_rgba(232,27,117,0.5)] shrink-0"
              style={{ borderStyle: "dashed" }}
            >
              <span className="text-[10px] sm:text-[11px] leading-none mb-0.5">📦</span>
              <span className="text-[6px] sm:text-[7px] font-black tracking-wider text-pink-100">FOR</span>
              <span className="text-[8px] sm:text-[9px] font-black tracking-wide text-white">ONLINE</span>
              <span className="text-[7px] sm:text-[8px] font-bold text-pink-200">SELLERS</span>
            </div>
            <span className="hidden sm:inline-block text-[28px] lg:text-[32px] leading-none -scale-x-100 filter drop-shadow">
              🛵
            </span>
          </div>
        </div>
      </header>

      {/* Center Area: Floating glassmorphic modal with vertical breathing room */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-3 sm:px-6 py-4 sm:py-8 w-full">
        <div className="w-full max-w-[430px] my-auto">
          {timedOut && (
            <div
              role="alert"
              className="mb-3 rounded-2xl border border-amber-300/50 bg-amber-500/15 px-4 py-3 text-xs font-semibold text-amber-100 backdrop-blur-md"
            >
              Session expired due to inactivity. Please sign in again.
            </div>
          )}
          <div className="w-full rounded-[28px] border border-white/25 dark:border-slate-700/60 bg-slate-950/80 dark:bg-slate-900/90 backdrop-blur-2xl shadow-[0_24px_70px_rgba(0,0,0,0.45),0_6px_20px_rgba(0,0,0,0.2)] overflow-hidden transition-all duration-300">
            <LoginForm />
          </div>
        </div>
      </main>

      {/* Bottom Feature Pills ("CONVENIENT", "RELIABLE", "FAST") */}
      <section className="relative z-10 w-full max-w-[880px] mx-auto px-3 sm:px-6 pb-3 shrink-0">
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl sm:rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.25)] border border-white/80 dark:border-slate-700/80 px-4 sm:px-8 py-2.5 sm:py-3 flex flex-col sm:flex-row items-center justify-around gap-2.5 sm:gap-4">
          {/* Feature 1: CONVENIENT */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-[#E81B75] to-[#D01568] flex items-center justify-center shrink-0 shadow-md shadow-[#E81B75]/30">
              <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v5l3 2" />
              </svg>
            </div>
            <div className="leading-tight">
              <p className="text-[11px] font-black tracking-wide text-[#E81B75]">CONVENIENT</p>
              <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-0.5">Easy drop-off</p>
              <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">anytime</p>
            </div>
          </div>

          <div className="hidden sm:block w-px h-8 bg-slate-200 dark:bg-slate-700" />
          <div className="sm:hidden w-full h-px bg-slate-200 dark:bg-slate-700" />

          {/* Feature 2: RELIABLE */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-[#E81B75] to-[#D01568] flex items-center justify-center shrink-0 shadow-md shadow-[#E81B75]/30">
              <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 3l7 4v5c0 4-3 7-7 8-4-1-7-4-7-8V7z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div className="leading-tight">
              <p className="text-[11px] font-black tracking-wide text-[#E81B75]">RELIABLE</p>
              <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-0.5">Safe and Secure</p>
              <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">handling</p>
            </div>
          </div>

          <div className="hidden sm:block w-px h-8 bg-slate-200 dark:bg-slate-700" />
          <div className="sm:hidden w-full h-px bg-slate-200 dark:bg-slate-700" />

          {/* Feature 3: FAST */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-[#E81B75] to-[#D01568] flex items-center justify-center shrink-0 shadow-md shadow-[#E81B75]/30">
              <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.3">
                <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="leading-tight">
              <p className="text-[11px] font-black tracking-wide text-[#E81B75]">FAST</p>
              <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-0.5">Quick processing</p>
              <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">your parcel</p>
            </div>
          </div>
        </div>
      </section>

      {/* Brand Footer */}
      <footer className="relative z-10 bg-[#E81B75] text-white shrink-0 shadow-lg">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-semibold text-[11px]">
            <span className="inline-flex w-5 h-5 rounded-full bg-white/20 items-center justify-center text-[10px]">
              📍
            </span>
            <span>352 Escolta St., Tomas Pinpin Binondo, Manila</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] sm:text-[11px] font-medium opacity-95">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[8px] font-bold">f</span>
              R.E.T Airship Express Courier Services
            </span>
            <span className="flex items-center gap-1.5">
              <span>📞</span> 0945 441 8789 • (02)8911-1888
            </span>
            <span className="flex items-center gap-1.5">
              <span>✉</span> airshipexpress.s@gmail.com
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
