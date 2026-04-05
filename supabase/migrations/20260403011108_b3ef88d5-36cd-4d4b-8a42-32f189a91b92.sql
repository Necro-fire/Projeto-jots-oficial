
-- Audit logs table for all critical operations
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_name text NOT NULL DEFAULT '',
  action text NOT NULL,
  module text NOT NULL,
  details jsonb DEFAULT '{}',
  ip_address text DEFAULT '',
  origin text DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Security alerts table
CREATE TABLE public.security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  message text NOT NULL,
  details jsonb DEFAULT '{}',
  user_id uuid,
  resolved boolean DEFAULT false,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Login attempts tracking
CREATE TABLE public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf text NOT NULL,
  ip_address text DEFAULT '',
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Audit logs: only admins can read, system inserts via service role
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Security alerts: admins can read and update (resolve)
CREATE POLICY "Admins can view security alerts"
ON public.security_alerts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update security alerts"
ON public.security_alerts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Login attempts: no direct access (managed by edge function)
-- No public policies needed

-- Index for performance
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs (user_id);
CREATE INDEX idx_audit_logs_module ON public.audit_logs (module);
CREATE INDEX idx_security_alerts_resolved ON public.security_alerts (resolved, created_at DESC);
CREATE INDEX idx_login_attempts_cpf ON public.login_attempts (cpf, created_at DESC);
