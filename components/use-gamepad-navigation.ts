import { useEffect } from "react";

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

function visibleElements(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && element.getAttribute("aria-hidden") !== "true";
  });
}

function moveFocus(dx: number, dy: number): void {
  const elements = visibleElements();
  if (elements.length === 0) return;
  const current = document.activeElement instanceof HTMLElement && elements.includes(document.activeElement)
    ? document.activeElement
    : null;
  if (current === null) {
    elements[0]?.focus();
    return;
  }
  const origin = current.getBoundingClientRect();
  const ox = origin.left + origin.width / 2;
  const oy = origin.top + origin.height / 2;
  const candidate = elements
    .filter((element) => element !== current)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2 - ox;
      const y = rect.top + rect.height / 2 - oy;
      const forward = dx !== 0 ? x * dx : y * dy;
      const cross = dx !== 0 ? Math.abs(y) : Math.abs(x);
      return { element, forward, score: forward + cross * 2.5 };
    })
    .filter(({ forward }) => forward > 8)
    .sort((a, b) => a.score - b.score)[0]?.element;
  candidate?.focus({ preventScroll: true });
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  candidate?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduceMotion ? "instant" : "smooth" });
}

export function useGamepadNavigation(): void {
  useEffect(() => {
    let frame = 0;
    let previous = new Set<string>();
    const poll = () => {
      const gamepad = navigator.getGamepads?.().find((entry): entry is Gamepad => entry !== null);
      if (gamepad) {
        const pressed = new Set<string>();
        const axisX = gamepad.axes[0] ?? 0;
        const axisY = gamepad.axes[1] ?? 0;
        if (gamepad.buttons[12]?.pressed || axisY < -0.65) pressed.add("up");
        if (gamepad.buttons[13]?.pressed || axisY > 0.65) pressed.add("down");
        if (gamepad.buttons[14]?.pressed || axisX < -0.65) pressed.add("left");
        if (gamepad.buttons[15]?.pressed || axisX > 0.65) pressed.add("right");
        if (gamepad.buttons[0]?.pressed) pressed.add("confirm");
        if (gamepad.buttons[1]?.pressed) pressed.add("back");
        for (const action of pressed) {
          if (previous.has(action)) continue;
          if (action === "up") moveFocus(0, -1);
          if (action === "down") moveFocus(0, 1);
          if (action === "left") moveFocus(-1, 0);
          if (action === "right") moveFocus(1, 0);
          if (action === "confirm" && document.activeElement instanceof HTMLElement) document.activeElement.click();
          if (action === "back") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        }
        previous = pressed;
      } else {
        previous.clear();
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, []);
}
