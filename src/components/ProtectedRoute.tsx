import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  module?: string;
  action?: string;
}

export function ProtectedRoute({ children, module, action }: ProtectedRouteProps) {
  const { user, loading, hasPermission } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (module && action && !hasPermission(module, action)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <p className="text-lg font-medium">Acesso negado</p>
        <p className="text-sm mt-1">Você não possui permissão para acessar esta página.</p>
      </div>
    );
  }

  return <>{children}</>;
}
