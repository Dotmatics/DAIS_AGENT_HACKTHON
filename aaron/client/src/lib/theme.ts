/** India Health Access design tokens (shared with dais-2026-app template). */
export const healthColors = {
  navy: '#0B2026',
  accent: '#FF3621',
  background: '#F9F7F4',
  surface: '#FFFFFF',
  surfaceMuted: '#EEEDE9',
} as const;

export const healthNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? 'bg-[#FF3621] text-white'
      : 'text-white/70 hover:bg-white/10 hover:text-white'
  }`;

export const healthMobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? 'bg-[#FF3621] text-white'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

export const pageTitleClass = 'text-2xl font-bold text-[#0B2026]';
export const pageSubtitleClass = 'text-muted-foreground mt-1';
export const healthCardClass = 'bg-white shadow-sm border-0';
