import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { AuthProvider } from "@/contexts/AuthContext";
import { FilialProvider } from "@/contexts/FilialContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import PDV from "./pages/PDV";
import Produtos from "./pages/Produtos";
import Clientes from "./pages/Clientes";
import Funcionarios from "./pages/Funcionarios";
import Vendas from "./pages/Vendas";
import Estoque from "./pages/Estoque";
import Caixa from "./pages/Caixa";
import Permissoes from "./pages/Permissoes";
import Relatorios from "./pages/Relatorios";
import NotasFiscais from "./pages/NotasFiscais";
import EmitirNF from "./pages/EmitirNF";
import ConfiguracaoFiscal from "./pages/ConfiguracaoFiscal";
import Empresas from "./pages/Empresas";
import CertificadoDigital from "./pages/CertificadoDigital";
import Cargos from "./pages/Cargos";
import TrafegoFiliais from "./pages/TrafegoFiliais";
import ProdutosConsignados from "./pages/ProdutosConsignados";
import Fornecedores from "./pages/Fornecedores";
import HistoricoCompras from "./pages/HistoricoCompras";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

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
      { path: "/historico-compras", element: <ProtectedRoute module="fornecedores" action="view"><HistoricoCompras /></ProtectedRoute> },
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
