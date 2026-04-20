import { LOGO_GRF_HEX, LOGO_GRF_BYTES_PER_ROW, LOGO_GRF_TOTAL_BYTES } from "@/constants/logoGrf";

export interface EtiquetaParams {
  codigoBarras: string;
}

/**
 * Generate ZPL for a 95mm x 12mm thermal label (Elgin L42 Pro Full @203 dpi).
 * Layout: [empty 0-37.4mm] [JOTS logo 37.4-67mm] [barcode CODE128 70-95mm]
 */
export function gerarZpl({ codigoBarras }: EtiquetaParams): string {
  return [
    "^XA",
    "~SD25",
    "^PR2",
    "^PW760",
    "^LL96",
    "^LH0,0",
    `~DGR:LOGO.GRF,${LOGO_GRF_TOTAL_BYTES},${LOGO_GRF_BYTES_PER_ROW},`,
    LOGO_GRF_HEX,
    "^FO295,0",
    "^XGR:LOGO.GRF,1,1",
    "^FS",
    "^FO555,14",
    "^BY2,3,56",
    "^BCN,56,N,N,N",
    `^FD${codigoBarras}^FS`,
    "^FO555,72",
    "^A0N,10,10",
    "^FB200,1,0,C,0",
    `^FD${codigoBarras}^FS`,
    "^XZ",
  ].join("\n");
}

/** Generate ZPL for N copies (concatenates N labels). */
export function gerarZplLote(codigoBarras: string, quantidade: number): string {
  const single = gerarZpl({ codigoBarras });
  return Array.from({ length: Math.max(1, quantidade) }, () => single).join("\n");
}
