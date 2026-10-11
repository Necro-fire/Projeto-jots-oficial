import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useAuditLog() {
  const { user } = useAuth();

  const log = useCallback(async (actionName: string, module: string, details: Record<string, any> = {}) => {
    if (!user) return;
    try {
      await supabase.functions.invoke('auth-api', {
        body: {
          action: 'audit-log',
          action_name: actionName,
          module,
          details,
        },
      });
    } catch (e) {
      console.error('Falha ao registrar auditoria:', e);
    }
  }, [user]);

  return { log };
}
