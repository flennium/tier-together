import { useDiscordUser } from "ludicord/discord";
import { formatUserName } from "@/lib/format-user";

export default function embed() {
  const user = useDiscordUser();

  return (
    <main className="mx-auto min-h-[calc(100dvh-4.25rem)] w-full max-w-[920px] px-3 py-7 sm:px-6 sm:py-12">
      <section className="overflow-hidden rounded-2xl bg-panel shadow-[0_18px_45px_rgba(0,0,0,.28)]">
        <header className="flex items-start gap-4 border-b border-white/8 p-5 sm:items-center sm:gap-5 sm:p-7">
          {user?.avatar ? <img className="size-16 shrink-0 rounded-xl object-cover sm:size-18" src={user.avatar} alt="" /> : <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-raised text-2xl font-bold sm:size-18" aria-hidden="true">{user?.displayName.slice(0, 1).toUpperCase() ?? "?"}</span>}
          <div className="min-w-0"><p className="text-xs font-bold text-[#9cafee]">Discord identity</p><h1 className="mt-1 break-words font-display text-[clamp(1.75rem,5vw,2.25rem)] font-bold">{user ? formatUserName(user) : "Browser guest"}</h1><small className="break-words text-muted">{user ? "@" + user.username : "Connect through Discord to load your identity"}</small></div>
        </header>
        <dl className="m-0 px-5 sm:px-7">
          <div className="grid gap-1 border-b border-white/6 py-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4"><dt className="text-xs text-muted">Connection</dt><dd className="m-0 min-w-0 break-words text-[#e5e3dd]">{user ? "Verified by Ludicord" : "Local browser preview"}</dd></div>
          <div className="grid gap-1 border-b border-white/6 py-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4"><dt className="text-xs text-muted">Display name</dt><dd className="m-0 min-w-0 break-words text-[#e5e3dd]">{user ? formatUserName(user) : "Unavailable outside Discord"}</dd></div>
          <div className="grid gap-1 py-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4"><dt className="text-xs text-muted">User ID</dt><dd className="m-0 min-w-0 break-all text-[#e5e3dd]">{user?.id ?? "Not provided in browser preview"}</dd></div>
        </dl>
      </section>
    </main>
  );
}
