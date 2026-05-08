export function installCopyGuard() {
  const isAllowed = (target) => {
    if (!target) return false;
    let el = target;
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains(\"ryh-allow-copy\")) return true;
      el = el.parentElement;
    }
    return false;
  };
  const block = (e) => {
    if (!isAllowed(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  [\"copy\", \"cut\", \"paste\", \"contextmenu\"].forEach((ev) => {
    document.addEventListener(ev, block, true);
  });
  document.addEventListener(\"keydown\", (e) => {
    const k = e.key?.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === \"c\" || k === \"x\" || k === \"v\" || k === \"a\")) {
      if (!isAllowed(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, true);
}
