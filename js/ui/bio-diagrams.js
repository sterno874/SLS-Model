/**
 * Biology tab — interactive pathway highlights and diagram legends.
 * Educational schematic only; complements static inline SVG in index.html.
 */

function q(root, sel) {
  return (root || document).querySelector(sel);
}

function qa(root, sel) {
  return Array.from((root || document).querySelectorAll(sel));
}

/** Wire CDK9 diagram row toggle (untreated vs inhibited). */
function initCdk9Toggle(root) {
  const fig = q(root, "#bio-cdk9 .bio-figure");
  if (!fig || fig.dataset.bioInit) return;
  fig.dataset.bioInit = "1";

  const svg = q(fig, "svg");
  if (!svg) return;

  const untreated = q(svg, "#d3-untreated");
  const inhibited = q(svg, "#d3-inhibited");
  if (!untreated || !inhibited) return;

  const bar = document.createElement("div");
  bar.className = "bio-diagram-controls";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Highlight pathway state");
  bar.innerHTML =
    '<button type="button" class="p p-def bio-path-btn" data-path="both">Both pathways</button>' +
    '<button type="button" class="p bio-path-btn" data-path="untreated">Highlight untreated</button>' +
    '<button type="button" class="p bio-path-btn" data-path="inhibited">Highlight SLS-009 block</button>';
  fig.insertBefore(bar, fig.querySelector(".bio-figcaption"));

  function setPath(mode) {
    const showTop = mode === "both" || mode === "untreated";
    const showBot = mode === "both" || mode === "inhibited";
    untreated.style.opacity = showTop ? "1" : "0.22";
    inhibited.style.opacity = showBot ? "1" : "0.22";
    qa(bar, ".bio-path-btn").forEach((btn) => {
      const on = btn.dataset.path === mode;
      btn.classList.toggle("p-def", on);
      btn.classList.toggle("active", on);
    });
  }

  bar.addEventListener("click", (e) => {
    const btn = e.target.closest(".bio-path-btn");
    if (!btn) return;
    setPath(btn.dataset.path);
  });
  setPath("both");
}

/** Hover highlight on GPS flow nodes. */
function initGpsHover(root) {
  const fig = q(root, "#bio-gps .bio-figure");
  if (!fig || fig.dataset.gpsHover) return;
  fig.dataset.gpsHover = "1";
  const svg = q(fig, "svg.bio-svg");
  if (!svg) return;

  const nodes = qa(svg, "[data-bio-node]");
  const tip = document.createElement("div");
  tip.className = "bio-tooltip";
  tip.hidden = true;
  fig.appendChild(tip);

  nodes.forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("mouseenter", () => {
      const label = el.getAttribute("data-bio-tip") || el.getAttribute("data-bio-node");
      if (!label) return;
      tip.textContent = label;
      tip.hidden = false;
      el.classList.add("bio-node-active");
    });
    el.addEventListener("mouseleave", () => {
      tip.hidden = true;
      el.classList.remove("bio-node-active");
    });
  });
}

/** Immune cascade dual-apoptosis highlight. */
function initDualApoptosis(root) {
  const fig = q(root, "#bio-sls .bio-figure");
  if (!fig || fig.dataset.dualInit) return;
  fig.dataset.dualInit = "1";
  const svg = q(fig, "svg");
  if (!svg) return;

  const ven = q(svg, "#d4-ven-block");
  const sls = q(svg, "#d4-sls-block");
  const outcome = q(svg, "#d4-outcome");
  if (!ven || !sls) return;

  const bar = document.createElement("div");
  bar.className = "bio-diagram-controls";
  bar.innerHTML =
    '<button type="button" class="p p-def bio-path-btn" data-guard="both">Dual blockade</button>' +
    '<button type="button" class="p bio-path-btn" data-guard="bcl2">BCL-2 only (ven)</button>' +
    '<button type="button" class="p bio-path-btn" data-guard="mcl1">MCL-1 only (SLS)</button>';
  fig.insertBefore(bar, fig.querySelector(".bio-figcaption"));

  function setGuard(mode) {
    ven.style.opacity = mode === "mcl1" ? "0.25" : "1";
    sls.style.opacity = mode === "bcl2" ? "0.25" : "1";
    if (outcome) {
      outcome.style.opacity = mode === "both" ? "1" : "0.45";
    }
    qa(bar, ".bio-path-btn").forEach((btn) => {
      const on = btn.dataset.guard === mode;
      btn.classList.toggle("p-def", on);
      btn.classList.toggle("active", on);
    });
  }

  bar.addEventListener("click", (e) => {
    const btn = e.target.closest(".bio-path-btn");
    if (!btn) return;
    setGuard(btn.dataset.guard);
  });
  setGuard("both");
}

/**
 * Initialize Biology tab interactive diagrams.
 * @param {ParentNode} [root]
 */
export function initBioDiagrams(root = document) {
  initCdk9Toggle(root);
  initGpsHover(root);
  initDualApoptosis(root);
}
