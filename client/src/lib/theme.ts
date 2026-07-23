export type Paper =
  | "system"
  | "cream"
  | "linen"
  | "sage"
  | "parchment"
  | "rose"
  | "mist"
  | "ink"
  | "slate"
  | "pine"
  | "espresso";

export type Ink =
  | "blue"
  | "green"
  | "clay"
  | "plum"
  | "marigold"
  | "teal"
  | "indigo"
  | "copper"
  | "custom";

export interface PaperOption {
  id: Paper;
  label: string;
  swatch: string;
  shade?: "light" | "dark";
}

export const papers: PaperOption[] = [
  { id: "system", label: "Follow system", swatch: "linear-gradient(90deg, #faf8f3 50%, #15140f 50%)" },
  { id: "cream", label: "Cream", swatch: "#faf8f3", shade: "light" },
  { id: "linen", label: "Cool Linen", swatch: "#f6f7f9", shade: "light" },
  { id: "sage", label: "Sage", swatch: "#f1f3ec", shade: "light" },
  { id: "parchment", label: "Parchment", swatch: "#f7efe1", shade: "light" },
  { id: "rose", label: "Rose", swatch: "#f8f1ef", shade: "light" },
  { id: "mist", label: "Mist", swatch: "#f2f3f7", shade: "light" },
  { id: "ink", label: "Ink", swatch: "#15140f", shade: "dark" },
  { id: "slate", label: "Slate", swatch: "#171a1e", shade: "dark" },
  { id: "pine", label: "Pine", swatch: "#131a16", shade: "dark" },
  { id: "espresso", label: "Espresso", swatch: "#1a1512", shade: "dark" },
];

export const inks: { id: Exclude<Ink, "custom">; label: string; swatch: string }[] = [
  { id: "blue", label: "Blue", swatch: "#2a5fb8" },
  { id: "green", label: "Green", swatch: "#47714b" },
  { id: "clay", label: "Clay", swatch: "#a8593a" },
  { id: "plum", label: "Plum", swatch: "#7b4a6e" },
  { id: "marigold", label: "Marigold", swatch: "#8a6a1b" },
  { id: "teal", label: "Teal", swatch: "#226d6a" },
  { id: "indigo", label: "Indigo", swatch: "#45499a" },
  { id: "copper", label: "Copper", swatch: "#9c5b28" },
];

const DARK_PAPERS = new Set<Paper>(["ink", "slate", "pine", "espresso"]);

const PAPER_KEY = "fintrackr.paper";
const INK_KEY = "fintrackr.ink";
const DAY_KEY = "fintrackr.day";
const NIGHT_KEY = "fintrackr.night";
const CUSTOM_KEY = "fintrackr.customAccent";
const STAMP_KEY = "fintrackr.themeStamp";
const dark = window.matchMedia("(prefers-color-scheme: dark)");

/** When this device last chose its look; guards against stale server snapshots. */
function getStamp(): number {
  return Number(localStorage.getItem(STAMP_KEY)) || 0;
}

function stamp() {
  localStorage.setItem(STAMP_KEY, String(Date.now()));
}

export function getPaper(): Paper {
  return (localStorage.getItem(PAPER_KEY) as Paper) ?? "system";
}

export function getInk(): Ink {
  return (localStorage.getItem(INK_KEY) as Ink) ?? "blue";
}

/** Which paper "Follow system" resolves to in the light. */
export function getDayPaper(): Paper {
  return (localStorage.getItem(DAY_KEY) as Paper) ?? "cream";
}

/** Which paper "Follow system" resolves to after dark. */
export function getNightPaper(): Paper {
  return (localStorage.getItem(NIGHT_KEY) as Paper) ?? "ink";
}

export function getCustomAccent(): string {
  return localStorage.getItem(CUSTOM_KEY) ?? "#2a5fb8";
}

export function setPaper(paper: Paper) {
  localStorage.setItem(PAPER_KEY, paper);
  stamp();
  applyTheme();
}

