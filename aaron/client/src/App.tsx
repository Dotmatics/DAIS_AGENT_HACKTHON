import { createBrowserRouter, RouterProvider, NavLink, Outlet, Navigate } from 'react-router';
import { useState, useEffect } from 'react';
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  useIsMobile,
} from '@databricks/appkit-ui/react';
import { HeartPulse, Menu } from 'lucide-react';
import { AnalyticsPage } from './pages/analytics/AnalyticsPage';
import { SmsPage } from './pages/sms/SmsPage';
import { healthMobileNavLinkClass, healthNavLinkClass } from './lib/theme';

type NavLinkClassFn = (props: { isActive: boolean }) => string;

function NavLinks({
  className,
  linkClass,
  onClick,
}: {
  className?: string;
  linkClass: NavLinkClassFn;
  onClick?: () => void;
}) {
  return (
    <nav className={className}>
      <NavLink to="/" end className={linkClass} onClick={onClick}>
        SMS
      </NavLink>
      <NavLink to="/analytics" className={linkClass} onClick={onClick}>
        Analytics
      </NavLink>
    </nav>
  );
}

function Layout() {
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!isMobile) setMobileNavOpen(false);
  }, [isMobile]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F9F7F4]">
      <header className="flex items-center gap-4 bg-[#0B2026] px-4 py-3 md:px-6">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-[#FF3621]" strokeWidth={2.5} />
          <h1 className="text-lg font-semibold text-white">Luma — Rural Health SMS</h1>
        </div>
        <NavLinks className="ml-4 hidden gap-1 md:flex" linkClass={healthNavLinkClass} />
        <div className="ml-auto md:hidden">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileNavOpen(true)}
              className="text-white hover:bg-white/10"
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open navigation</span>
            </Button>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <NavLinks
                className="mt-4 flex flex-col gap-1"
                linkClass={healthMobileNavLinkClass}
                onClick={() => setMobileNavOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <SmsPage /> },
      { path: '/agents', element: <Navigate to="/" replace /> },
      { path: '/analytics', element: <AnalyticsPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
