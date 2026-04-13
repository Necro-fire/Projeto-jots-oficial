/**
 * Utility to add footer overlay to product images.
 * Applies only to Receituário, Solar, Clip-on categories.
 * Footer layout (2 lines):
 *   Line 1: Nome completo da peça
 *   Line 2: Classificação (C1–C10)
 */

const FOOTER_CATEGORIES = ["Receituário", "Solar", "Clip-on"];

export function shouldHaveFooter(category: string): boolean {
  return FOOTER_CATEGORIES.includes(category);
}

/**
 * Draw footer overlay on a canvas with the product image.
 * Strips any previously-baked footer before applying the new one
 * to avoid duplication when the image is replaced.
 * Returns a Blob of the composited image (JPEG).
 */
export async function renderImageWithFooter(
  imageUrl: string,
  productName?: string,
  classificacao?: string,
): Promise<Blob> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;

  // --- Strip old footer if present ---
  // Old footers occupy ~9% of image height at the bottom.
  // Detect by sampling: if bottom strip is mostly dark overlay, crop it.
  const detectCanvas = document.createElement("canvas");
  detectCanvas.width = srcW;
  detectCanvas.height = srcH;
  const dCtx = detectCanvas.getContext("2d")!;
  dCtx.drawImage(img, 0, 0);

  const stripH = Math.round(srcH * 0.09);
  const sampleData = dCtx.getImageData(0, srcH - stripH, srcW, stripH).data;
  let darkPixels = 0;
  const totalPixels = srcW * stripH;
  for (let i = 0; i < sampleData.length; i += 4) {
    // Pixel is "dark overlay" if R,G,B all < 80 and alpha > 200
    if (sampleData[i] < 80 && sampleData[i + 1] < 80 && sampleData[i + 2] < 80 && sampleData[i + 3] > 200) {
      darkPixels++;
    }
  }
  const darkRatio = darkPixels / totalPixels;
  // If >40% of the bottom strip is dark, assume old footer exists → crop it
  const cropH = darkRatio > 0.4 ? stripH : 0;
  const cleanH = srcH - cropH;

  // --- Draw clean image + new footer ---
  canvas.width = srcW;
  canvas.height = cleanH; // start with cropped height
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, srcW, cleanH, 0, 0, srcW, cleanH);

  // Now expand canvas to add new footer
  const footerH = Math.max(56, Math.round(cleanH * 0.09));
  const finalH = cleanH + footerH;
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = srcW;
  finalCanvas.height = finalH;
  const fCtx = finalCanvas.getContext("2d")!;

  // Draw clean image
  fCtx.drawImage(canvas, 0, 0);

  // Semi-transparent dark overlay for footer
  const footerY = cleanH;
  fCtx.fillStyle = "rgba(0, 0, 0, 0.60)";
  fCtx.fillRect(0, footerY, srcW, footerH);

  const pad = Math.round(srcW * 0.04);

  // Line 1 — Product name (top of footer)
  const nameText = productName || "";
  if (nameText) {
    const nameFontSize = Math.max(12, Math.round(footerH * 0.35));
    fCtx.font = `600 ${nameFontSize}px Arial, sans-serif`;
    fCtx.fillStyle = "#ffffff";
    fCtx.textBaseline = "middle";
    fCtx.textAlign = "left";
    const line1Y = footerY + footerH * 0.33;
    fCtx.fillText(nameText, pad, line1Y);
  }

  // Line 2 — Classification only
  const classText = classificacao || "";
  if (classText) {
    const classFontSize = Math.max(11, Math.round(footerH * 0.28));
    fCtx.font = `500 ${classFontSize}px Arial, sans-serif`;
    fCtx.fillStyle = "rgba(255, 255, 255, 0.90)";
    fCtx.textBaseline = "middle";
    fCtx.textAlign = "left";
    const line2Y = nameText ? footerY + footerH * 0.70 : footerY + footerH * 0.5;
    fCtx.fillText(classText, pad, line2Y);
  }

  return new Promise((resolve, reject) => {
    finalCanvas.toBlob(
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