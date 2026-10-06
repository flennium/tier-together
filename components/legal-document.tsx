import type { ReactNode } from "react";

interface LegalDocumentProps {
  readonly title: string;
  readonly summary: string;
  readonly children: ReactNode;
}

export default function LegalDocument({ title, summary, children }: LegalDocumentProps) {
  return (
    <main className="min-h-dvh bg-canvas px-5 py-8 text-ink sm:px-8 sm:py-12">
      <article className="mx-auto max-w-3xl">
        <header className="border-b border-white/10 pb-8">
          <a className="inline-flex items-center gap-3 rounded-lg text-sm font-bold text-[#cbd3f2] hover:text-white" href="/">
            <img className="size-9 object-contain" src="/brand/tier-together-mark.png" alt="" />
            Tier Together
          </a>
          <h1 className="mt-8 font-display text-[clamp(2.5rem,8vw,4.5rem)] font-bold leading-none">{title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">{summary}</p>
          <p className="mt-4 text-sm text-muted">Effective October 6, 2026</p>
        </header>

        <div className="legal-copy py-8 sm:py-10">{children}</div>

        <footer className="flex flex-wrap gap-x-6 gap-y-3 border-t border-white/10 pt-6 text-sm">
          <a className="text-[#b9c5ff] underline decoration-white/25 underline-offset-4 hover:text-white" href="/privacy">Privacy Policy</a>
          <a className="text-[#b9c5ff] underline decoration-white/25 underline-offset-4 hover:text-white" href="/terms">Terms of Service</a>
        </footer>
      </article>
    </main>
  );
}
