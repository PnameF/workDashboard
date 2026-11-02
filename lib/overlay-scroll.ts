export function installOverlayScrollLock(doc: Document, win: Window) {
  let stack: HTMLElement[] = [],
    restore: (() => void) | null = null,
    scheduled = false;
  let disposed = false;
  function sync() {
    if (disposed) return;
    scheduled = false;
    const active = [
      ...doc.querySelectorAll<HTMLElement>(
        "dialog[open], [popover]:popover-open",
      ),
    ];
    stack = [
      ...stack.filter((element) => active.includes(element)),
      ...active.filter((element) => !stack.includes(element)),
    ];
    if (stack.length && !restore) {
      const body = doc.body,
        root = doc.documentElement;
      const previous = {
        body: body.style.overflow,
        root: root.style.overflow,
        padding: body.style.paddingRight,
      };
      const gutter = Math.max(0, win.innerWidth - root.clientWidth);
      const padding = parseFloat(win.getComputedStyle(body).paddingRight) || 0;
      body.style.overflow = "hidden";
      root.style.overflow = "hidden";
      if (gutter) body.style.paddingRight = `${padding + gutter}px`;
      root.setAttribute("data-overlay-scroll-locked", "true");
      restore = () => {
        body.style.overflow = previous.body;
        root.style.overflow = previous.root;
        body.style.paddingRight = previous.padding;
        root.removeAttribute("data-overlay-scroll-locked");
      };
    } else if (!stack.length && restore) {
      restore();
      restore = null;
    }
  }
  function schedule() {
    if (!disposed && !scheduled) {
      scheduled = true;
      queueMicrotask(sync);
    }
  }
  function canScroll(target: EventTarget | null, dx: number, dy: number) {
    const overlay = stack[stack.length - 1];
    const node =
      target instanceof Element
        ? target instanceof HTMLElement
          ? target
          : target.parentElement
        : null;
    if (!overlay || !node || !overlay.contains(node)) return false;
    for (
      let element: HTMLElement | null = node;
      element && overlay.contains(element);
      element = element.parentElement
    ) {
      const style = win.getComputedStyle(element);
      const horizontal =
        dx &&
        /auto|scroll|overlay/.test(style.overflowX) &&
        (dx < 0
          ? element.scrollLeft > 0
          : element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
      const vertical =
        dy &&
        /auto|scroll|overlay/.test(style.overflowY) &&
        (dy < 0
          ? element.scrollTop > 0
          : element.scrollTop + element.clientHeight <
            element.scrollHeight - 1);
      if (horizontal || vertical) return true;
    }
    return false;
  }
  function wheel(event: WheelEvent) {
    if (!stack.length || event.ctrlKey) return;
    const dx = event.deltaX || (event.shiftKey ? event.deltaY : 0),
      dy = event.shiftKey ? 0 : event.deltaY;
    if (!canScroll(event.target, dx, dy)) event.preventDefault();
  }
  let touch: { x: number; y: number } | null = null;
  function touchStart(event: TouchEvent) {
    const point = event.touches[0];
    touch =
      point && event.touches.length === 1
        ? { x: point.clientX, y: point.clientY }
        : null;
  }
  function touchMove(event: TouchEvent) {
    const point = event.touches[0];
    if (!touch || !point || event.touches.length !== 1) return;
    const dx = touch.x - point.clientX,
      dy = touch.y - point.clientY;
    touch = { x: point.clientX, y: point.clientY };
    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.closest('input[type="range"], [role="slider"]') &&
      stack[stack.length - 1]?.contains(target)
    )
      return;
    if (stack.length && !canScroll(event.target, dx, dy))
      event.preventDefault();
  }
  doc.addEventListener("beforetoggle", schedule, true);
  doc.addEventListener("toggle", schedule, true);
  doc.addEventListener("wheel", wheel, { capture: true, passive: false });
  doc.addEventListener("touchstart", touchStart, {
    capture: true,
    passive: true,
  });
  doc.addEventListener("touchmove", touchMove, {
    capture: true,
    passive: false,
  });
  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["open", "popover"],
  });
  sync();
  return () => {
    disposed = true;
    observer.disconnect();
    doc.removeEventListener("beforetoggle", schedule, true);
    doc.removeEventListener("toggle", schedule, true);
    doc.removeEventListener("wheel", wheel, true);
    doc.removeEventListener("touchstart", touchStart, true);
    doc.removeEventListener("touchmove", touchMove, true);
    stack = [];
    restore?.();
    restore = null;
  };
}
