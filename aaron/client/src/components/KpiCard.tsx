import { Card, CardContent, Skeleton } from '@databricks/appkit-ui/react';

export function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  description,
}: {
  title: string;
  value: string | number | null;
  icon: React.ElementType;
  color: string;
  description?: string;
}) {
  return (
    <Card className="bg-white shadow-sm border-0">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            {value === null ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-3xl font-bold text-[#0B2026]">{value}</p>
            )}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          <div className={`rounded-lg p-2 ${color}`}>
            <Icon className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
