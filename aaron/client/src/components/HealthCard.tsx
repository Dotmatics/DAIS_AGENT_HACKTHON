import type { ComponentProps } from 'react';
import { Card } from '@databricks/appkit-ui/react';
import { cn } from '../lib/utils';
import { healthCardClass } from '../lib/theme';

export function HealthCard({ className, ...props }: ComponentProps<typeof Card>) {
  return <Card className={cn(healthCardClass, className)} {...props} />;
}
