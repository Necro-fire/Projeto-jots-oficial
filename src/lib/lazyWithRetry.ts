import { lazy, type ComponentType } from "react";

const RELOAD_FLAG = "chunk-reload-at";
/** Evita laço de recarregamento se o arquivo realmente não existir. */
const RELOAD_COOLDOWN_MS = 10_000;

/**
 * `React.lazy` que se recupera de um deploy novo: uma aba aberta antes da publicação aponta para
 * arquivos que já não existem. Nesse caso a página é recarregada uma vez para buscar a versão atual.
 */
export function lazyWithRetry<T extends ComponentType>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      let canReload = false;
      try {
        const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0);
        if (Date.now() - last > RELOAD_COOLDOWN_MS) {
          sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
          canReload = true;
        }
      } catch {
        // sessionStorage indisponível: sem como limitar recarregamentos, então só propaga o erro
      }

      if (canReload) {
        window.location.reload();
        // Mantém o fallback na tela até a página recarregar.
        return new Promise<never>(() => {});
      }
      throw error;
    }
  });
}
