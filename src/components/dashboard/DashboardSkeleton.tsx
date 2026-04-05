import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function DashboardSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-64" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-7 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-10 w-10 rounded-md" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="shadow-card lg:col-span-2">
          <CardHeader className="p-4 pb-2">
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <Skeleton className="h-[220px] w-full rounded-md" />
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="p-4 pb-2">
            <Skeleton className="h-5 w-28" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <Skeleton className="h-[140px] w-full rounded-md" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
