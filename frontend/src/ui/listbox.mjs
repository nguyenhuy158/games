const STYLE_ID = "ui-listbox-css";
const POPUP_MAX_HEIGHT = 256;
const POPUP_GAP = 4;
const OPEN_KEYS = ["Enter", " ", "ArrowDown", "ArrowUp"];
const MOVE_KEYS = ["ArrowDown", "ArrowUp", "Home", "End"];
const PICK_KEYS = ["Enter", " "];
const CLOSE_KEYS = ["Escape", "Tab"];
const CHEVRON = '<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M6 8l4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK = '<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 10.5l3 3 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CSS = `
.ui-listbox { position: relative; display: block; min-width: 0; }
.ui-listbox > select { position: absolute; width: 1px; height: 1px; min-height: 0; margin: -1px; padding: 0; border: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; opacity: 0; pointer-events: none; }
.ui-listbox button.ui-listbox-trigger { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; min-height: 44px; margin: 0; padding: 0 12px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-surface); color: var(--ui-fg); font: inherit; font-size: 15px; font-weight: 400; text-align: start; box-shadow: none; cursor: pointer; transition: border-color var(--ui-dur-fast) var(--ui-ease-out), box-shadow var(--ui-dur-fast) var(--ui-ease-out); }
.ui-listbox button.ui-listbox-trigger:focus-visible, .ui-listbox button.ui-listbox-trigger[aria-expanded="true"] { outline: none; border-color: var(--ui-primary); box-shadow: 0 0 0 2px var(--ui-ring); }
.ui-listbox button.ui-listbox-trigger:disabled { cursor: not-allowed; opacity: .6; }
.ui-listbox-trigger > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-listbox-trigger > svg { flex: none; width: 16px; height: 16px; color: var(--ui-fg-muted); transition: transform var(--ui-dur-fast) var(--ui-ease-out); }
.ui-listbox-trigger[aria-expanded="true"] > svg { transform: rotate(180deg); }
.ui-listbox-popup { position: fixed; z-index: 1000; box-sizing: border-box; max-height: ${POPUP_MAX_HEIGHT}px; overflow-y: auto; overscroll-behavior: contain; padding: 4px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-surface); color: var(--ui-fg); box-shadow: var(--ui-shadow-lg); animation: ui-listbox-in var(--ui-dur-fast) var(--ui-ease-out); }
.ui-listbox-popup button.ui-listbox-option { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; margin: 0; padding: 8px 10px; border: 0; border-radius: calc(var(--ui-radius) - 4px); background: transparent; color: var(--ui-fg); font: inherit; font-size: 14px; font-weight: 400; text-align: start; box-shadow: none; cursor: pointer; }
.ui-listbox-popup button.ui-listbox-option.active { background: var(--ui-surface-muted); }
.ui-listbox-popup button.ui-listbox-option[aria-selected="true"] { color: var(--ui-primary); font-weight: 600; }
.ui-listbox-popup button.ui-listbox-option:disabled { opacity: .4; cursor: not-allowed; }
.ui-listbox-popup button.ui-listbox-option > span { flex: 1; min-width: 0; white-space: normal; overflow-wrap: anywhere; line-height: 1.35; }
.ui-listbox-option > svg { flex: none; width: 16px; height: 16px; visibility: hidden; }
.ui-listbox-option[aria-selected="true"] > svg { visibility: visible; }
@keyframes ui-listbox-in { from { opacity: 0; transform: translateY(-0.5rem); } }
@media (prefers-reduced-motion: reduce) { .ui-listbox-popup { animation: none; } .ui-listbox-trigger > svg { transition: none; } }
`;

let nextId = 0;

function trackProperty(select, name, onSet) {
  const native = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, name);
  Object.defineProperty(select, name, {
    configurable: true,
    get: () => native.get.call(select),
    set: (value) => { native.set.call(select, value); onSet(); },
  });
}

