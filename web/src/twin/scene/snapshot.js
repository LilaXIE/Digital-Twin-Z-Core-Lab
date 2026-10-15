// Snapshot export (section 13.10): the current view at 2× resolution plus a clean information
// strip drawn with Canvas 2D (html2canvas cannot reproduce backdrop-filter, so it is not used).
import { getRenderer, getCanvas, renderNow, resize } from "./viewer.js";

function hongKongStamp(timeMs) {
  const local = new Date(timeMs + 8 * 3600000);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    file: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}_${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}`,
    label: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())} HKT`,
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// info: { room, theme, values: [{ label, value, unit, status, color }], demo, replayLabel, footer, timeMs, skyTop, skyBottom, dark, font }
export async function captureSnapshot(info) {
  const renderer = getRenderer();
  const canvas = getCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const previousRatio = renderer.getPixelRatio();
  renderer.setPixelRatio(2);
  renderer.setSize(width, height, false);
  renderNow();
  const out = document.createElement("canvas");
  out.width = width * 2;
  out.height = height * 2;
  const ctx = out.getContext("2d");
  // The canvas is transparent; paint the same sky gradient the page shows behind it.
  const sky = ctx.createLinearGradient(0, 0, 0, out.height);
  sky.addColorStop(0, info.skyTop);
  sky.addColorStop(1, info.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0, out.width, out.height); // same task as the render, so the buffer is intact
  renderer.setPixelRatio(previousRatio);
  resize();

  const scale = 2;
  const text = info.dark ? "#eef1f5" : "#12161d";
  const muted = info.dark ? "rgba(238,241,245,0.7)" : "rgba(18,22,29,0.62)";
  const panel = info.dark ? "rgba(22,24,28,0.86)" : "rgba(250,251,253,0.9)";
  const stamp = hongKongStamp(info.timeMs);
  const pad = 24 * scale;
  ctx.save();
  ctx.fillStyle = panel;
  roundRect(ctx, pad, pad, 420 * scale, (98 + info.values.length * 0) * scale, 22 * scale);
  ctx.fill();
  ctx.fillStyle = text;
  ctx.font = `600 ${26 * scale}px ${info.font}`;
  ctx.fillText(info.room, pad + 22 * scale, pad + 40 * scale);
  ctx.font = `500 ${13 * scale}px ${info.font}`;
  ctx.fillStyle = muted;
  ctx.fillText(`${stamp.label} · ${info.theme}`, pad + 22 * scale, pad + 64 * scale);
  ctx.fillText(info.subtitle, pad + 22 * scale, pad + 84 * scale);
  // Status values along the bottom.
  const chipY = out.height - pad - 64 * scale;
  let x = pad;
  for (const item of info.values) {
    ctx.font = `300 ${28 * scale}px ${info.font}`;
    const valueWidth = ctx.measureText(item.value).width;
    ctx.font = `500 ${12 * scale}px ${info.font}`;
    const labelWidth = ctx.measureText(`${item.label} · ${item.status}`).width;
    const w = Math.max(valueWidth + ctx.measureText(item.unit).width + 30 * scale, labelWidth + 34 * scale);
    ctx.fillStyle = panel;
    roundRect(ctx, x, chipY, w, 64 * scale, 18 * scale);
    ctx.fill();
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(x + 18 * scale, chipY + 20 * scale, 4.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = muted;
    ctx.fillText(`${item.label} · ${item.status}`, x + 28 * scale, chipY + 24 * scale);
    ctx.fillStyle = text;
    ctx.font = `300 ${28 * scale}px ${info.font}`;
    ctx.fillText(item.value, x + 14 * scale, chipY + 54 * scale);
    ctx.font = `500 ${12 * scale}px ${info.font}`;
    ctx.fillStyle = muted;
    ctx.fillText(item.unit, x + 18 * scale + valueWidth, chipY + 54 * scale);
    x += w + 10 * scale;
  }
  ctx.font = `500 ${12 * scale}px ${info.font}`;
  ctx.fillStyle = muted;
  ctx.textAlign = "right";
  ctx.fillText(info.footer, out.width - pad, out.height - pad);
  ctx.textAlign = "left";
  if (info.demo || info.replayLabel) {
    const label = info.demo ? info.demo : info.replayLabel;
    ctx.font = `600 ${15 * scale}px ${info.font}`;
    const w = ctx.measureText(label).width + 36 * scale;
    ctx.fillStyle = info.demo ? "rgba(217,115,13,0.92)" : "rgba(79,70,229,0.92)";
    roundRect(ctx, (out.width - w) / 2, pad, w, 36 * scale, 18 * scale);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(label, out.width / 2, pad + 24 * scale);
    ctx.textAlign = "left";
    if (info.demo) {
      // Diagonal watermark across the image.
      ctx.translate(out.width / 2, out.height / 2);
      ctx.rotate(-Math.PI / 9);
      ctx.font = `700 ${120 * scale}px ${info.font}`;
      ctx.fillStyle = "rgba(217,115,13,0.08)";
      ctx.textAlign = "center";
      ctx.fillText(info.demo, 0, 0);
    }
  }
  ctx.restore();
  const blob = await new Promise((resolve) => out.toBlob(resolve, "image/png"));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ZB202_${stamp.file}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { thumbnail: out.toDataURL("image/jpeg", 0.5), filename: link.download };
}
