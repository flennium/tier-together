import type { ReactNode } from "react";
import { useDiscord } from "ludicord/discord";

export default function DiscordOnly({ children }: { readonly children: ReactNode }) {
  const discord = useDiscord();

  if (discord.status !== "outside-discord") return children;

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-canvas px-6 py-10 text-center text-ink">
      <img
        className="pointer-events-none absolute inset-0 size-full object-cover opacity-45"
        src="/brand/tier-together-board-texture.webp"
        alt=""
      />
      <section className="relative grid w-full max-w-xl justify-items-center rounded-2xl bg-panel/95 px-6 py-10 shadow-[0_24px_70px_rgba(0,0,0,0.42)] sm:px-10 sm:py-14">
        <img className="size-20 object-contain sm:size-24" src="/brand/tier-together-mark.png" alt="" />
        <h1 className="mt-7 text-balance font-display text-[clamp(2.25rem,8vw,4rem)] font-bold leading-[0.98] tracking-[-0.025em]">
          Tier Together can only be played inside Discord.
        </h1>
        <p className="mt-5 max-w-[48ch] text-pretty leading-7 text-muted">
          Open Discord, enter a text or voice channel, then launch Tier Together from the App Launcher.
        </p>
        <nav className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm" aria-label="Legal information">
          <a className="text-[#b9c5ff] underline decoration-white/25 underline-offset-4 hover:text-white" href="/privacy">Privacy Policy</a>
          <a className="text-[#b9c5ff] underline decoration-white/25 underline-offset-4 hover:text-white" href="/terms">Terms of Service</a>
        </nav>
      </section>
    </main>
  );
}
