export function createActionGate() {
  const active = new Set();
  return {
    busy: (key) => active.has(key),
    claim(key) {
      if (active.has(key)) return null;
      active.add(key);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active.delete(key);
      };
    },
  };
}

export function setButtonPending(button, label = "Đang xử lý…") {
  const disabled = button.disabled;
  const busy = button.getAttribute("aria-busy");
  const children = [...button.childNodes];
  const original = button.ownerDocument.createElement("span");
  original.className = "ui-button-original";
  original.append(...children);
  const pending = button.ownerDocument.createElement("span");
  pending.className = "ui-button-pending";
  const spinner = button.ownerDocument.createElement("span");
  spinner.className = "ui-spinner";
  spinner.setAttribute("aria-hidden", "true");
  pending.append(spinner, button.ownerDocument.createTextNode(label));
  original.setAttribute("aria-hidden", "true");
  button.replaceChildren(original, pending);
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    button.replaceChildren(...children);
    button.disabled = disabled;
    if (busy === null) button.removeAttribute("aria-busy");
    else button.setAttribute("aria-busy", busy);
  };
}

export function createToasts(doc = document) {
  const region = doc.createElement("div");
  region.className = "ui-toasts";
  region.setAttribute("aria-live", "polite");
  region.setAttribute("aria-relevant", "additions");
  const entries = new Map();
  function dismiss(key) {
    const entry = entries.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.node.remove();
    entries.delete(key);
  }
  function show(tone, message, { duration, description = "" } = {}) {
    const key = `${tone}:${message}:${description}`;
    const parent = doc.querySelector("dialog[open]") || doc.body;
    if (region.parentElement !== parent) parent.append(region);
    if (entries.has(key)) return () => dismiss(key);
    if (entries.size >= 3) dismiss(entries.keys().next().value);
    const node = doc.createElement("div");
    node.className = "ui-toast";
    node.dataset.tone = ["info", "success", "warning", "error"].includes(tone)
      ? tone
      : "info";
    node.setAttribute("role", "status");
    const content = doc.createElement("div");
    const title = doc.createElement("strong");
    title.textContent = message;
    content.append(title);
    if (description) {
      const detail = doc.createElement("p");
      detail.textContent = description;
      content.append(detail);
    }
    const close = doc.createElement("button");
    close.type = "button";
    close.className = "ui-toast-close";
    close.setAttribute("aria-label", "Đóng thông báo");
    close.textContent = "×";
    close.addEventListener("click", () => dismiss(key));
    node.append(content, close);
    region.append(node);
    const entry = { node, timer: null };
    entries.set(key, entry);
    const ms = duration ?? (tone === "error" ? 8000 : 4000);
    const schedule = () => {
      clearTimeout(entry.timer);
      if (ms > 0 && !node.matches(":hover, :focus-within"))
        entry.timer = setTimeout(() => dismiss(key), ms);
    };
    const pause = () => clearTimeout(entry.timer);
    node.addEventListener("mouseenter", pause);
    node.addEventListener("mouseleave", schedule);
    node.addEventListener("focusin", pause);
    node.addEventListener("focusout", schedule);
    schedule();
    return () => dismiss(key);
  }
  return {
    show,
    destroy() {
      for (const key of entries.keys()) dismiss(key);
      region.remove();
    },
  };
}
