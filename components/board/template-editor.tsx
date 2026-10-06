import { useState } from "react";
import { ChevronDown, ChevronUp, ImagePlus, Plus, Save, Trash2, X } from "lucide-react";
import type { BoardConfiguration, BoardItem, BoardState, Tier } from "@/lib/board";
import { MAX_BOARD_ITEMS, MAX_IMAGE_ITEMS } from "@/lib/board";

const TIER_COLORS = ["#e86f51", "#e6a647", "#d7bf57", "#77a96b", "#638da8", "#9a7ac6", "#cb6f93", "#54a9a0", "#8d9da8", "#d0d5cc"];
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const IMAGE_MAX_FILE_BYTES = 8 * 1024 * 1024;
const IMAGE_MAX_DATA_URL_LENGTH = 12_000;
const CONTROL = "min-h-11 min-w-0 rounded-lg bg-field px-3 text-base text-ink outline-none ring-1 ring-inset ring-white/12 focus-visible:ring-2 focus-visible:ring-[var(--board-accent)] disabled:cursor-not-allowed disabled:opacity-40";
const ICON_BUTTON = "grid size-11 shrink-0 place-items-center rounded-lg bg-raised text-strong ring-1 ring-inset ring-white/12 hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-35";
const ADD_BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-raised px-3 text-sm font-bold text-strong ring-1 ring-inset ring-white/12 hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-35";

async function compressImage(file: File): Promise<string> {
  if (!IMAGE_TYPES.has(file.type)) throw new Error("Choose a PNG, JPG, or WebP image.");
  if (file.size > IMAGE_MAX_FILE_BYTES) throw new Error("Choose an image under 8 MB.");

  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 40_000_000) {
    bitmap.close();
    throw new Error("This image is too large to process.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (context === null) {
    bitmap.close();
    throw new Error("Image processing is unavailable in this browser.");
  }

  const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  bitmap.close();

  for (const quality of [0.72, 0.58, 0.44, 0.3]) {
    const dataUrl = canvas.toDataURL("image/webp", quality);
    if (dataUrl.length <= IMAGE_MAX_DATA_URL_LENGTH) return dataUrl;
  }
  throw new Error("This photo could not be compressed small enough for the room.");
}

function createItemId(): string {
  return `item-${globalThis.crypto.randomUUID()}`;
}

function createTierId(): string {
  return `tier-${globalThis.crypto.randomUUID()}`;
}

