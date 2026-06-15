import { createBrowserRouter, RouterProvider, NavLink, Outlet } from 'react-router';
import { useState, useEffect } from 'react';
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  useIsMobile,
} from '@databricks/appkit-ui/react';
import { Menu, HeartPulse } from 'lucide-react';
import { OverviewPage } from './pages/OverviewPage';
import { DistrictPage } from './pages/DistrictPage';
import { FacilitiesPage } from './pages/FacilitiesPage';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? 'bg-[#FF3621] text-white'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? 'bg-[#FF3621] text-white'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

type NavLinkClassFn = (props: { isActive: boolean }) => string;

function NavLinks({ className, linkClass, onClick }: { className?: string; linkClass: NavLinkClassFn; onClick?: () => void }) {
  return (
    <nav className={className}>
      <NavLink to="/" end className={linkClass} onClick={onClick}>Overview</NavLink>
      <NavLink to="/districts" className={linkClass} onClick={onClick}>Districts</NavLink>
      <NavLink to="/facilities" className={linkClass} onClick={onClick}>Facilities</NavLink>
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
    <div className="min-h-screen bg-[#F9F7F4] flex flex-col">
      <header className="bg-[#0B2026] border-b border-[#0B2026]/20 px-4 md:px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-[#FF3621]" />
          <h1 className="text-lg font-semibold text-white">India Health Access</h1>
        </div>
        <NavLinks className="hidden md:flex gap-1 ml-4" linkClass={navLinkClass} />
        <div className="ml-auto md:hidden">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <Button variant="ghost" size="icon" onClick={() => setMobileNavOpen(true)} className="text-white hover:bg-white/10">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open navigation</span>
            </Button>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <NavLinks className="flex flex-col gap-1 mt-4" linkClass={mobileNavLinkClass} onClick={() => setMobileNavOpen(false)} />
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
      { path: '/', element: <OverviewPage /> },
      { path: '/districts', element: <DistrictPage /> },
      { path: '/facilities', element: <FacilitiesPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
