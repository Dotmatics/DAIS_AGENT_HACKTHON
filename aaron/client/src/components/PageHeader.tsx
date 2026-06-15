import { pageSubtitleClass, pageTitleClass } from '../lib/theme';

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className={pageTitleClass}>{title}</h2>
      {subtitle && <p className={pageSubtitleClass}>{subtitle}</p>}
    </div>
  );
}
