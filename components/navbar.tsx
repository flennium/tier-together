import { useDiscordUser } from "ludicord/discord";
import { Link, useEmbedPath } from "ludicord/navigation";

export default function Navbar() {
  const user = useDiscordUser();
  const path = useEmbedPath();

  return (
    <nav className="sticky top-0 z-40 flex min-h-17 items-center gap-3 border-b border-white/8 bg-canvas/95 px-[max(1rem,var(--ludicord-safe-left))] py-2 backdrop-blur md:px-[max(1.5rem,var(--ludicord-safe-left))]" aria-label="Main navigation">
      <Link className="flex min-h-11 min-w-11 items-center justify-center gap-2.5 rounded-lg font-bold text-ink no-underline sm:justify-start" href="home" aria-label="Tier Together board">
        <span className="grid size-9 place-items-center rounded-lg bg-raised" aria-hidden="true"><img className="size-7 object-contain" src="/brand/tier-together-mark.png" alt="" /></span>
        <span className="hidden sm:inline">Tier Together</span>
      </Link>
      <div className="hidden min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted md:flex" aria-current={path === "home" ? "page" : undefined}>
        <span className="size-2 rounded-full bg-success-dot" aria-hidden="true" />
        Templates &amp; board
      </div>
      <div className="ms-auto flex min-h-11 items-center gap-2 rounded-lg px-1.5 sm:px-2" aria-label={user ? "Logged in as " + user.displayName : "Not logged in"}>
        {user?.avatar ? (
          <img className="size-8 rounded-lg object-cover" src={user.avatar} alt="" />
        ) : (
          <span className="grid size-8 place-items-center rounded-lg bg-raised text-sm font-bold" aria-hidden="true">{user?.displayName.slice(0, 1).toUpperCase() ?? "?"}</span>
        )}
        <span className="hidden max-w-40 truncate text-sm sm:inline">{user?.displayName ?? "Player"}</span>
      </div>
    </nav>
  );
}
