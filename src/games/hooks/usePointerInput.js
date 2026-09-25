import { useCallback, useRef } from "react";

/**
 * Unifies mouse + touch dragging behind the Pointer Events API so a single
 * set of handlers works for both input types. Spread the returned object
 * onto the element that should be draggable.
 */
export function usePointerInput({ onStart, onMove, onEnd } = {}) {
  const activeId = useRef(null);

  const point = (e) => ({ x: e.clientX, y: e.clientY });

  const onPointerDown = useCallback(
    (e) => {
      activeId.current = e.pointerId;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      onStart?.(point(e), e);
    },
    [onStart],
  );

  const onPointerMove = useCallback(
    (e) => {
      if (activeId.current !== e.pointerId) return;
      onMove?.(point(e), e);
    },
    [onMove],
  );

  const onPointerEnd = useCallback(
    (e) => {
      if (activeId.current !== e.pointerId) return;
      activeId.current = null;
      onEnd?.(point(e), e);
    },
    [onEnd],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
  };
}