export default function TemplateEditor({
  board,
  images,
  onApply,
  onClose,
}: {
  readonly board: BoardState;
  readonly images: Readonly<Record<string, string>>;
  readonly onApply: (configuration: BoardConfiguration, images: readonly { readonly itemId: string; readonly dataUrl: string }[]) => void;
  readonly onClose: () => void;
}) {
  const [title, setTitle] = useState(board.templateTitle);
  const [themeColor, setThemeColor] = useState(board.themeColor);
  const [tiers, setTiers] = useState<Tier[]>(board.tiers.map((tier) => ({ ...tier })));
  const [items, setItems] = useState<BoardItem[]>(board.items.map((item) => ({ ...item })));
  const [pendingImages, setPendingImages] = useState<Record<string, string>>({});
  const [imageError, setImageError] = useState("");

  const imageCount = items.filter((item) => item.imageId !== undefined).length;
  const canApply = title.trim().length > 0 &&
    tiers.length >= 3 &&
    tiers.length <= 10 &&
    tiers.every((tier) => tier.label.trim().length > 0) &&
    items.length > 0 &&
    items.every((item) => item.name.trim().length > 0 || item.imageId !== undefined || item.imageUrl !== undefined || item.icon.length > 0);

  function updateTier(tierId: string, updates: Partial<Tier>): void {
    setTiers((current) => current.map((tier) => tier.id === tierId ? { ...tier, ...updates } : tier));
  }

  function updateItem(itemId: string, updates: Partial<BoardItem>): void {
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, ...updates } : item));
  }

  function addItem(): void {
    if (items.length >= MAX_BOARD_ITEMS) return;
    setItems((current) => [...current, { id: createItemId(), name: "New item", icon: "" }]);
  }

  function addTier(): void {
    if (tiers.length >= 10) return;
    const index = tiers.length;
    setTiers((current) => [...current, {
      id: createTierId(),
      label: `Tier ${index + 1}`,
      color: TIER_COLORS[index % TIER_COLORS.length],
    }]);
  }

  function moveTier(index: number, direction: -1 | 1): void {
    const destination = index + direction;
    if (destination < 0 || destination >= tiers.length) return;
    setTiers((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  }

  async function handleImage(itemId: string, file: File | undefined): Promise<void> {
    if (file === undefined) return;
    const item = items.find((candidate) => candidate.id === itemId);
    if (item?.imageId === undefined && imageCount >= MAX_IMAGE_ITEMS) {
      setImageError(`A list can include up to ${MAX_IMAGE_ITEMS} photos.`);
      return;
    }
    setImageError("");
    try {
      const dataUrl = await compressImage(file);
      setPendingImages((current) => ({ ...current, [itemId]: dataUrl }));
      updateItem(itemId, { imageId: itemId, imageUrl: undefined });
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "The image could not be processed.");
    }
  }

  function removeImage(itemId: string): void {
    setPendingImages((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
    updateItem(itemId, { imageId: undefined, imageUrl: undefined });
  }

  function apply(): void {
    onApply(
      { title, themeColor, tiers, items },
      Object.entries(pendingImages).map(([itemId, dataUrl]) => ({ itemId, dataUrl })),
    );
  }

  return (
    <section className="mb-5 rounded-2xl bg-panel p-4 shadow-[0_16px_40px_rgba(0,0,0,.28)] sm:p-5" aria-labelledby="template-editor-title">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <span className="text-sm font-bold text-[var(--board-accent)]">Session template</span>
          <h2 className="mt-1 font-display text-2xl font-bold" id="template-editor-title">Customize this list</h2>
        </div>
        <button type="button" className={ICON_BUTTON} onClick={onClose} aria-label="Close list editor" title="Close editor">
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_9rem]">
        <label className="grid content-start gap-2 text-sm font-bold text-muted">
          <span>List title</span>
          <input className={CONTROL} value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="grid content-start gap-2 text-sm font-bold text-muted">
          <span>Accent</span>
          <input className="h-11 w-full cursor-pointer rounded-lg bg-field p-1 ring-1 ring-inset ring-white/12" type="color" value={themeColor} onChange={(event) => setThemeColor(event.target.value)} aria-label="List accent color" />
        </label>
      </div>

      <section className="mt-5 border-t border-white/8 pt-5" aria-labelledby="editor-tiers-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-bold" id="editor-tiers-title">Tier rows</h3>
            <span className="text-sm text-muted">{tiers.length} of 10 rows</span>
          </div>
          <button type="button" className={ADD_BUTTON} onClick={addTier} disabled={tiers.length >= 10}>
            <Plus size={14} aria-hidden="true" /> Add tier
          </button>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {tiers.map((tier, index) => (
            <div className="grid grid-cols-[44px_minmax(0,1fr)_44px_44px_44px] items-center gap-2" key={tier.id}>
              <input className="size-11 cursor-pointer rounded-lg bg-field p-1 ring-1 ring-inset ring-white/12" type="color" value={tier.color} onChange={(event) => updateTier(tier.id, { color: event.target.value })} aria-label={`Tier ${tier.label} color`} />
              <input className={CONTROL} value={tier.label} maxLength={12} onChange={(event) => updateTier(tier.id, { label: event.target.value })} aria-label="Tier label" />
              <button type="button" className={ICON_BUTTON} onClick={() => moveTier(index, -1)} disabled={index === 0} aria-label={`Move tier ${tier.label} up`} title="Move tier up">
                <ChevronUp size={14} aria-hidden="true" />
              </button>
              <button type="button" className={ICON_BUTTON} onClick={() => moveTier(index, 1)} disabled={index === tiers.length - 1} aria-label={`Move tier ${tier.label} down`} title="Move tier down">
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              <button type="button" className={ICON_BUTTON} onClick={() => setTiers((current) => current.filter((candidate) => candidate.id !== tier.id))} disabled={tiers.length <= 3} aria-label={`Remove tier ${tier.label}`} title="Remove tier">
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5 border-t border-white/8 pt-5" aria-labelledby="editor-items-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-bold" id="editor-items-title">List items</h3>
            <span className="text-sm text-muted">{items.length} of {MAX_BOARD_ITEMS} items / {imageCount} of {MAX_IMAGE_ITEMS} uploads</span>
          </div>
          <button type="button" className={ADD_BUTTON} onClick={addItem} disabled={items.length >= MAX_BOARD_ITEMS}>
            <Plus size={14} aria-hidden="true" /> Add item
          </button>
        </div>
        <div className="grid gap-2">
          {items.map((item, index) => {
            const preview = pendingImages[item.id] ?? (item.imageId ? images[item.imageId] : undefined) ?? item.imageUrl;
            const hasImage = preview !== undefined;
            return (
              <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 rounded-xl bg-white/[.025] p-2 sm:grid-cols-[28px_52px_minmax(0,1fr)_44px_44px]" key={item.id}>
                <span className="hidden text-center text-xs tabular-nums text-muted sm:block">{String(index + 1).padStart(2, "0")}</span>
                <label className="relative grid size-11 cursor-pointer place-items-center overflow-hidden rounded-lg bg-field-deep text-muted ring-1 ring-inset ring-white/15 focus-within:ring-2 focus-within:ring-[var(--board-accent)] sm:size-13" title="Choose an item photo">
                  <input className="absolute inset-0 cursor-pointer opacity-0" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleImage(item.id, event.target.files?.[0])} aria-label={`Choose photo for item ${index + 1}`} />
                  {preview ? <img className="size-full object-cover" src={preview} alt="" decoding="async" /> : <ImagePlus size={18} aria-hidden="true" />}
                </label>
                <div className="min-w-0">
                  <input
                    className={`${CONTROL} w-full`}
                    value={item.name}
                    maxLength={80}
                    placeholder={hasImage ? "Item name" : "Item name required"}
                    onChange={(event) => updateItem(item.id, { name: event.target.value })}
                    aria-label={`Item ${index + 1} name`}
                  />
                  {hasImage && <span className="mt-1 block text-xs text-muted">Used as the accessible name; the card shows the picture only.</span>}
                </div>
                {hasImage && (
                  <button type="button" className={ICON_BUTTON} onClick={() => removeImage(item.id)} aria-label={`Remove photo from item ${index + 1}`} title="Remove photo">
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
                <button type="button" className={ICON_BUTTON} onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))} disabled={items.length <= 1} aria-label={`Remove item ${index + 1}`} title="Remove item">
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
        {imageError && <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{imageError}</p>}
      </section>

      <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-5 text-sm text-muted">
        <span>Changes apply to this Activity only.</span>
        <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-action px-4 font-bold text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40" onClick={apply} disabled={!canApply}>
          <Save size={14} aria-hidden="true" /> Apply list
        </button>
      </footer>
    </section>
  );
}
