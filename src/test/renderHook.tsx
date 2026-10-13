import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Renderiza um hook sem depender de @testing-library/dom (não instalado no projeto). */
export function renderHook<R, P = undefined>(hook: (props: P) => R, options: { initialProps?: P } = {}) {
  const result = { current: undefined as unknown as R };
  let props = options.initialProps as P;
  let root: Root;

  function Probe({ value }: { value: P }) {
    result.current = hook(value);
    return null;
  }

  act(() => {
    root = createRoot(document.createElement("div"));
    root.render(<Probe value={props} />);
  });

  return {
    result,
    rerender(next?: P) {
      if (next !== undefined) props = next;
      act(() => root.render(<Probe value={props} />));
    },
    unmount() {
      act(() => root.unmount());
    },
  };
}

/** Espera uma condição, deixando as promessas pendentes rodarem dentro do `act`. */
export async function waitFor(condition: () => void, timeoutMs = 2000) {
  const start = Date.now();
  for (;;) {
    try {
      condition();
      return;
    } catch (error) {
      if (Date.now() - start > timeoutMs) throw error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
    }
  }
}

export { act };
