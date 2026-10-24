// Start list, town and POI cards, clock and event feed.
// Strings are pure; the DOM is touched only inside functions, never at import.
import type { Settlement, World } from "./world.ts";
import type { Sim } from "./sim.ts";
import { settlementCard } from "./settlements.ts";
import { roadsOf } from "./roads.ts";
import { FEED_MAX, LEVEL_NAMES, RESOURCE_NAMES } from "./config.ts";
import { marketPrices } from "./market.ts";
import {
  type Player, sellPrice, cargoUnits, canTrade, canTravel,
} from "./player.ts";

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// The line under a town's name on the map: people, houses, enterprises.
export function townSubline(s: Settlement): string {
  const people = Math.round(s.population);
  const houses = s.buildings.houses;
  const firms = s.buildings.admin + s.buildings.industry + s.buildings.trade;
  return `${people} ${plural(people, "душа", "души", "душ")} · ${houses} ${plural(houses, "дом", "дома", "домов")} · ${firms} предпр.`;
}

const money = (n: number): string => Math.round(n).toLocaleString("ru-RU");

export function cargoLine(p: Player): string {
  const parts: string[] = [];
  for (let r = 0; r < p.cargo.length; r++) {
    if (p.cargo[r] >= 1) parts.push(`${RESOURCE_NAMES[r]}\u00a0${Math.round(p.cargo[r])}`);
  }
  return parts.length ? parts.join(" · ") : "пусто";
}

// What the merchant has and where he stands, shown when no town is selected.
export function playerPanelHtml(world: World, p: Player): string {
  const here = world.settlements[p.at];
  if (p.journey) {
    const to = world.settlements[p.journey.to];
    return (
      `<div class="row"><b>в пути</b> · до ${to.name}, ${p.journey.left} дн</div>` +
      `<div class="row">капитал ${money(p.capital)}</div>` +
      `<div class="row">груз: ${cargoLine(p)}</div>`
    );
  }
  return (
    `<div class="row"><b>капитал</b> ${money(p.capital)}</div>` +
    `<div class="row">стою в ${here.name} · ${LEVEL_NAMES[here.level]}</div>` +
    `<div class="row">груз (${cargoUnits(p)}): ${cargoLine(p)}</div>` +
    `<div class="note">клик по городу — рынок и дороги</div>`
  );
}

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

export function settlementCardHtml(world: World, s: Settlement, p: Player): string {
  const card = settlementCard(s);
  const index = world.settlements.indexOf(s);
  const here = p.at === index && canTrade(p);
  // One wrapping line instead of one row per need: the card has to fit the strip.
  const needs = card.needs
    .map((n) => {
      const mark = n.ok ? "✓" : "×";
      const amount = n.water ? (n.ok ? "есть" : "нет") : `${Math.floor(n.have)}/${Math.ceil(n.need)}`;
      return `${mark} ${n.label}\u00a0${amount}`;
    })
    .join(" · ");
  // Roads are buttons: a click walks the merchant there, one day per road day.
  const links = roadsOf(world, index)
    .map((l) => {
      const to = world.settlements.indexOf(l.other);
      const live = canTravel(world, p, to);
      return `<button class="go" type="button" data-to="${to}"${live ? "" : " disabled"}>${l.other.name} ${l.days}\u00a0дн</button>`;
    })
    .join(" ");

  // Market: at the town you stand in, every price is a buy button; elsewhere it is just a price.
  const market = marketPrices(s)
    .map((row) => {
      const name = RESOURCE_NAMES[row.resource];
      if (!here) return `${name}\u00a0${row.price}`;
      const sell = sellPrice(world, p, row.resource);
      return `<button class="buy" type="button" data-r="${row.resource}" title="купить за ${row.price}, продать за ${sell}">` +
        `${name}\u00a0${row.price}</button>`;
    })
    .join(" ");

  const trip = p.journey
    ? `<div class="row"><b>в пути</b> · ${world.settlements[p.journey.to].name}, ${p.journey.left} дн</div>`
    : "";

  return (
    `<div class="row"><b>${s.name}</b> · ${card.levelName}${s.abandoned ? " · заброшен" : ""}</div>` +
    `<div class="row">население ${Math.round(s.population)} · домов ${s.buildings.houses}</div>` +
    `<div class="row">угодья: ${ownedResources(world, s) || "нет"}</div>` +
    `<div class="row market">${needs}</div>` +
    trip +
    `<div class="row market">${here ? "рынок (клик — купить): " : "рынок: "}${market}</div>` +
    (here ? `<div class="row">капитал ${money(p.capital)} · груз: ${cargoLine(p)}</div>` : "") +
    (here ? `<button class="sell-all" type="button">продать всё</button>` : "") +
    (links ? `<div class="row market">дороги: ${links}</div>` : "")
  );
}

export function showSettlement(world: World, s: Settlement | null, p: Player): void {
  const body = document.getElementById("deals-body");
  if (!body) return;
  body.innerHTML = s ? settlementCardHtml(world, s, p) : playerPanelHtml(world, p);
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