export function setInk(ink: Ink) {
  localStorage.setItem(INK_KEY, ink);
  stamp();
  applyTheme();
}

export function setDayPaper(paper: Paper) {
  localStorage.setItem(DAY_KEY, paper);
  stamp();
  applyTheme();
}

export function setNightPaper(paper: Paper) {
  localStorage.setItem(NIGHT_KEY, paper);
  stamp();
  applyTheme();
}

export function setCustomAccent(hex: string) {
  localStorage.setItem(CUSTOM_KEY, hex);
  localStorage.setItem(INK_KEY, "custom");
  stamp();
  applyTheme();
}

export function applyTheme() {
  const paper = getPaper();
  const resolved =
    paper === "system" ? (dark.matches ? getNightPaper() : getDayPaper()) : paper;
  const shade = DARK_PAPERS.has(resolved) ? "dark" : "light";
  const ink = getInk();
  const root = document.documentElement;
  root.dataset.paper = resolved;
  root.dataset.shade = shade;
  root.dataset.ink = ink;

  // A custom accent is set inline; dark papers get a lightened mix so it
  // reads as ink, not glare. Named inks come from the stylesheet.
  if (ink === "custom") {
    const hex = getCustomAccent();
    root.style.setProperty(
      "--accent",
      shade === "dark" ? `color-mix(in oklab, ${hex}, white 35%)` : hex,
    );
  } else {
    root.style.removeProperty("--accent");
  }

  // Keep the PWA titlebar/status bar the same color as the paper.
  const themeColor = getComputedStyle(root).getPropertyValue("--paper").trim();
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", themeColor);
}

/** The whole look as one string, stored on the account so devices agree. */
export function themeSnapshot(): string {
  return JSON.stringify({
    paper: getPaper(),
    ink: getInk(),
    day: getDayPaper(),
    night: getNightPaper(),
    customAccent: getCustomAccent(),
    updatedAt: getStamp(),
  });
}

/** True when the account snapshot already matches this device's look. */
export function themeMatches(snapshot: string | null): boolean {
  if (!snapshot) return false;
  try {
    const theme = JSON.parse(snapshot);
    return (
      theme.paper === getPaper() &&
      theme.ink === getInk() &&
      theme.day === getDayPaper() &&
      theme.night === getNightPaper() &&
      theme.customAccent === getCustomAccent()
    );
  } catch {
    return false;
  }
}

/** Back to Cream & Blue — called on sign-out so looks never leak between accounts. */
export function resetThemeToDefaults() {
  for (const key of [PAPER_KEY, INK_KEY, DAY_KEY, NIGHT_KEY, CUSTOM_KEY, STAMP_KEY])
    localStorage.removeItem(key);
  applyTheme();
}

/** Adopt a snapshot from the account (e.g. chosen on another device). */
export function adoptTheme(snapshot: string | null) {
  if (!snapshot) return;
  try {
    const theme = JSON.parse(snapshot) as Partial<{
      paper: Paper;
      ink: Ink;
      day: Paper;
      night: Paper;
      customAccent: string;
      updatedAt: number;
    }>;
    // A stale snapshot (offline relaunch, cached /me) never undoes newer local choices.
    if (getStamp() > 0 && (theme.updatedAt ?? 0) <= getStamp()) return;
    if (theme.updatedAt) localStorage.setItem(STAMP_KEY, String(theme.updatedAt));
    if (theme.paper) localStorage.setItem(PAPER_KEY, theme.paper);
    if (theme.ink) localStorage.setItem(INK_KEY, theme.ink);
    if (theme.day) localStorage.setItem(DAY_KEY, theme.day);
    if (theme.night) localStorage.setItem(NIGHT_KEY, theme.night);
    if (theme.customAccent) localStorage.setItem(CUSTOM_KEY, theme.customAccent);
    applyTheme();
  } catch {
    // A malformed snapshot never breaks the local look.
  }
}

export function initTheme() {
  applyTheme();
  dark.addEventListener("change", applyTheme);
}
