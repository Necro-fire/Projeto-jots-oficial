/**
 * Utility to add code + classification footer to product images.
 * Applies only to Receituário, Solar, Clip-on categories.
 * Footer layout (2 lines):
 *   Line 1: Nome completo da peça
 *   Line 2: COD: XXXXX  |  C3  |  Haste: XX  Lente: XX  Ponte: XX
 */

const FOOTER_CATEGORIES = ["Receituário", "Solar", "Clip-on"];

export function shouldHaveFooter(category: string): boolean {
  return FOOTER_CATEGORIES.includes(category);
}

/**
 * Draw footer overlay on a canvas with the product image.
 * Returns a Blob of the composited image (JPEG).
 */
export async function renderImageWithFooter(
  imageUrl: string,
  code: string,
  classificacao: string,
  productName?: string,
  measures?: { haste?: number; lente?: number; ponte?: number },
): Promise<Blob> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;

  // Draw original image
  ctx.drawImage(img, 0, 0);

  // Footer dimensions — proportional, optimized for 9:16 reference
  const footerH = Math.max(56, Math.round(img.naturalHeight * 0.09));
  const y = img.naturalHeight - footerH;

  // Semi-transparent dark overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.60)";
  ctx.fillRect(0, y, img.naturalWidth, footerH);

  const pad = Math.round(img.naturalWidth * 0.04);

  // Line 1 — Product name (top of footer)
  const nameText = productName || "";
  if (nameText) {
    const nameFontSize = Math.max(12, Math.round(footerH * 0.35));
    ctx.font = `600 ${nameFontSize}px Arial, sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const line1Y = y + footerH * 0.33;
    ctx.fillText(nameText, pad, line1Y);
  }

  // Line 2 — COD + Classification + Measures (bottom of footer)
  const line2Parts: string[] = [];
  if (code) line2Parts.push(`COD: ${code}`);
  if (classificacao) line2Parts.push(classificacao);
  const measureParts: string[] = [];
  if (measures?.haste) measureParts.push(`Haste: ${measures.haste}`);
  if (measures?.lente) measureParts.push(`Lente: ${measures.lente}`);
  if (measures?.ponte) measureParts.push(`Ponte: ${measures.ponte}`);
  if (measureParts.length) line2Parts.push(measureParts.join("  "));
  const line2Text = line2Parts.join("   |   ");

  if (line2Text) {
    const codeFontSize = Math.max(11, Math.round(footerH * 0.28));
    ctx.font = `500 ${codeFontSize}px Arial, sans-serif`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.90)";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const line2Y = nameText ? y + footerH * 0.70 : y + footerH * 0.5;
    ctx.fillText(line2Text, pad, line2Y);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      "image/jpeg",
      0.92,
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
