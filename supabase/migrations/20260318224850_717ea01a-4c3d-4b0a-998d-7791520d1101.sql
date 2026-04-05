
-- Create roles table
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Create permissions table
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  action text NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(module, action)
);

-- Create role_permissions junction
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE NOT NULL,
  permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(role_id, permission_id)
);

-- Create user_roles junction
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(user_id, role_id)
);

-- Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  tipo text NOT NULL DEFAULT 'admin',
  created_at timestamptz DEFAULT now()
);

-- Create funcionarios_auth table
CREATE TABLE public.funcionarios_auth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  codigo_acesso text NOT NULL UNIQUE,
  telefone text DEFAULT '',
  cargo text DEFAULT '',
  filial_id text DEFAULT '1',
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

-- Security definer: check role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id AND r.name = _role
  )
$$;

-- Security definer: check permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id AND p.module = _module AND p.action = _action
  )
$$;

-- Security definer: get user permissions
CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id uuid)
RETURNS TABLE(module text, action text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.module, p.action
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON rp.role_id = ur.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ur.user_id = _user_id
$$;

-- Enable RLS
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funcionarios_auth ENABLE ROW LEVEL SECURITY;

-- Read policies
CREATE POLICY "auth_read_roles" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_permissions" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_rp" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_ur" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_func" ON public.funcionarios_auth FOR SELECT TO authenticated USING (true);

-- Admin write policies
CREATE POLICY "admin_insert_roles" ON public.roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_update_roles" ON public.roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_delete_roles" ON public.roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_insert_perms" ON public.permissions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_update_perms" ON public.permissions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_delete_perms" ON public.permissions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_insert_rp" ON public.role_permissions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_delete_rp" ON public.role_permissions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_insert_ur" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_delete_ur" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_insert_func" ON public.funcionarios_auth FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_update_func" ON public.funcionarios_auth FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_delete_func" ON public.funcionarios_auth FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "insert_own_profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "update_own_profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- Seed roles
INSERT INTO public.roles (name, description) VALUES
  ('admin', 'Administrador com acesso total ao sistema'),
  ('gerente', 'Gerente de loja com acesso amplo'),
  ('vendedor', 'Vendedor com acesso ao PDV e clientes'),
  ('caixa', 'Operador de caixa');

-- Seed permissions
INSERT INTO public.permissions (module, action, description) VALUES
  ('dashboard', 'view', 'Visualizar dashboard'),
  ('produtos', 'view', 'Visualizar produtos'),
  ('produtos', 'create', 'Criar produtos'),
  ('produtos', 'edit', 'Editar produtos'),
  ('produtos', 'delete', 'Excluir produtos'),
  ('clientes', 'view', 'Visualizar clientes'),
  ('clientes', 'create', 'Criar clientes'),
  ('clientes', 'edit', 'Editar clientes'),
  ('clientes', 'delete', 'Excluir clientes'),
  ('vendas', 'view', 'Visualizar vendas'),
  ('vendas', 'create', 'Criar vendas'),
  ('estoque', 'view', 'Visualizar estoque'),
  ('estoque', 'edit', 'Editar estoque'),
  ('caixa', 'view', 'Visualizar caixa'),
  ('caixa', 'manage', 'Gerenciar caixa'),
  ('funcionarios', 'view', 'Visualizar funcionários'),
  ('funcionarios', 'create', 'Criar funcionários'),
  ('funcionarios', 'edit', 'Editar funcionários'),
  ('relatorios', 'view', 'Visualizar relatórios'),
  ('fiscal', 'view', 'Visualizar área fiscal'),
  ('fiscal', 'manage', 'Gerenciar área fiscal'),
  ('malas', 'view', 'Visualizar malas'),
  ('malas', 'manage', 'Gerenciar malas'),
  ('pdv', 'view', 'Acessar PDV'),
  ('pdv', 'sell', 'Realizar vendas no PDV'),
  ('admin', 'manage_roles', 'Gerenciar cargos'),
  ('admin', 'manage_permissions', 'Gerenciar permissões'),
  ('admin', 'manage_users', 'Gerenciar usuários');

-- Assign all permissions to admin role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p WHERE r.name = 'admin';
