/**
 * Utility to add code + classification footer to product images.
 * Applies only to Receituário, Solar, Clip-on categories.
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
  medidas?: { haste?: number; lente?: number; ponte?: number },
): Promise<Blob> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;

  // Draw original image
  ctx.drawImage(img, 0, 0);

  // Footer dimensions
  const footerH = Math.max(36, Math.round(img.naturalHeight * 0.06));
  const y = img.naturalHeight - footerH;

  // Semi-transparent dark overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, y, img.naturalWidth, footerH);

  // Text
  const fontSize = Math.max(14, Math.round(footerH * 0.5));
  ctx.font = `600 ${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  const textY = y + footerH / 2;
  const pad = Math.round(img.naturalWidth * 0.03);

  // Code on the left
  ctx.textAlign = "left";
  ctx.fillText(`COD: ${code}`, pad, textY);

  // Build right-side text: classificação + medidas (Haste, Lente, Ponte - alphabetical)
  const rightParts: string[] = [];
  if (medidas) {
    if (medidas.haste) rightParts.push(`H:${medidas.haste}`);
    if (medidas.lente) rightParts.push(`L:${medidas.lente}`);
    if (medidas.ponte) rightParts.push(`P:${medidas.ponte}`);
  }
  const sizesText = rightParts.length > 0 ? rightParts.join(" ") : "";
  const classText = classificacao || "";
  const rightText = [classText, sizesText].filter(Boolean).join(" | ");

  if (rightText) {
    ctx.textAlign = "right";
    ctx.fillText(rightText, img.naturalWidth - pad, textY);
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
