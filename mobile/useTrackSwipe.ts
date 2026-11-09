import { useRef, type TouchEvent, type MouseEvent } from "react";

export function useTrackSwipe(previous: () => void, next: () => void) {
  const gesture = useRef<{ id: number; x: number; y: number; at: number } | null>(null);
  const suppressClick = useRef(false);
  return {
    onTouchStart(event: TouchEvent) {
      suppressClick.current = false;
      const touch = event.touches[0];
      gesture.current = event.touches.length === 1
        ? { id: touch.identifier, x: touch.clientX, y: touch.clientY, at: Date.now() }
        : null;
    },
    onTouchMove(event: TouchEvent) {
      const start = gesture.current, touch = event.touches[0];
      if (!start) return;
      if (event.touches.length !== 1 || touch.identifier !== start.id ||
        (Math.abs(touch.clientY - start.y) > 12 && Math.abs(touch.clientY - start.y) >= Math.abs(touch.clientX - start.x))) {
        gesture.current = null;
      }
    },
    onTouchEnd(event: TouchEvent) {
      const start = gesture.current;
      gesture.current = null;
      if (!start || event.touches.length || event.changedTouches.length !== 1) return;
      const touch = event.changedTouches[0];
      if (touch.identifier !== start.id || Date.now() - start.at > 900) return;
      const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      suppressClick.current = true;
      if (dx < 0) next(); else previous();
    },
    onTouchCancel() { gesture.current = null; },
    onClickCapture(event: MouseEvent) {
      if (!suppressClick.current || event.detail === 0) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
