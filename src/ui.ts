// Start list, clock and event feed. Strings are pure; the feed touches the DOM only when called.
import type { World } from "./world.ts";
import type { Sim } from "./sim.ts";
import { FEED_MAX, LEVEL_NAMES, RESOURCE_NAMES } from "./config.ts";

export function clockText(sim: Sim): string {
  return `день ${sim.day} · ${sim.speed === 0 ? "‖" : `×${sim.speed}`}`;
}

export function startListHtml(world: World): string {
  const towns = world.settlements
    .filter((s) => !s.abandoned)
    .sort((a, b) => b.population - a.population);
  return towns
    .map((s) => {
      const resources = [...new Set(s.pois.map((pi) => world.poi[pi].resource))]
        .slice(0, 3)
        .map((r) => RESOURCE_NAMES[r]);
      return (
        `<button class="start-item" type="button" data-x="${s.x}" data-y="${s.y}">` +
        `<b>${s.name}</b><span class="meta">${LEVEL_NAMES[s.level]} · ${Math.round(s.population)}</span>` +
        `<span class="res">${resources.join(", ") || "нет угодий"}</span></button>`
      );
    })
    .join("");
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
