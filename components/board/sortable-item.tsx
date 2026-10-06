import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardItem } from "@/lib/board";

export default function SortableItem({
  item,
  laneLabel,
  imageUrl,
  selected,
  tierColor,
  canDrag,
  onSelect,
}: {
  readonly item: BoardItem;
  readonly laneLabel: string;
  readonly imageUrl?: string;
  readonly selected: boolean;
  readonly tierColor?: string;
  readonly canDrag: boolean;
  readonly onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !canDrag });
  const hasImage = Boolean(imageUrl);

  return (
    <div
      ref={setNodeRef}
      className={`w-16 min-w-0 shrink-0 rounded-xl sm:w-20 ${isDragging ? "opacity-30" : ""}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        borderColor: selected && tierColor ? tierColor : undefined,
      }}
    >
      <button
        type="button"
        className={`relative grid aspect-square w-full select-none place-items-center overflow-hidden rounded-xl bg-raised text-center text-sm font-bold text-ink shadow-[0_5px_16px_rgba(0,0,0,.24)] transition-[transform,box-shadow] motion-reduce:transition-none ${selected ? "ring-3 ring-[var(--board-accent)] ring-offset-2 ring-offset-canvas" : ""} ${canDrag ? "cursor-grab touch-manipulation active:cursor-grabbing active:scale-[.97]" : "cursor-pointer"}`}
        onClick={onSelect}
        {...(canDrag ? attributes : {})}
        {...(canDrag ? listeners : {})}
        aria-pressed={selected}
        aria-label={`${item.name || "Image item"}, ${laneLabel}${selected ? ", selected" : ""}`}
      >
        {hasImage
          ? <img className="absolute inset-0 size-full object-cover" src={imageUrl} alt="" loading="lazy" decoding="async" draggable={false} />
          : <span className="max-w-28 overflow-hidden text-ellipsis px-2 py-3">{item.name || "Unnamed item"}</span>}
      </button>
    </div>
  );
}
