// Browser entry point: sizes the map canvas and the bottom strip.
import { STRIP_H } from "./config.ts";

const canvas = document.getElementById("map") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

document.documentElement.style.setProperty("--strip", `${STRIP_H}px`);

function resize(): void {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = innerWidth;
  const h = Math.max(120, innerHeight - STRIP_H);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#12324f";
  ctx.fillRect(0, 0, w, h);
}

addEventListener("resize", resize);
resize();
