import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

  const fetchAlerts = useCallback(async () => {
    const { data } = await supabase
      .from('security_alerts')
      .select('*')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setAlerts(data as unknown as SecurityAlert[]);
    setLoading(false);
  }, []);

  const resolveAlert = useCallback(async (id: string) => {
    await supabase
      .from('security_alerts')
      .update({ resolved: true, resolved_at: new Date().toISOString() } as any)
      .eq('id', id);
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  useEffect(() => {
    fetchAlerts();
    const channel = supabase
      .channel('security_alerts_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'security_alerts' }, (payload) => {
        setAlerts(prev => [payload.new as unknown as SecurityAlert, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAlerts]);

  return { alerts, loading, resolveAlert, refetch: fetchAlerts };
}
