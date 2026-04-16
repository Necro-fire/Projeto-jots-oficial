/**
 * Utility to add footer overlay to product images.
 * Applies only to Receituário, Solar, Clip-on categories.
 * Footer layout (2 lines):
 *   Line 1: Nome completo da peça
 *   Line 2: Classificação   |   Haste: XX  Lente: XX  Ponte: XX
 */

const FOOTER_CATEGORIES = ["Receituário", "Solar", "Clip-on"];
const FOOTER_RATIO = 0.09;
const MIN_FOOTER_HEIGHT = 56;
const MAX_FOOTER_SCAN_RATIO = 0.38;
const FOOTER_SEPARATOR_HEIGHT = 2;

type RowMetric = {
  darkRatio: number;
  luma: number;
};

export function shouldHaveFooter(category: string): boolean {
  return FOOTER_CATEGORIES.includes(category);
}

export const __productImageFooterTestUtils = {
  detectFooterBandStartFromMetrics,
  detectFooterSeparatorStartFromMetrics,
  getFooterHeight,
};

/**
 * Draw footer overlay on a canvas with the product image.
 * Removes any previously baked footer before applying a new one,
 * preventing accumulation when the product image is replaced.
 * Returns a Blob of the composited image (JPEG).
 */
export async function renderImageWithFooter(
  imageUrl: string,
  productName?: string,
  classificacao?: string,
  measures?: { haste?: number; lente?: number; ponte?: number },
): Promise<Blob> {
  const { canvas: cleanCanvas, width: srcW, height: cleanH } = await prepareCleanImageCanvas(imageUrl);

  const footerH = getFooterHeight(cleanH);
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = srcW;
  finalCanvas.height = cleanH + footerH;
  const finalCtx = finalCanvas.getContext("2d");
  if (!finalCtx) throw new Error("Canvas context unavailable");

  finalCtx.drawImage(cleanCanvas, 0, 0);

  const footerY = cleanH;
  finalCtx.fillStyle = "rgba(0, 0, 0, 0.60)";
  finalCtx.fillRect(0, footerY, srcW, footerH);

  // Subtle separator line used both for visual polish and reliable future cleanup.
  finalCtx.fillStyle = "rgba(0, 0, 0, 0.88)";
  finalCtx.fillRect(0, footerY, srcW, FOOTER_SEPARATOR_HEIGHT);

  const pad = Math.round(srcW * 0.04);
  const nameText = productName || "";
  if (nameText) {
    const nameFontSize = Math.max(12, Math.round(footerH * 0.35));
    finalCtx.font = `600 ${nameFontSize}px Arial, sans-serif`;
    finalCtx.fillStyle = "#ffffff";
    finalCtx.textBaseline = "middle";
    finalCtx.textAlign = "left";
    finalCtx.fillText(nameText, pad, footerY + footerH * 0.33);
  }

  const line2Parts: string[] = [];
  if (classificacao) line2Parts.push(classificacao);

  const measureParts: string[] = [];
  if (measures?.haste) measureParts.push(`Haste: ${measures.haste}`);
  if (measures?.lente) measureParts.push(`Lente: ${measures.lente}`);
  if (measures?.ponte) measureParts.push(`Ponte: ${measures.ponte}`);
  if (measureParts.length) line2Parts.push(measureParts.join("  "));

  const line2Text = line2Parts.join("   |   ");
  if (line2Text) {
    const line2FontSize = Math.max(11, Math.round(footerH * 0.28));
    finalCtx.font = `500 ${line2FontSize}px Arial, sans-serif`;
    finalCtx.fillStyle = "rgba(255, 255, 255, 0.90)";
    finalCtx.textBaseline = "middle";
    finalCtx.textAlign = "left";
    finalCtx.fillText(line2Text, pad, nameText ? footerY + footerH * 0.7 : footerY + footerH * 0.5);
  }

  return canvasToBlob(finalCanvas, "image/jpeg", 0.92);
}

export async function renderImageWithoutFooter(
  imageUrl: string,
  mimeType: "image/jpeg" | "image/png" = "image/jpeg",
): Promise<Blob> {
  const { canvas } = await prepareCleanImageCanvas(imageUrl);
  return canvasToBlob(canvas, mimeType, mimeType === "image/jpeg" ? 0.92 : undefined);
}

