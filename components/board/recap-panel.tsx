import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Download } from "lucide-react";
import { useDiscordCommands } from "ludicord/discord";
import type { BoardState } from "@/lib/board";
import type { VoteResult } from "@/lib/voting";
import { calculateRecap } from "@/lib/recap";

export default function RecapPanel({
  board,
  voteResults,
  images,
}: {
  readonly board: BoardState;
  readonly voteResults: readonly VoteResult[];
  readonly images: Readonly<Record<string, string>>;
}) {
  const exportRef = useRef<HTMLDivElement>(null);
  const discordCommands = useDiscordCommands();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [exportUrl, setExportUrl] = useState("");
  const recap = calculateRecap(board, voteResults);
  const mostAgreedItem = recap.mostAgreed === null
    ? undefined
    : board.items.find((item) => item.id === recap.mostAgreed?.itemId);
  const controversialItem = recap.mostControversial === null
    ? undefined
    : board.items.find((item) => item.id === recap.mostControversial?.itemId);

  async function exportPng(): Promise<void> {
    if (exportRef.current === null) return;
    setExporting(true);
    setExportError("");
    setExportStatus("");
    setExportUrl("");
    try {
      const dataUrl = await toPng(exportRef.current, {
        pixelRatio: 2,
        backgroundColor: "#111217",
        cacheBust: true,
      });
      const image = await fetch(dataUrl);
      const blob = await image.blob();

      if (discordCommands.supports("openExternalLink")) {
        const response = await fetch("/api/export", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "image/png" },
          body: blob,
        });
        const result = await response.json() as { readonly path?: string; readonly error?: string };
        if (!response.ok || typeof result.path !== "string" || !result.path.startsWith("/api/export/")) {
          throw new Error(result.error ?? "The download could not be prepared.");
        }
        const exportUrl = new URL(result.path, window.location.origin).href;
        setExportUrl(exportUrl);
        const opened = await discordCommands.call("openExternalLink", { url: exportUrl });
        setExportStatus(opened.opened === false
          ? "Your PNG is ready. Use Open PNG below to finish the download."
          : "Your PNG opened in the browser for download.");
      } else {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = "tier-together-result.png";
        link.href = objectUrl;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
        setExportStatus("PNG exported.");
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The image could not be generated. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="rounded-2xl bg-panel p-4 shadow-[0_12px_34px_rgba(0,0,0,.25)] sm:p-6" aria-labelledby="recap-title" style={{ "--board-accent": board.themeColor } as React.CSSProperties}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-[#aeb9d9]">Session complete</p>
          <h2 className="mt-1 font-display text-[clamp(2rem,6vw,3.5rem)] font-bold tracking-[-.03em]" id="recap-title">The group has spoken.</h2>
          <p className="mt-2 text-muted">{recap.rankedCount} of {board.items.length} items ranked{recap.unrankedCount > 0 ? ` / ${recap.unrankedCount} left on the table` : ""}</p>
        </div>
        <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-action px-4 text-sm font-bold text-white hover:bg-action-hover disabled:opacity-40" onClick={() => void exportPng()} disabled={exporting}>
          <Download size={14} aria-hidden="true" /> {exporting ? "Preparing image…" : "Export PNG"}
        </button>
      </div>

      {(mostAgreedItem || controversialItem) && (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {mostAgreedItem && recap.mostAgreed && (
            <article className="rounded-xl bg-raised p-4">
              <span className="text-xs font-bold text-muted">Most agreed</span>
              <strong className="mt-1 block text-lg">{mostAgreedItem.name || "Image item"}</strong>
              <span className="text-sm text-muted">{recap.mostAgreed.controversyLabel}</span>
            </article>
          )}
          {controversialItem && recap.mostControversial &&
            recap.mostControversial.itemId !== recap.mostAgreed?.itemId && (
            <article className="rounded-xl bg-raised p-4">
              <span className="text-xs font-bold text-muted">Most divisive</span>
              <strong className="mt-1 block text-lg">{controversialItem.name || "Image item"}</strong>
              <span className="text-sm text-muted">{recap.mostControversial.controversyLabel}</span>
            </article>
          )}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl bg-canvas p-4 sm:p-6" ref={exportRef}>
        <div className="mb-4 grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[44px_minmax(0,1fr)_auto]">
          <div className="grid size-11 place-items-center rounded-xl bg-raised" aria-hidden="true"><img className="size-8" src="/brand/tier-together-mark.png" alt="" /></div>
          <div>
            <span className="block text-xs font-bold text-muted">Tier Together</span>
            <strong className="block break-words text-lg">{board.templateTitle}</strong>
          </div>
          <small className="col-span-2 text-muted sm:col-span-1">Final ranking</small>
        </div>
        <div className="grid gap-2">
          {board.tiers.map((tier) => (
            <section className="grid grid-cols-[3.75rem_minmax(0,1fr)] overflow-hidden rounded-xl bg-panel sm:grid-cols-[4.75rem_minmax(0,1fr)]" key={tier.id}>
              <div className="grid min-h-20 place-items-center px-2 text-center text-lg font-extrabold text-[#101218]" style={{ backgroundColor: tier.color }}>{tier.label}</div>
              <div className="flex min-h-20 flex-wrap items-stretch gap-2 p-2">
                {(board.lanes[tier.id] ?? []).map((itemId) => {
                  const item = board.items.find((candidate) => candidate.id === itemId);
                  if (!item) return null;
                  return (
                    <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-raised text-center text-xs font-bold sm:size-20" key={item.id} aria-label={item.name || "Image item"}>
                      {(item.imageId && images[item.imageId]) || item.imageUrl
                        ? <img className="absolute inset-0 size-full object-cover" src={(item.imageId && images[item.imageId]) || item.imageUrl} alt="" loading="lazy" decoding="async" />
                        : <span className="overflow-hidden text-ellipsis px-2 py-2">{item.name || "Unnamed item"}</span>}
                    </span>
                  );
                })}
                {(board.lanes[tier.id] ?? []).length === 0 && <span className="self-center px-3 text-sm text-muted">No items placed</span>}
              </div>
            </section>
          ))}
        </div>
        {(board.lanes.unranked ?? []).length > 0 && (
          <div className="mt-3 text-sm text-muted">{(board.lanes.unranked ?? []).length} items not ranked</div>
        )}
        <div className="mt-4 border-t border-white/8 pt-3 text-xs text-muted">Settled together / Tier Together</div>
      </div>
      {exportError && <p className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">{exportError}</p>}
      {exportStatus && <p className="mt-4 text-sm text-success" role="status">{exportStatus}</p>}
      {exportUrl && (
        <a className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-raised px-4 text-sm font-bold text-ink hover:bg-raised-hover" href={exportUrl} target="_blank" rel="noreferrer">
          <Download size={14} aria-hidden="true" /> Open PNG
        </a>
      )}
    </section>
  );
}
