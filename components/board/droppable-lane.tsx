import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";

export default function DroppableLane({
  id,
  className,
  label,
  children,
}: {
  readonly id: string;
  readonly className: string;
  readonly label: string;
  readonly children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `lane:${id}` });
  return (
    <section
      ref={setNodeRef}
      className={`${className} ${isOver ? "ring-3 ring-[var(--board-accent)] ring-offset-2 ring-offset-canvas" : ""}`}
      aria-label={label}
    >
      {children}
    </section>
  );
}
