import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Trash2, ShoppingCart, Barcode, Keyboard, Tag, Eye, PackageCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useFilial } from "@/contexts/FilialContext";
import { useAuth } from "@/contexts/AuthContext";
import { FilialSelector } from "@/components/FilialSelector";
import { useProducts, useClients, createVenda, type DbProduct } from "@/hooks/useSupabaseData";
import { useDescontosAtacado, type DescontoAtacado } from "@/hooks/useDescontosAtacado";
import { createConsignado } from "@/hooks/useConsignados";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useBlocker, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SplitPaymentPanel, type PaymentEntry } from "@/components/pdv/SplitPaymentPanel";
import { ClientSearchPanel } from "@/components/pdv/ClientSearchPanel";
import { CreditCardInstallmentDialog } from "@/components/pdv/CreditCardInstallmentDialog";
import { BoletoConfigDialog } from "@/components/pdv/BoletoConfigDialog";
import { DiscountRuleDialog } from "@/components/pdv/DiscountRuleDialog";
import { ProductImageDialog } from "@/components/pdv/ProductImageDialog";
import { CupomFiscalDialog } from "@/components/CupomFiscalDialog";
import { buildCupomFromVendaId } from "@/lib/cupomFiscalUtils";
import type { CupomFiscalData } from "@/components/CupomFiscal";
import { matchesProductSearch, findByExactBarcode } from "@/lib/productSearch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CartItem {
  cartId: string;
  product: DbProduct;
}

let cartIdCounter = 0;
function nextCartId() {
  return `cart-${++cartIdCounter}-${Date.now()}`;
}

