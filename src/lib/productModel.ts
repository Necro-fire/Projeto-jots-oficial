export function normalizeProductModelName(value?: string | null): string {
  const name = (value ?? "").trim();
  if (name.length % 2 === 0) {
    const half = name.slice(0, name.length / 2);
    if (half === name.slice(name.length / 2)) return half;
  }
  return name;
}

export function resolveProductModelName({
  isAcessorio,
  model,
  referencia,
}: {
  isAcessorio?: boolean;
  model?: string | null;
  referencia?: string | null;
}) {
  const customName = normalizeProductModelName(model);
  if (customName) return customName;

  const reference = normalizeProductModelName(referencia);
  if (reference) return reference;

  return isAcessorio ? "Acessório" : "Produto";
}
