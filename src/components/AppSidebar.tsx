import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  UserCog,
  BarChart3,
  Warehouse,
  Wallet,
  FileText,
  Receipt,
  FilePlus,
  Settings2,
  Building2,
  ShieldCheck,
  Shield,
  KeyRound,
  LogOut,
  ArrowLeftRight,
  PackageCheck,
  Truck,
  Clock,
} from "lucide-react";
import jotsLogo from "@/assets/jots-logo.png";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const mainNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, module: "Dashboard", action: "view" },
  { title: "PDV", url: "/pdv", icon: ShoppingCart, module: "PDV", action: "view" },
  { title: "Produtos", url: "/produtos", icon: Package, module: "Produtos", action: "view" },
  { title: "Clientes", url: "/clientes", icon: Users, module: "Clientes", action: "view" },
];

const staffNav = [
  { title: "Funcionários", url: "/funcionarios", icon: UserCog, module: "Funcionários", action: "view" },
  { title: "Cargos", url: "/cargos", icon: Shield, module: "Administração", action: "manage_roles" },
  
];

const managementNav = [
  { title: "Vendas", url: "/vendas", icon: FileText, module: "Vendas", action: "view" },
  { title: "Estoque", url: "/estoque", icon: Warehouse, module: "Estoque", action: "view" },
  { title: "Caixa", url: "/caixa", icon: Wallet, module: "Caixa", action: "view" },
  { title: "Fornecedores", url: "/fornecedores", icon: Truck, module: "Estoque", action: "view" },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3, module: "Relatórios", action: "view" },
  { title: "Tráfego entre Filiais", url: "/trafego-filiais", icon: ArrowLeftRight, module: "Estoque", action: "view" },
  { title: "Produtos Consignados", url: "/produtos-consignados", icon: PackageCheck, module: "Vendas", action: "view" },
];

const fiscalNav = [
  { title: "Notas Fiscais", url: "/notas-fiscais", icon: Receipt, module: "Fiscal", action: "view_nf" },
  { title: "Adicionar NF", url: "/adicionar-nf", icon: FilePlus, module: "Fiscal", action: "add_nf" },
];

const comingSoonNav = [
  { title: "Emitir NF", url: "/emitir-nf", icon: FilePlus, module: "Fiscal", action: "manage" },
  { title: "Config. Fiscal", url: "/configuracao-fiscal", icon: Settings2, module: "Fiscal", action: "manage" },
  { title: "Empresas", url: "/empresas", icon: Building2, module: "Fiscal", action: "manage" },
  { title: "Certificado", url: "/certificado-digital", icon: ShieldCheck, module: "Fiscal", action: "manage" },
];


export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { hasPermission, profile, signOut } = useAuth();
  const isActive = (path: string) => location.pathname === path;

  const renderNavGroup = (items: typeof mainNav) => {
    const visibleItems = items.filter(item => hasPermission(item.module, item.action));
    if (visibleItems.length === 0) return null;
    return visibleItems.map((item) => (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild isActive={isActive(item.url)}>
          <NavLink to={item.url} end>
            <item.icon className="h-4 w-4" />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <img src={jotsLogo} alt="Jots" className="h-8 w-8 rounded-md object-contain" />
            <div>
              <h1 className="font-semibold text-ui tracking-tight text-sidebar-foreground">Jots</h1>
              <p className="text-caption text-muted-foreground">Distribuidora</p>
            </div>
          </div>
        ) : (
          <img src={jotsLogo} alt="Jots" className="h-8 w-8 rounded-md object-contain mx-auto" />
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderNavGroup(mainNav)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {staffNav.some(i => hasPermission(i.module, i.action)) && (
          <SidebarGroup>
            <SidebarGroupLabel>Funcionários</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderNavGroup(staffNav)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {managementNav.some(i => hasPermission(i.module, i.action)) && (
          <SidebarGroup>
            <SidebarGroupLabel>Gestão</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderNavGroup(managementNav)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {fiscalNav.some(i => hasPermission(i.module, i.action)) && (
          <SidebarGroup>
            <SidebarGroupLabel>Fiscal</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderNavGroup(fiscalNav)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {hasPermission('Sistema', 'view_em_breve') && (
        <Collapsible>
          <SidebarGroup>
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors">
                <Clock className="h-3 w-3" />
                Em Breve
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {comingSoonNav.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild disabled className="opacity-50 cursor-not-allowed">
                        <span>
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
        )}

      </SidebarContent>

      <SidebarFooter className="p-3 space-y-2">
        {!collapsed && (
          <div className="flex items-center gap-2 rounded-md bg-secondary p-2">
            {profile ? (
              <>
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                  {profile.nome.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-caption font-medium truncate">{profile.nome}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{profile.tipo}</p>
                </div>
              </>
            ) : (
              <div className="flex-1 min-w-0">
                <p className="text-caption font-medium">Usuário</p>
              </div>
            )}
            <button
              onClick={signOut}
              className="text-muted-foreground hover:text-destructive transition-colors"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
        {collapsed && (
          <button
            onClick={signOut}
            className="mx-auto flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
