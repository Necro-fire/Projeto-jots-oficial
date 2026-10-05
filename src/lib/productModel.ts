export function resolveProductModelName({
  isAcessorio,
  model,
  referencia,
}: {
  isAcessorio?: boolean;
  model?: string | null;
  referencia?: string | null;
}) {
  const customName = (model ?? "").trim();
  if (customName) return customName;

  const reference = (referencia ?? "").trim();
  if (reference) return reference;

  return isAcessorio ? "Acessório" : "Produto";
}
