import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useAuditLog() {
  const { user, profile } = useAuth();

  const log = useCallback(async (actionName: string, module: string, details: Record<string, any> = {}) => {
    if (!user) return;
    try {
      await supabase.functions.invoke('auth-api', {
        body: {
          action: 'audit-log',
          user_id: user.id,
          user_name: profile?.nome || '',
          action_name: actionName,
          module,
          details,
        },
      });
    } catch {}
  }, [user, profile]);

  return { log };
}