async function prepareCleanImageCanvas(
  imageUrl: string,
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const img = await loadImage(imageUrl);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;

  const detectCanvas = document.createElement("canvas");
  detectCanvas.width = srcW;
  detectCanvas.height = srcH;
  const detectCtx = detectCanvas.getContext("2d");
  if (!detectCtx) throw new Error("Canvas context unavailable");
  detectCtx.drawImage(img, 0, 0);

  const cropH = detectExistingFooterHeight(detectCtx, srcW, srcH);
  const cleanH = Math.max(1, srcH - cropH);

  const cleanCanvas = document.createElement("canvas");
  cleanCanvas.width = srcW;
  cleanCanvas.height = cleanH;
  const cleanCtx = cleanCanvas.getContext("2d");
  if (!cleanCtx) throw new Error("Canvas context unavailable");
  cleanCtx.drawImage(img, 0, 0, srcW, cleanH, 0, 0, srcW, cleanH);

  return { canvas: cleanCanvas, width: srcW, height: cleanH };
}

function getFooterHeight(imageHeight: number): number {
  return Math.max(MIN_FOOTER_HEIGHT, Math.round(imageHeight * FOOTER_RATIO));
}

function detectExistingFooterHeight(ctx: CanvasRenderingContext2D, width: number, height: number): number {
  const separatorStart = detectFooterSeparatorStart(ctx, width, height);
  if (separatorStart !== null) {
    return Math.max(0, height - separatorStart);
  }

  const bandStart = detectFooterBandStart(ctx, width, height);
  return bandStart === null ? 0 : Math.max(0, height - bandStart);
}

function detectFooterSeparatorStart(ctx: CanvasRenderingContext2D, width: number, height: number): number | null {
  const scanStart = getScanStart(height);
  const rawMetrics = buildRowMetrics(ctx, width, scanStart, height, false);
  return detectFooterSeparatorStartFromMetrics(rawMetrics, scanStart);
}

function detectFooterBandStart(ctx: CanvasRenderingContext2D, width: number, height: number): number | null {
  const scanStart = getScanStart(height);
  const rawMetrics = buildRowMetrics(ctx, width, scanStart, height, false);
  const metrics = smoothMetrics(rawMetrics);
  return detectFooterBandStartFromMetrics(metrics, scanStart, height, rawMetrics);
}

function getScanStart(height: number): number {
  const maxScanHeight = Math.min(Math.round(height * MAX_FOOTER_SCAN_RATIO), height - 1);
  return Math.max(0, height - maxScanHeight);
}

function buildRowMetrics(
  ctx: CanvasRenderingContext2D,
  width: number,
  startY: number,
  endY: number,
  smooth: boolean,
): RowMetric[] {
  const scanHeight = Math.max(0, endY - startY);
  if (scanHeight === 0) return [];

  const sampleStepX = Math.max(1, Math.floor(width / 180));
  const imageData = ctx.getImageData(0, startY, width, scanHeight).data;
  const metrics: RowMetric[] = [];

  for (let y = 0; y < scanHeight; y++) {
    let lumaTotal = 0;
    let darkPixels = 0;
    let samples = 0;

    for (let x = 0; x < width; x += sampleStepX) {
      const index = (y * width + x) * 4;
      const luma = getLuma(imageData[index], imageData[index + 1], imageData[index + 2]);
      lumaTotal += luma;
      if (luma < 118) darkPixels++;
      samples++;
    }

    metrics.push({
      darkRatio: samples > 0 ? darkPixels / samples : 0,
      luma: samples > 0 ? lumaTotal / samples : 255,
    });
  }

  return smooth ? smoothMetrics(metrics) : metrics;
}

function smoothMetrics(metrics: RowMetric[]): RowMetric[] {
  if (metrics.length < 3) return metrics;

  return metrics.map((_, index) => {
    const start = Math.max(0, index - 2);
    const end = Math.min(metrics.length, index + 3);
    const window = metrics.slice(start, end);
    return {
      darkRatio: average(window.map((item) => item.darkRatio)),
      luma: average(window.map((item) => item.luma)),
    };
  });
}

