import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { AuthProvider } from "@/contexts/AuthContext";
import { FilialProvider } from "@/contexts/FilialContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// Cada tela vira um arquivo próprio, baixado só quando a rota é aberta.
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"));
const PDV = lazyWithRetry(() => import("./pages/PDV"));
const Produtos = lazyWithRetry(() => import("./pages/Produtos"));
const Clientes = lazyWithRetry(() => import("./pages/Clientes"));
const Funcionarios = lazyWithRetry(() => import("./pages/Funcionarios"));
const Vendas = lazyWithRetry(() => import("./pages/Vendas"));
const Estoque = lazyWithRetry(() => import("./pages/Estoque"));
const Caixa = lazyWithRetry(() => import("./pages/Caixa"));
const Permissoes = lazyWithRetry(() => import("./pages/Permissoes"));
const Relatorios = lazyWithRetry(() => import("./pages/Relatorios"));
const NotasFiscais = lazyWithRetry(() => import("./pages/NotasFiscais"));
const EmitirNF = lazyWithRetry(() => import("./pages/EmitirNF"));
const ConfiguracaoFiscal = lazyWithRetry(() => import("./pages/ConfiguracaoFiscal"));
const Empresas = lazyWithRetry(() => import("./pages/Empresas"));
const CertificadoDigital = lazyWithRetry(() => import("./pages/CertificadoDigital"));
const Cargos = lazyWithRetry(() => import("./pages/Cargos"));
const TrafegoFiliais = lazyWithRetry(() => import("./pages/TrafegoFiliais"));
const ProdutosConsignados = lazyWithRetry(() => import("./pages/ProdutosConsignados"));
const Fornecedores = lazyWithRetry(() => import("./pages/Fornecedores"));

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
  },
  {
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: "/", element: <ProtectedRoute module="dashboard" action="view"><Dashboard /></ProtectedRoute> },
      { path: "/pdv", element: <ProtectedRoute module="pdv" action="view"><PDV /></ProtectedRoute> },
      { path: "/produtos", element: <ProtectedRoute module="produtos" action="view"><Produtos /></ProtectedRoute> },
      { path: "/clientes", element: <ProtectedRoute module="clientes" action="view"><Clientes /></ProtectedRoute> },
      { path: "/funcionarios", element: <ProtectedRoute module="funcionarios" action="view"><Funcionarios /></ProtectedRoute> },
      { path: "/vendas", element: <ProtectedRoute module="vendas" action="view"><Vendas /></ProtectedRoute> },
      { path: "/estoque", element: <ProtectedRoute module="estoque" action="view"><Estoque /></ProtectedRoute> },
      { path: "/caixa", element: <ProtectedRoute module="caixa" action="view"><Caixa /></ProtectedRoute> },
      { path: "/permissoes", element: <ProtectedRoute module="admin" action="manage_permissions"><Permissoes /></ProtectedRoute> },
      { path: "/relatorios", element: <ProtectedRoute module="relatorios" action="view"><Relatorios /></ProtectedRoute> },
      { path: "/notas-fiscais", element: <ProtectedRoute module="fiscal" action="view_nf"><NotasFiscais /></ProtectedRoute> },
      { path: "/adicionar-nf", element: <ProtectedRoute module="fiscal" action="add_nf"><EmitirNF /></ProtectedRoute> },
      { path: "/emitir-nf", element: <ProtectedRoute module="fiscal" action="manage"><EmitirNF /></ProtectedRoute> },
      { path: "/configuracao-fiscal", element: <ProtectedRoute module="fiscal" action="manage"><ConfiguracaoFiscal /></ProtectedRoute> },
      { path: "/empresas", element: <ProtectedRoute module="fiscal" action="manage"><Empresas /></ProtectedRoute> },
      { path: "/fornecedores", element: <ProtectedRoute module="fornecedores" action="view"><Fornecedores /></ProtectedRoute> },
      { path: "/certificado-digital", element: <ProtectedRoute module="fiscal" action="manage"><CertificadoDigital /></ProtectedRoute> },
      { path: "/cargos", element: <ProtectedRoute module="admin" action="manage_roles"><Cargos /></ProtectedRoute> },
      { path: "/trafego-filiais", element: <ProtectedRoute module="trafego_filiais" action="view"><TrafegoFiliais /></ProtectedRoute> },
      { path: "/produtos-consignados", element: <ProtectedRoute module="produtos_consignados" action="view"><ProdutosConsignados /></ProtectedRoute> },
      
      { path: "*", element: <NotFound /> },
    ],
  },
]);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <FilialProvider>
          <Toaster />
          <Sonner />
          <RouterProvider router={router} />
        </FilialProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
