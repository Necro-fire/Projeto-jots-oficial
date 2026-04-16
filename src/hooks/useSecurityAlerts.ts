import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface SecurityAlert {
  id: string;
  alert_type: string;
  severity: string;
  message: string;
  details: any;
  user_id: string | null;
  resolved: boolean;
  created_at: string;
}

export function useSecurityAlerts() {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const { isAdmin } = useAuth();

  const fetchAlerts = useCallback(async () => {
    if (!isAdmin) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('security_alerts')
      .select('*')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) setAlerts(data as unknown as SecurityAlert[]);
    setLoading(false);
  }, [isAdmin]);

  const resolveAlert = useCallback(async (id: string) => {
    if (!isAdmin) return;

    await supabase
      .from('security_alerts')
      .update({ resolved: true, resolved_at: new Date().toISOString() } as any)
      .eq('id', id);
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    fetchAlerts();
    const channel = supabase
      .channel(`security_alerts_changes_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'security_alerts' }, (payload) => {
        setAlerts(prev => [payload.new as unknown as SecurityAlert, ...prev]);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAlerts, isAdmin]);

  return { alerts, loading, resolveAlert, refetch: fetchAlerts };
}