export function listbox(select) {
  const doc = select.ownerDocument;
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.append(style);
  }
  const id = `ui-listbox-${++nextId}`;
  const wrapper = doc.createElement("span");
  wrapper.className = "ui-listbox";
  const trigger = doc.createElement("button");
  trigger.type = "button";
  trigger.className = "ui-listbox-trigger";
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const label = select.getAttribute("aria-label");
  if (label) trigger.setAttribute("aria-label", label);
  const text = doc.createElement("span");
  trigger.append(text);
  trigger.insertAdjacentHTML("beforeend", CHEVRON);
  select.parentNode?.insertBefore(wrapper, select);
  wrapper.append(trigger, select);
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  let popup = null;
  let active = -1;
  const options = () => [...select.options];
  const enabled = () => options().flatMap((option, index) => (option.disabled ? [] : [index]));

  const render = () => {
    text.textContent = select.selectedOptions[0]?.textContent ?? "";
    trigger.disabled = select.disabled;
    if (select.disabled) close();
  };

  const paintActive = () => {
    if (!popup) return;
    for (const [index, item] of [...popup.children].entries()) item.classList.toggle("active", index === active);
    const current = popup.children[active];
    if (current) {
      trigger.setAttribute("aria-activedescendant", current.id);
      current.scrollIntoView({ block: "nearest" });
    } else trigger.removeAttribute("aria-activedescendant");
  };

  const place = () => {
    const rect = trigger.getBoundingClientRect();
    const below = innerHeight - rect.bottom - POPUP_GAP;
    const above = rect.top - POPUP_GAP;
    const height = Math.min(popup.scrollHeight, POPUP_MAX_HEIGHT);
    const up = below < height && above > below;
    popup.style.left = `${rect.left}px`;
    popup.style.width = `${rect.width}px`;
    popup.style.maxHeight = `${Math.min(POPUP_MAX_HEIGHT, up ? above : below)}px`;
    popup.style.top = up ? "" : `${rect.bottom + POPUP_GAP}px`;
    popup.style.bottom = up ? `${innerHeight - rect.top + POPUP_GAP}px` : "";
  };

  const pick = (index) => {
    const option = select.options[index];
    if (!option || option.disabled) return;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index;
    close();
    trigger.focus();
    if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const dismiss = (event) => { if (!wrapper.contains(event.target) && !popup?.contains(event.target)) close(); };
  const reposition = (event) => { if (!popup?.contains(event.target)) close(); };

  function close() {
    if (!popup) return;
    popup.remove();
    popup = null;
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-controls");
    trigger.removeAttribute("aria-activedescendant");
    doc.removeEventListener("pointerdown", dismiss, true);
    doc.removeEventListener("scroll", reposition, true);
    removeEventListener("resize", close);
  }

  const open = () => {
    if (popup || select.disabled) return;
    popup = doc.createElement("div");
    popup.id = id;
    popup.className = "ui-listbox-popup";
    popup.setAttribute("role", "listbox");
    if (label) popup.setAttribute("aria-label", label);
    for (const [index, option] of options().entries()) {
      const item = doc.createElement("button");
      item.type = "button";
      item.tabIndex = -1;
      item.id = `${id}-${index}`;
      item.className = "ui-listbox-option";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.selected));
      item.disabled = option.disabled;
      const name = doc.createElement("span");
      name.textContent = option.textContent;
      item.append(name);
      item.insertAdjacentHTML("beforeend", CHECK);
      item.onclick = () => pick(index);
      item.onpointerenter = () => { if (!option.disabled) { active = index; paintActive(); } };
      popup.append(item);
    }
    (trigger.closest("dialog") ?? doc.body).append(popup);
    active = enabled().includes(select.selectedIndex) ? select.selectedIndex : (enabled()[0] ?? -1);
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", id);
    place();
    paintActive();
    doc.addEventListener("pointerdown", dismiss, true);
    doc.addEventListener("scroll", reposition, true);
    addEventListener("resize", close);
  };

  trigger.onclick = () => (popup ? close() : open());
  trigger.onkeydown = (event) => {
    if (!popup) {
      if (OPEN_KEYS.includes(event.key)) { event.preventDefault(); open(); }
      return;
    }
    if (MOVE_KEYS.includes(event.key)) {
      event.preventDefault();
      const list = enabled();
      const at = list.indexOf(active);
      const next = event.key === "Home" ? 0 : event.key === "End" ? list.length - 1 : Math.max(0, Math.min(list.length - 1, at + (event.key === "ArrowDown" ? 1 : -1)));
      active = list[next] ?? -1;
      paintActive();
    } else if (PICK_KEYS.includes(event.key)) {
      event.preventDefault();
      pick(active);
    } else if (CLOSE_KEYS.includes(event.key)) {
      if (event.key === "Escape") event.preventDefault();
      close();
    }
  };

  trackProperty(select, "value", render);
  trackProperty(select, "selectedIndex", render);
  new MutationObserver(render).observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["disabled", "selected"] });
  select.addEventListener("change", render);
  render();
  return wrapper;
}