function detectFooterSeparatorStartFromMetrics(metrics: RowMetric[], scanStart: number): number | null {
  if (metrics.length < FOOTER_SEPARATOR_HEIGHT) return null;

  for (let index = 0; index <= metrics.length - FOOTER_SEPARATOR_HEIGHT; index++) {
    let isSeparator = true;
    for (let offset = 0; offset < FOOTER_SEPARATOR_HEIGHT; offset++) {
      const row = metrics[index + offset];
      if (row.darkRatio < 0.95 || row.luma > 24) {
        isSeparator = false;
        break;
      }
    }

    if (isSeparator) {
      return scanStart + index;
    }
  }

  return null;
}

function detectFooterBandStartFromMetrics(
  metrics: RowMetric[],
  scanStart: number,
  imageHeight: number,
  rawMetrics: RowMetric[] = metrics,
): number | null {
  if (metrics.length === 0) return null;

  const minFooterHeight = Math.min(imageHeight - 1, getFooterHeight(imageHeight));
  const minBandRows = Math.max(18, Math.round(minFooterHeight * 0.55));
  const bottomWindow = metrics.slice(-Math.min(metrics.length, 12));
  const bottomDarkRatio = average(bottomWindow.map((row) => row.darkRatio));
  const bottomLuma = average(bottomWindow.map((row) => row.luma));

  if (bottomDarkRatio < 0.2 || bottomLuma > 138) {
    return null;
  }

  for (let index = 8; index <= metrics.length - minBandRows; index++) {
    const startY = scanStart + index;
    const cropHeight = imageHeight - startY;
    if (cropHeight < minFooterHeight) continue;

    const above = metrics.slice(Math.max(0, index - 12), index);
    const leading = metrics.slice(index, Math.min(metrics.length, index + 10));
    const band = metrics.slice(index);

    const aboveDark = average(above.map((row) => row.darkRatio));
    const aboveLuma = average(above.map((row) => row.luma));
    const leadingDark = average(leading.map((row) => row.darkRatio));
    const leadingLuma = average(leading.map((row) => row.luma));
    const bandDark = average(band.map((row) => row.darkRatio));
    const bandLuma = average(band.map((row) => row.luma));
    const bandConsistency =
      band.filter((row) => row.darkRatio > 0.18 || row.luma < Math.min(134, bandLuma + 20)).length / band.length;

    const transition = aboveLuma - leadingLuma;

    if (
      leadingDark > 0.18 &&
      leadingLuma < 132 &&
      bandDark > 0.22 &&
      bandLuma < 128 &&
      bandConsistency > 0.7 &&
      transition > 18 &&
      (aboveDark + 0.08 < bandDark || aboveLuma > bandLuma + 26)
    ) {
      return refineFooterBandStart(rawMetrics, scanStart, index, imageHeight);
    }
  }

  return null;
}

function refineFooterBandStart(
  rawMetrics: RowMetric[],
  scanStart: number,
  coarseIndex: number,
  imageHeight: number,
): number {
  const coarseStartY = scanStart + coarseIndex;
  const footerHeight = imageHeight - coarseStartY;
  const searchStart = Math.max(8, coarseIndex - Math.min(12, Math.round(footerHeight * 0.2)));
  const searchEnd = Math.min(rawMetrics.length - 6, coarseIndex + 8);

  for (let index = searchStart; index <= searchEnd; index++) {
    const row = rawMetrics[index];
    const previous = rawMetrics.slice(Math.max(0, index - 6), index);
    const next = rawMetrics.slice(index, Math.min(rawMetrics.length, index + 6));
    const transition = average(previous.map((item) => item.luma)) - average(next.map((item) => item.luma));
    const nextDark = average(next.map((item) => item.darkRatio));

    if (row.darkRatio > 0.12 && nextDark > 0.18 && transition > 24) {
      return scanStart + index;
    }
  }

  return coarseStartY;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getLuma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: "image/jpeg" | "image/png",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      mimeType,
      quality,
    );
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}