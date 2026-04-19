export function baixarZpl(zpl: string, codigo: string) {
  const blob = new Blob([zpl], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `etiqueta_${codigo}_${Date.now()}.zpl`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