export default function PDV() {
  const [search, setSearch] = useState("");
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([]);
  const [origin, setOrigin] = useState("stock");
  const [showCreditCardModal, setShowCreditCardModal] = useState(false);
  const [showBoletoModal, setShowBoletoModal] = useState(false);
  const [creditCardInfo, setCreditCardInfo] = useState<{ installments: number; finalTotal: number } | null>(null);
  const [boletoInfo, setBoletoInfo] = useState<{ interval: string; installments: number; finalTotal: number } | null>(null);
  const [splitInstallmentEntryId, setSplitInstallmentEntryId] = useState<string | null>(null);
  const [splitInstallmentAmount, setSplitInstallmentAmount] = useState(0);
  const [splitBoletoEntryId, setSplitBoletoEntryId] = useState<string | null>(null);
  const [splitBoletoAmount, setSplitBoletoAmount] = useState(0);
  const [zoomImage, setZoomImage] = useState<{ url: string; name: string; category?: string; classificacao?: string; haste?: number; lente?: number; ponte?: number } | null>(null);
  const [cupomData, setCupomData] = useState<CupomFiscalData | null>(null);
  const [showCupom, setShowCupom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { selectedFilial, setSelectedFilial } = useFilial();
  const { user, profile, hasPermission } = useAuth();
  const canSell = hasPermission('PDV', 'sell');
  const searchRef = useRef<HTMLInputElement>(null);
  const [pendingFilial, setPendingFilial] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingConsignadoId, setPendingConsignadoId] = useState<string | null>(null);
  const [pendingConsignadoIds, setPendingConsignadoIds] = useState<string[]>([]);
  const consignadoLoadedRef = useRef(false);
  const [consignacaoMode, setConsignacaoMode] = useState(false);
  const [submittingConsignacao, setSubmittingConsignacao] = useState(false);
  const [conversionBanner, setConversionBanner] = useState(false);

  // Detect consignment mode from navigation state
  useEffect(() => {
    const cm = (location.state as any)?.consignacaoMode;
    const fid = (location.state as any)?.filialId;
    const pc = (location.state as any)?.prefilledClient;
    if (cm) {
      setConsignacaoMode(true);
      if (fid && selectedFilial !== fid) setSelectedFilial(fid);
      if (pc) setSelectedClient(pc);
      toast.info("Modo Consignação ativado — produtos não serão cobrados nem recebem desconto");
      navigate(location.pathname, { replace: true, state: { _consumed: true } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: products } = useProducts();
  const { data: clients } = useClients();
  const { data: descontosAtacado } = useDescontosAtacado();

  // Auto-load consignado when navigating from Produtos Consignados
  useEffect(() => {
    if (consignadoLoadedRef.current) return;
    const fc = (location.state as any)?.fromConsignado;
    if (!fc || !products.length) return;

    const product = products.find(p => p.id === fc.produtoId);
    if (!product) return;

    consignadoLoadedRef.current = true;

    if (fc.filialId && selectedFilial !== fc.filialId) {
      setSelectedFilial(fc.filialId);
    }

    const qty = Math.max(1, Number(fc.quantidade) || 1);
    setCart(prev => {
      const additions: CartItem[] = [];
      for (let i = 0; i < qty; i++) {
        additions.push({ cartId: nextCartId(), product });
      }
      return [...prev, ...additions];
    });

    if (fc.clienteId) setSelectedClient(fc.clienteId);
    setPendingConsignadoId(fc.consignadoId);

    toast.success(`Produto consignado carregado: ${product.referencia || product.model}`);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, products, selectedFilial, setSelectedFilial, navigate, location.pathname]);

  // Auto-load full client cart from "Converter em venda"
  useEffect(() => {
    const fcc = (location.state as any)?.fromCarrinhoConsignado;
    if (!fcc || !products.length || consignadoLoadedRef.current) return;

    const consignadosList = fcc.consignados as { consignadoId: string; produtoId: string; quantidade: number }[];
    if (!consignadosList?.length) return;

    consignadoLoadedRef.current = true;

    if (fcc.filialId && selectedFilial !== fcc.filialId) {
      setSelectedFilial(fcc.filialId);
    }

    const additions: CartItem[] = [];
    const ids: string[] = [];
    for (const c of consignadosList) {
      const product = products.find(p => p.id === c.produtoId);
      if (!product) continue;
      const qty = Math.max(1, Number(c.quantidade) || 1);
      for (let i = 0; i < qty; i++) {
        additions.push({ cartId: nextCartId(), product });
      }
      ids.push(c.consignadoId);
    }

    if (additions.length === 0) {
      toast.error("Nenhum produto do carrinho pôde ser carregado.");
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }

    setCart(prev => [...prev, ...additions]);
    setSelectedClient(fcc.clienteId);
    setPendingConsignadoIds(ids);
    setConversionBanner(true);

    toast.success(`${additions.length} ${additions.length === 1 ? "produto carregado" : "produtos carregados"}. Agora os produtos podem receber descontos, conforme as regras do sistema.`, { duration: 6000 });
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, products, selectedFilial, setSelectedFilial, navigate, location.pathname]);

  const [selectedDiscountRules, setSelectedDiscountRules] = useState<DescontoAtacado[]>([]);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [lastRuleSignature, setLastRuleSignature] = useState("");

  // Helper: does a product match a discount rule?
  const productMatchesRule = useCallback((product: DbProduct, rule: DescontoAtacado): boolean => {
    if (rule.tipo_desconto === "todos") return true;
    if (rule.tipo_desconto === "todas_armacoes") return !product.is_acessorio;
    if (rule.tipo_desconto === "todos_acessorios") return product.is_acessorio;
    if (rule.tipo_desconto === "armacao_especifica") return !product.is_acessorio && product.estilo === rule.categoria;
    if (rule.tipo_desconto === "acessorio_especifico") return product.is_acessorio && (product.subcategoria_acessorio === rule.categoria || (product as any).categoria_acessorio === rule.categoria);
    if (rule.tipo_desconto === "produto" && rule.produto_id) return product.id === rule.produto_id;
    return false;
  }, []);

  // Find all applicable rules based on cart contents
  const applicableRules = useMemo(() => {
    return descontosAtacado.filter(rule => {
      if (rule.status !== "active") return false;
      const matchingCount = cart.filter(item => productMatchesRule(item.product, rule)).length;
      return matchingCount >= rule.quantidade_minima;
    });
  }, [cart, descontosAtacado, productMatchesRule]);

  // Check conflict between all applicable rules
  const rulesHaveConflict = useMemo(() => {
    if (applicableRules.length < 2) return false;
    const claimed = new Set<string>();
    for (const rule of applicableRules) {
      const matching = cart
        .filter(item => !claimed.has(item.cartId) && productMatchesRule(item.product, rule))
        .sort((a, b) => Number(b.product.retail_price) - Number(a.product.retail_price));
      if (matching.length < rule.quantidade_minima) return true;
      for (let i = 0; i < rule.quantidade_minima; i++) {
        claimed.add(matching[i].cartId);
      }
    }
    return false;
  }, [applicableRules, cart, productMatchesRule]);

  // Auto-select rules or show dialog when applicable rules change
  useEffect(() => {
    const sig = applicableRules.map(r => r.id).sort().join(",");
    if (sig === lastRuleSignature) return;
    setLastRuleSignature(sig);

    if (applicableRules.length === 0) {
      setSelectedDiscountRules([]);
    } else if (applicableRules.length === 1) {
      setSelectedDiscountRules(applicableRules);
      const r = applicableRules[0];
      toast.success(`🏷️ Atacado aplicado: ${r.tipo_valor === "percentual" ? `-${r.valor_desconto}%` : `-R$${r.valor_desconto.toFixed(2)}`} (${r.quantidade_minima} un.)`, { duration: 3000 });
    } else {
      setShowDiscountDialog(true);
    }
  }, [applicableRules, lastRuleSignature]);

  // Compute discount allocation: Map<cartId, { discountedPrice, ruleLabel }>
  // When a rule is triggered (cart has >= quantidade_minima matching items), apply discount to ALL matching items
  const discountAllocation = useMemo(() => {
    const allocation = new Map<string, { discountedPrice: number; ruleLabel: string }>();
    const claimed = new Set<string>();

    for (const rule of selectedDiscountRules) {
      const matching = cart
        .filter(item => !claimed.has(item.cartId) && productMatchesRule(item.product, rule));

      // Apply discount to ALL matching items (not just quantidade_minima)
      for (const item of matching) {
        const price = Number(item.product.retail_price);
        let discounted: number;
        if (rule.tipo_valor === "percentual") {
          discounted = price * (1 - rule.valor_desconto / 100);
        } else {
          discounted = Math.max(0, price - rule.valor_desconto);
        }
        allocation.set(item.cartId, {
          discountedPrice: Math.round(discounted * 100) / 100,
          ruleLabel: rule.tipo_valor === "percentual" ? `Atacado -${rule.valor_desconto}%` : `Atacado -R$${rule.valor_desconto.toFixed(2)}`,
        });
        claimed.add(item.cartId);
      }
    }

    return allocation;
  }, [cart, selectedDiscountRules, productMatchesRule]);

  const hasAnyWholesale = discountAllocation.size > 0;

  const subtotal = useMemo(() => {
    let total = 0;
    for (const item of cart) {
      const disc = discountAllocation.get(item.cartId);
      total += disc ? disc.discountedPrice : Number(item.product.retail_price);
    }
    return total;
  }, [cart, discountAllocation]);

  const subtotalOriginal = useMemo(() => {
    return cart.reduce((sum, item) => sum + Number(item.product.retail_price), 0);
  }, [cart]);

  const totalSaved = subtotalOriginal - subtotal;


  // Count how many of each product are in the cart
  const cartQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      map.set(item.product.id, (map.get(item.product.id) || 0) + 1);
    }
    return map;
  }, [cart]);

  const filteredProducts = useMemo(() => {
    const active = products
      .map(p => ({ ...p, displayStock: p.stock - (cartQtyMap.get(p.id) || 0) }))
      .filter(p => p.status === "active" && p.displayStock > 0);
    if (!search) return active;
    return active.filter(p => matchesProductSearch(p, search));
  }, [search, products, cartQtyMap]);

  const addToCart = useCallback((product: DbProduct) => {
    setCart(prev => {
      const qtyInCart = prev.filter(i => i.product.id === product.id).length;
      if (qtyInCart >= product.stock) {
        toast.error(`Estoque insuficiente. Disponível: ${product.stock}`);
        return prev;
      }
      return [...prev, { cartId: nextCartId(), product }];
    });
  }, []);

  // Auto-add on exact barcode match
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (!value.trim()) return;
    const exactMatch = findByExactBarcode(products, value.trim());
    if (exactMatch) {
      addToCart(exactMatch);
      setSearch("");
      toast.success(`${exactMatch.referencia} adicionado`);
    }
  }, [products, addToCart]);

  const removeFromCart = (cartId: string) => {
    setCart(prev => prev.filter(i => i.cartId !== cartId));
  };

  const finalizeSale = async () => {
    if (!selectedClient) { toast.error("Selecione um cliente"); return; }
    if (cart.length === 0) { toast.error("Adicione produtos"); return; }

    if (isSplitPayment) {
      if (paymentEntries.length === 0) { toast.error("Adicione ao menos uma forma de pagamento"); return; }
      const totalPaid = paymentEntries.reduce((s, e) => s + e.amount, 0);
      const diff = Math.abs(totalPaid - subtotal);
      if (diff > 0.01) {
        if (totalPaid < subtotal) {
          toast.error("Não é possível finalizar: valor pago é inferior ao total da compra.");
        } else {
          toast.error("Não é possível finalizar: valor pago excede o total da compra.");
        }
        return;
      }
    } else {
      if (!paymentMethod) { toast.error("Selecione forma de pagamento"); return; }
    }

    const client = clients.find(c => c.id === selectedClient);
    const filialId = selectedFilial === "all" ? "1" : selectedFilial;

    setSubmitting(true);
    try {
      // Build sale items grouped by product with discount allocation
      const grouped = new Map<string, { product: DbProduct; count: number; totalPrice: number }>();
      for (const item of cart) {
        const disc = discountAllocation.get(item.cartId);
        const price = disc ? disc.discountedPrice : Number(item.product.retail_price);
        const existing = grouped.get(item.product.id);
        if (existing) {
          existing.count++;
          existing.totalPrice += price;
        } else {
          grouped.set(item.product.id, { product: item.product, count: 1, totalPrice: price });
        }
      }
      const items = Array.from(grouped.values()).map(({ product, count, totalPrice }) => ({
        produto_id: product.id,
        product_code: product.referencia,
        product_model: product.model || product.referencia,
        quantity: count,
        unit_price: Math.round((totalPrice / count) * 100) / 100,
        custo_unitario: (product as any).custo ?? 0,
      }));

      // Determine origin based on payment method
      const isConsignado = isSplitPayment 
        ? paymentEntries.some(e => e.method === "consignado")
        : paymentMethod === "consignado";
      const saleOrigin = isConsignado ? "consignado" : "stock";

      // Determine final method string and total with interest
      let finalMethod = isSplitPayment
        ? paymentEntries.map(e => {
            if (e.method === "cartao" && e.installments) {
              return `Cartão ${e.installments}x`;
            }
            if (e.method === "boleto" && e.boletoInstallments && e.boletoInterval) {
              return `Boleto ${e.boletoInstallments}x/${e.boletoInterval}d`;
            }
            const label = { pix: "Pix", dinheiro: "Dinheiro", cartao: "Cartão", debito: "Débito", boleto: "Boleto", consignado: "Consignado" }[e.method] || e.method;
            return label;
          }).join("/")
        : paymentMethod;

      let saleTotal = subtotal;
      if (isSplitPayment) {
        // Sum up: for credit card/boleto entries with finalTotal, use finalTotal; otherwise use amount
        saleTotal = paymentEntries.reduce((sum, e) => {
          if ((e.method === "cartao" || e.method === "boleto") && e.finalTotal) {
            return sum + e.finalTotal;
          }
          return sum + e.amount;
        }, 0);
      } else if (paymentMethod === "cartao" && creditCardInfo) {
        finalMethod = `Cartão de Crédito ${creditCardInfo.installments}x`;
        saleTotal = creditCardInfo.finalTotal;
      } else if (paymentMethod === "boleto" && boletoInfo) {
        finalMethod = `Boleto ${boletoInfo.installments}x/${boletoInfo.interval}d`;
        saleTotal = boletoInfo.finalTotal;
      }

      // Record atacado discount
      const saleDiscount = totalSaved > 0 ? totalSaved : 0;

      const splits = isSplitPayment
        ? paymentEntries.map(e => {
            const method = e.method === "cartao" && e.installments
              ? `Cartão ${e.installments}x`
              : e.method === "boleto" && e.boletoInstallments && e.boletoInterval
                ? `Boleto ${e.boletoInstallments}x/${e.boletoInterval}d`
                : e.method;

            const finalAmount = (e.method === "cartao" || e.method === "boleto") && e.finalTotal
              ? e.finalTotal
              : e.amount;

            return {
              method,
              amount: e.amount,
              finalAmount,
            };
          })
        : undefined;

      const result = await createVenda(items, selectedClient, client?.store_name || "", finalMethod, saleOrigin, filialId, saleDiscount, user?.id, profile?.nome || user?.email || "", splits);

      toast.success(`Venda finalizada! ${result.sale_code || '#' + result.number} — Total: R$ ${saleTotal.toFixed(2)}`);

      // Mark linked consignados as sold (single-item path or full-cart conversion)
      const consignadosToMark = pendingConsignadoIds.length > 0
        ? pendingConsignadoIds
        : (pendingConsignadoId ? [pendingConsignadoId] : []);

      if (consignadosToMark.length > 0) {
        try {
          await (supabase as any)
            .from("consignados")
            .update({ status: "vendido", venda_id: result.id })
            .in("id", consignadosToMark);

          const histRows = consignadosToMark.map(cid => ({
            consignado_id: cid,
            acao: "venda_pdv",
            detalhes: { venda_id: result.id, sale_code: result.sale_code, conversao_carrinho: pendingConsignadoIds.length > 0 },
            usuario_id: user?.id,
            usuario_nome: profile?.nome || "",
          }));
          await (supabase as any).from("consignado_historico").insert(histRows);
        } catch (e) {
          console.error("Erro ao marcar consignados como vendidos:", e);
        }
        setPendingConsignadoId(null);
        setPendingConsignadoIds([]);
        setConversionBanner(false);
        consignadoLoadedRef.current = false;
      }

      // Build cupom and show dialog
      try {
        const cupom = await buildCupomFromVendaId(result.id);
        setCupomData(cupom);
        setShowCupom(true);
      } catch (e) {
        console.error("Erro ao gerar cupom:", e);
      }

      setCart([]);
      setSelectedClient("");
      setPaymentMethod("");
      setIsSplitPayment(false);
      setPaymentEntries([]);
      setCreditCardInfo(null);
      setBoletoInfo(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao finalizar venda");
    } finally {
      setSubmitting(false);
    }
  };

  // ===== Consignment Mode: register items as consignados (no payment, no caixa) =====
  const finalizeConsignacao = async () => {
    if (cart.length === 0) { toast.error("Adicione produtos à sacola"); return; }
    if (selectedFilial === "all") { toast.error("Selecione uma filial específica"); return; }

    setSubmittingConsignacao(true);
    try {
      const grouped = new Map<string, { product: DbProduct; qty: number }>();
      for (const item of cart) {
        const g = grouped.get(item.product.id);
        if (g) g.qty++;
        else grouped.set(item.product.id, { product: item.product, qty: 1 });
      }

      let count = 0;
      for (const { product, qty } of grouped.values()) {
        await createConsignado({
          produto_id: product.id,
          cliente_id: selectedClient || null,
          filial_id: selectedFilial,
          quantidade: qty,
          valor_unitario: Number(product.retail_price),
          vendedor_nome: profile?.nome || user?.email || "",
          observacoes: "",
          usuario_id: user?.id || "",
          usuario_nome: profile?.nome || "",
        });
        count++;
      }

      toast.success(`${count} ${count === 1 ? "produto consignado" : "produtos consignados"} registrado(s)!`);

      setCart([]);
      setSelectedClient("");
      setConsignacaoMode(false);
      navigate("/produtos-consignados");
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar consignação");
    } finally {
      setSubmittingConsignacao(false);
    }
  };

  // Block navigation when cart has items
  const blocker = useBlocker(cart.length > 0);

  // Browser tab close / refresh warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (cart.length > 0) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [cart.length]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";

      if (e.key === "F2") {
        e.preventDefault();
        if (consignacaoMode) finalizeConsignacao();
        else finalizeSale();
      } else if (e.key === "F4") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Delete" && !isInput) {
        e.preventDefault();
        if (cart.length > 0) {
          const last = cart[cart.length - 1];
          removeFromCart(last.cartId);
          toast.info(`${last.product.referencia} removido`);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSearch("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart, finalizeSale]);

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      <FilialSelector hideAll onBeforeChange={(newFilial) => {
        if (cart.length > 0) {
          setPendingFilial(newFilial);
          return false;
        }
        return true;
      }} />
      {consignacaoMode && (
        <div className="mx-4 mt-3 rounded-lg border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30 px-4 py-2.5 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <PackageCheck className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-ui font-semibold text-amber-900 dark:text-amber-200">Modo Consignação ativado</p>
              <p className="text-caption text-amber-700 dark:text-amber-300/80">
                ⚠️ Produtos consignados <strong>não recebem descontos</strong> até a finalização da venda. Esta entrega é condicional — não é uma venda definitiva.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/50 shrink-0"
            onClick={() => {
              if (cart.length > 0 && !confirm("Sair do modo consignação? A sacola será mantida e voltará para venda normal.")) return;
              setConsignacaoMode(false);
              toast.info("Modo Consignação desativado");
            }}
          >
            Sair
          </Button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        {/* Left - Product Grid */}
        <div className="flex-[3] flex flex-col border-r overflow-hidden">
          <div className="p-4 pb-2 space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <h1 className="text-subhead font-semibold tracking-tighter">PDV</h1>
              <div className="flex items-center gap-3">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
                        <Keyboard className="h-3.5 w-3.5" />
                        <span className="hidden lg:inline">Atalhos</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-caption space-y-1">
                      <p><kbd className="px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono text-[10px]">F2</kbd> Finalizar venda</p>
                      <p><kbd className="px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono text-[10px]">F4</kbd> Buscar produto</p>
                      <p><kbd className="px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono text-[10px]">DEL</kbd> Remover último item</p>
                      <p><kbd className="px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono text-[10px]">ESC</kbd> Limpar busca</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {consignacaoMode ? (
                  <Badge className="text-caption bg-amber-500 text-white hover:bg-amber-500">Consignação</Badge>
                ) : (
                  <Badge variant="secondary" className="text-caption">Estoque</Badge>
                )}
              </div>
            </div>
            <div className="relative">
              <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Código de barras ou nome do produto... (F4)"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 h-9"
                autoFocus
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 pt-2">
            {filteredProducts.length > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                {filteredProducts.map(product => (
                  <div key={product.id} className="rounded-md shadow-subtle bg-card p-3 text-left hover:shadow-card transition-all active:scale-[0.98] group">
                    <div
                      className="aspect-[3/2] rounded-sm bg-secondary flex items-center justify-center overflow-hidden relative"
                      onClick={() => addToCart(product)}
                    >
                      {product.image_url ? (
                        <>
                          <img src={product.image_url} alt={product.model || product.referencia} className="w-full h-full object-cover" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomImage({ url: product.image_url, name: product.model || product.referencia, category: product.category, classificacao: (product as any).classificacao, haste: product.temple_size, lente: product.lens_size, ponte: product.bridge_size });
                            }}
                            className="absolute top-1 right-1 h-6 w-6 rounded-full bg-background/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
                            title="Ver imagem"
                          >
                            <Eye className="h-3.5 w-3.5 text-foreground" />
                          </button>
                        </>
                      ) : (
                        <span className="text-muted-foreground/20 text-subhead font-bold">{product.model || product.referencia}</span>
                      )}
                    </div>
                    <button onClick={() => addToCart(product)} className="w-full text-left mt-2">
                      <h3 className="text-ui font-medium truncate">{product.model || product.referencia}</h3>
                      <div className="flex justify-between items-center mt-1">
                        <Badge variant="secondary" className="text-caption tabular-nums">{product.displayStock} un.</Badge>
                        <span className={`text-ui font-medium tabular-nums ${consignacaoMode ? "text-muted-foreground line-through" : "text-primary"}`}>
                          R$ {Number(product.retail_price).toFixed(2)}
                        </span>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-ui font-medium">Nenhum produto encontrado</p>
                <p className="text-caption mt-1">Tente outro código ou nome</p>
              </div>
            )}
          </div>
        </div>

        {/* Right - Cart */}
         <div className="flex-[2] flex flex-col max-w-md">
          <div className="p-4 pb-2 space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-ui font-semibold">Sacola</h2>
              {hasAnyWholesale && (
                <div className="flex items-center gap-1 ml-auto flex-wrap">
                  {selectedDiscountRules.map(rule => (
                    <Badge key={rule.id} className="bg-success text-success-foreground text-caption">
                      {rule.tipo_valor === "percentual" ? `-${rule.valor_desconto}%` : `-R$${rule.valor_desconto.toFixed(2)}`} ({rule.quantidade_minima}un)
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <ClientSearchPanel
              clients={clients}
              selectedClient={selectedClient}
              onSelectClient={setSelectedClient}
            />
          </div>

          <div className="flex-1 overflow-auto p-4 pt-2">
            <AnimatePresence mode="popLayout">
              {(() => {
                // Group cart items by product ID for display
                const grouped: { productId: string; product: DbProduct; cartIds: string[]; qty: number; totalOriginal: number; totalDiscounted: number; ruleLabel?: string }[] = [];
                const seen = new Map<string, number>();
                for (const item of cart) {
                  const disc = discountAllocation.get(item.cartId);
                  const idx = seen.get(item.product.id);
                  if (idx !== undefined) {
                    const g = grouped[idx];
                    g.cartIds.push(item.cartId);
                    g.qty++;
                    g.totalOriginal += Number(item.product.retail_price);
                    g.totalDiscounted += disc ? disc.discountedPrice : Number(item.product.retail_price);
                    if (disc && !g.ruleLabel) g.ruleLabel = disc.ruleLabel;
                  } else {
                    seen.set(item.product.id, grouped.length);
                    grouped.push({
                      productId: item.product.id,
                      product: item.product,
                      cartIds: [item.cartId],
                      qty: 1,
                      totalOriginal: Number(item.product.retail_price),
                      totalDiscounted: disc ? disc.discountedPrice : Number(item.product.retail_price),
                      ruleLabel: disc?.ruleLabel,
                    });
                  }
                }
                return grouped.map(g => (
                  <motion.div key={g.productId} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }} className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-secondary/50">
                    <Badge variant="outline" className="text-caption tabular-nums shrink-0 w-7 h-7 flex items-center justify-center rounded-full">{g.qty}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-ui font-medium truncate">{g.product.model || g.product.referencia}</p>
                      <p className="text-caption text-muted-foreground">{g.product.color}</p>
                      {g.ruleLabel && <p className="text-[10px] text-success">{g.ruleLabel}</p>}
                    </div>
                    <div className="flex flex-col items-end w-24">
                      {consignacaoMode ? (
                        <span className="text-ui font-medium tabular-nums text-muted-foreground line-through">R$ {g.totalOriginal.toFixed(2)}</span>
                      ) : g.ruleLabel ? (
                        <>
                          <span className="text-caption tabular-nums text-muted-foreground line-through">R$ {g.totalOriginal.toFixed(2)}</span>
                          <span className="text-ui font-medium tabular-nums text-success">R$ {g.totalDiscounted.toFixed(2)}</span>
                        </>
                      ) : (
                        <span className="text-ui font-medium tabular-nums text-primary">R$ {g.totalDiscounted.toFixed(2)}</span>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeFromCart(g.cartIds[g.cartIds.length - 1])}><Trash2 className="h-3 w-3" /></Button>
                  </motion.div>
                ));
              })()}
            </AnimatePresence>
            {cart.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <ShoppingCart className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-ui">Sacola vazia</p>
                <p className="text-caption">Escaneie um código de barras ou clique nos produtos</p>
              </div>
            )}
          </div>

          <div className="p-4 border-t space-y-3 shrink-0">
            {consignacaoMode ? (
              <>
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-3 py-2.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-caption text-amber-800 dark:text-amber-200 font-medium">
                    <PackageCheck className="h-3.5 w-3.5" />
                    Entrega condicional — sem cobrança
                  </div>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300/80">
                    <strong>Sem descontos nesta etapa.</strong> Os produtos sairão do estoque e ficarão registrados como consignados (não entram no histórico de vendas). Descontos, venda, troca ou devolução só acontecem na finalização.
                  </p>
                </div>
                <Separator />
                <div className="space-y-1">
                  <div className="flex justify-between text-caption text-muted-foreground">
                    <span>{cart.length} {cart.length === 1 ? "item" : "itens"}</span>
                    <span>Cliente: {selectedClient ? "selecionado" : "opcional"}</span>
                  </div>
                  <div className="flex justify-between text-subhead font-semibold">
                    <span>Valor referência</span>
                    <span className="tabular-nums text-muted-foreground line-through">R$ {subtotalOriginal.toFixed(2)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Nada será cobrado neste momento.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 h-10" onClick={() => setCart([])}>
                    Limpar
                  </Button>
                  <Button
                    className="flex-1 h-10 bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={finalizeConsignacao}
                    disabled={submittingConsignacao || cart.length === 0}
                  >
                    {submittingConsignacao ? "Registrando..." : "Registrar Consignação"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <SplitPaymentPanel
                  total={subtotal}
                  isSplit={isSplitPayment}
                  onSplitChange={(split) => {
                    setIsSplitPayment(split);
                    setCreditCardInfo(null);
                    setBoletoInfo(null);
                  }}
                  singleMethod={paymentMethod}
                  onSingleMethodChange={(method) => {
                    setPaymentMethod(method);
                    setCreditCardInfo(null);
                    setBoletoInfo(null);
                    if (method === "cartao" && cart.length > 0) {
                      setShowCreditCardModal(true);
                    } else if (method === "boleto" && cart.length > 0) {
                      setShowBoletoModal(true);
                    }
                  }}
                  entries={paymentEntries}
                  onEntriesChange={setPaymentEntries}
                  onOpenInstallments={(entryId, entryAmount) => {
                    setSplitInstallmentEntryId(entryId);
                    setSplitInstallmentAmount(entryAmount);
                    setShowCreditCardModal(true);
                  }}
                  onOpenBoleto={(entryId, entryAmount) => {
                    setSplitBoletoEntryId(entryId);
                    setSplitBoletoAmount(entryAmount);
                    setShowBoletoModal(true);
                  }}
                />

                {/* Show credit card / boleto info badge */}
                {!isSplitPayment && paymentMethod === "cartao" && creditCardInfo && (
                  <div className="flex items-center justify-between text-caption bg-secondary rounded-md px-3 py-1.5">
                    <span className="text-muted-foreground">{creditCardInfo.installments}x de R$ {(creditCardInfo.finalTotal / creditCardInfo.installments).toFixed(2)} (total R$ {creditCardInfo.finalTotal.toFixed(2)})</span>
                    <button className="text-primary text-xs underline" onClick={() => setShowCreditCardModal(true)}>Alterar</button>
                  </div>
                )}
                {!isSplitPayment && paymentMethod === "boleto" && boletoInfo && (
                  <div className="flex items-center justify-between text-caption bg-secondary rounded-md px-3 py-1.5">
                    <span className="text-muted-foreground">{boletoInfo.installments}x a cada {boletoInfo.interval} dias</span>
                    <button className="text-primary text-xs underline" onClick={() => setShowBoletoModal(true)}>Alterar</button>
                  </div>
                )}

                <Separator />
                <div className="space-y-1">
                  <div className="flex justify-between text-caption text-muted-foreground">
                    <span>{cart.length} {cart.length === 1 ? "item" : "itens"}</span>
                    {hasAnyWholesale && (
                      <span className="text-success flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        Atacado aplicado
                      </span>
                    )}
                  </div>
                  {hasAnyWholesale && totalSaved > 0 && (
                    <div className="flex justify-between text-caption">
                      <span className="text-muted-foreground">Valor original</span>
                      <span className="tabular-nums text-muted-foreground line-through">R$ {subtotalOriginal.toFixed(2)}</span>
                    </div>
                  )}
                  {hasAnyWholesale && totalSaved > 0 && (
                    <div className="flex justify-between text-caption">
                      <span className="text-success">Economia atacado</span>
                      <span className="tabular-nums text-success">- R$ {totalSaved.toFixed(2)}</span>
                    </div>
                  )}
                  {(() => {
                    const displayTotal = !isSplitPayment && paymentMethod === "cartao" && creditCardInfo
                      ? creditCardInfo.finalTotal
                      : !isSplitPayment && paymentMethod === "boleto" && boletoInfo
                        ? boletoInfo.finalTotal
                        : subtotal;
                    const hasInterest = displayTotal > subtotal + 0.01;
                    return (
                      <>
                        {hasInterest && (
                          <div className="flex justify-between text-caption text-muted-foreground">
                            <span>Subtotal</span>
                            <span className="tabular-nums">R$ {subtotal.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-subhead font-semibold">
                          <span>Total{hasInterest ? " c/ juros" : ""}</span>
                          <motion.span key={displayTotal} initial={{ scale: 1.05 }} animate={{ scale: 1 }} className={`tabular-nums ${hasAnyWholesale ? "text-success" : "text-foreground"}`}>
                            R$ {displayTotal.toFixed(2)}
                          </motion.span>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 h-10" onClick={() => { setCart([]); setCreditCardInfo(null); setBoletoInfo(null); }}>
                    Cancelar
                  </Button>
                  <Button className="flex-1 h-10" onClick={finalizeSale} disabled={submitting || !canSell} title={!canSell ? "Sem permissão para vender" : undefined}>
                    {submitting ? "Processando..." : "Finalizar (F2)"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Navigation blocker alert */}
      <AlertDialog open={blocker.state === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sacola com produtos</AlertDialogTitle>
            <AlertDialogDescription>
              Se você sair agora, os produtos da sacola serão removidos. Deseja sair mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCart([]);
                blocker.proceed?.();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sair mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Filial change blocker alert */}
      <AlertDialog open={pendingFilial !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sacola com produtos</AlertDialogTitle>
            <AlertDialogDescription>
              Ao trocar de filial, os produtos da sacola serão removidos. Deseja trocar mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingFilial(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCart([]);
                if (pendingFilial) setSelectedFilial(pendingFilial as any);
                setPendingFilial(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Trocar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Credit Card Installment Modal */}
      <CreditCardInstallmentDialog
        open={showCreditCardModal}
        onOpenChange={(open) => {
          setShowCreditCardModal(open);
          if (!open) {
            setSplitInstallmentEntryId(null);
            setSplitInstallmentAmount(0);
          }
        }}
        total={splitInstallmentEntryId ? splitInstallmentAmount : subtotal}
        onConfirm={(installments, finalTotal) => {
          if (splitInstallmentEntryId) {
            // Update the split payment entry with installment info
            setPaymentEntries(prev =>
              prev.map(e => e.id === splitInstallmentEntryId
                ? { ...e, installments, finalTotal }
                : e
              )
            );
            setSplitInstallmentEntryId(null);
            setSplitInstallmentAmount(0);
          } else {
            setCreditCardInfo({ installments, finalTotal });
          }
        }}
      />

      {/* Boleto Config Modal */}
      <BoletoConfigDialog
        open={showBoletoModal}
        onOpenChange={(open) => {
          setShowBoletoModal(open);
          if (!open) {
            setSplitBoletoEntryId(null);
            setSplitBoletoAmount(0);
          }
        }}
        total={splitBoletoEntryId ? splitBoletoAmount : subtotal}
        onConfirm={(interval, installments, finalTotal) => {
          if (splitBoletoEntryId) {
            setPaymentEntries(prev =>
              prev.map(e => e.id === splitBoletoEntryId
                ? { ...e, boletoInterval: interval, boletoInstallments: installments, finalTotal }
                : e
              )
            );
            setSplitBoletoEntryId(null);
            setSplitBoletoAmount(0);
          } else {
            setBoletoInfo({ interval, installments, finalTotal });
          }
        }}
      />

      {/* Discount Rule Selection Dialog */}
      <DiscountRuleDialog
        open={showDiscountDialog}
        onOpenChange={setShowDiscountDialog}
        rules={applicableRules}
        hasConflict={rulesHaveConflict}
        onConfirm={(rules) => setSelectedDiscountRules(rules)}
      />

      {/* Product Image Zoom */}
      <ProductImageDialog
        open={!!zoomImage}
        onOpenChange={(o) => { if (!o) setZoomImage(null); }}
        imageUrl={zoomImage?.url || ""}
        productName={zoomImage?.name || ""}
        category={zoomImage?.category}
        classificacao={zoomImage?.classificacao}
        haste={zoomImage?.haste}
        lente={zoomImage?.lente}
        ponte={zoomImage?.ponte}
      />

      {/* Cupom Fiscal Dialog */}
      <CupomFiscalDialog
        open={showCupom}
        onOpenChange={setShowCupom}
        data={cupomData}
      />
    </div>
  );
}
