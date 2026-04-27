import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session, User } from '@supabase/supabase-js';

interface Profile {
  id: string;
  nome: string;
  email: string;
  tipo: string;
}

interface Permission {
  module: string;
  action: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  permissions: Permission[];
  roles: string[];
  isAdmin: boolean;
  loading: boolean;
  employeeFilialId: string | null;
  hasPermission: (module: string, action: string) => boolean;
  hasModuleAccess: (module: string) => boolean;
  hasRole: (role: string) => boolean;
  signOut: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [employeeFilialId, setEmployeeFilialId] = useState<string | null>(null);

  const loadUserData = useCallback(async (userId: string) => {
    try {
      const [profileRes, adminRes, permsRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.rpc('has_role', { _user_id: userId, _role: 'admin' }),
        supabase.rpc('get_user_permissions', { _user_id: userId }),
        supabase.from('user_roles').select('role_id, roles(name)').eq('user_id', userId),
      ]);

      if (profileRes.data) setProfile(profileRes.data as unknown as Profile);
      const userIsAdmin = !!adminRes.data;
      setIsAdmin(userIsAdmin);
      if (permsRes.data) setPermissions(permsRes.data as unknown as Permission[]);
      if (rolesRes.data) {
        setRoles(rolesRes.data.map((r: any) => r.roles?.name).filter(Boolean));
      }

      // Load employee filial_id from funcionarios_auth
      if (!userIsAdmin) {
        const { data: funcData } = await (supabase as any)
          .from('funcionarios_auth')
          .select('filial_id')
          .eq('user_id', userId)
          .maybeSingle();
        setEmployeeFilialId(funcData?.filial_id || null);
      } else {
        setEmployeeFilialId(null); // Admin sees all
      }
    } catch (e) {
      console.error('Error loading user data:', e);
    }
  }, []);

  const refreshPermissions = useCallback(async () => {
    if (user) await loadUserData(user.id);
  }, [user, loadUserData]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        setTimeout(() => loadUserData(session.user.id), 0);
      } else {
        setProfile(null);
        setPermissions([]);
        setRoles([]);
        setIsAdmin(false);
        setEmployeeFilialId(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [loadUserData]);

  const hasPermission = useCallback((module: string, action: string) => {
    if (isAdmin) return true;
    return permissions.some(p => p.module === module && p.action === action);
  }, [isAdmin, permissions]);

  // Grants module access if the user has ANY permission in that module.
  // This makes "view" implicit — having any action in the module reveals the screen.
  const hasModuleAccess = useCallback((module: string) => {
    if (isAdmin) return true;
    return permissions.some(p => p.module === module);
  }, [isAdmin, permissions]);

  const hasRole = useCallback((role: string) => {
    if (isAdmin && role === 'admin') return true;
    return roles.includes(role);
  }, [isAdmin, roles]);

  const signOut = async () => {
    if (user) {
      try {
        await supabase.functions.invoke('auth-api', {
          body: { action: 'logout', user_id: user.id, user_name: profile?.nome || '' },
        });
      } catch {}
    }
    await supabase.auth.signOut();
    setProfile(null);
    setPermissions([]);
    setRoles([]);
    setIsAdmin(false);
    setEmployeeFilialId(null);
  };

  return (
    <AuthContext.Provider value={{
      session, user, profile, permissions, roles, isAdmin, loading,
      employeeFilialId,
      hasPermission, hasRole, signOut, refreshPermissions,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
