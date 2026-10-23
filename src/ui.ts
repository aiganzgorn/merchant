// Start list, town and POI cards, clock and event feed.
// Strings are pure; the DOM is touched only inside functions, never at import.
import type { Settlement, World } from "./world.ts";
import type { Sim } from "./sim.ts";
import { settlementCard } from "./settlements.ts";
import { FEED_MAX, LEVEL_NAMES, RESOURCE_NAMES } from "./config.ts";

const DEFAULT_DEALS_HTML =
  `<div class="row"><b>капитал</b> 12 480</div>` +
  `<div class="note">сделки, предприятия и рынок — позже</div>`;

export function clockText(sim: Sim): string {
  return `день ${sim.day} · ${sim.speed === 0 ? "‖" : `×${sim.speed}`}`;
}

// Up to three resources the town's points give — the same line in the start list and the card.
export function ownedResources(world: World, s: Settlement): string {
  return [...new Set(s.pois.map((pi) => world.poi[pi].resource))]
    .slice(0, 3)
    .map((r) => RESOURCE_NAMES[r])
    .join(", ");
}

export function startListHtml(world: World): string {
  return world.settlements
    .filter((s) => !s.abandoned)
    .sort((a, b) => b.population - a.population)
    .map(
      (s) =>
        `<button class="start-item" type="button" data-x="${s.x}" data-y="${s.y}">` +
        `<b>${s.name}</b><span class="meta">${LEVEL_NAMES[s.level]} · ${Math.round(s.population)}</span>` +
        `<span class="res">${ownedResources(world, s) || "нет угодий"}</span></button>`,
    )
    .join("");
}

export function settlementCardHtml(world: World, s: Settlement): string {
  const card = settlementCard(s);
  const needs = card.needs
    .map((n) => {
      const mark = n.ok ? "✓" : "×";
      const amount = n.water ? (n.ok ? "есть" : "нет") : `${Math.floor(n.have)}/${Math.ceil(n.need)}`;
      return `<div class="row">${mark} ${n.label} · ${amount}</div>`;
    })
    .join("");
  return (
    `<div class="row"><b>${s.name}</b> · ${card.levelName}${s.abandoned ? " · заброшен" : ""}</div>` +
    `<div class="row">население ${Math.round(s.population)} · домов ${s.buildings.houses}</div>` +
    `<div class="row">угодья: ${ownedResources(world, s) || "нет"}</div>` +
    needs
  );
}

export function showSettlement(world: World, s: Settlement | null): void {
  const body = document.getElementById("deals-body");
  if (!body) return;
  body.innerHTML = s ? settlementCardHtml(world, s) : DEFAULT_DEALS_HTML;
}

export function pushEvent(text: string): void {
  const feed = document.getElementById("feed");
  if (!feed) return;
  const row = document.createElement("div");
  row.className = "row";
  row.textContent = text;
  feed.querySelector(".head")?.after(row);
  const rows = feed.querySelectorAll(".row");
  for (let i = FEED_MAX; i < rows.length; i++) rows[i].remove();
}
