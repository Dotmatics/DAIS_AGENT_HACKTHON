import { createBrowserRouter, RouterProvider, NavLink, Outlet } from 'react-router';
import { useState, useEffect } from 'react';
import {
  Button, Sheet, SheetContent, SheetHeader, SheetTitle, useIsMobile,
} from '@databricks/appkit-ui/react';
import { Menu, HeartPulse, Settings } from 'lucide-react';
import { GapThresholdProvider } from './context/GapThresholdContext';
import { SettingsPanel } from './components/SettingsPanel';
import { OverviewPage } from './pages/OverviewPage';
import { DistrictPage } from './pages/DistrictPage';
import { SessionsPage } from './pages/SessionsPage';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'bg-[#FF3621] text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
  }`;

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'bg-[#FF3621] text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

function Layout() {
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => { if (!isMobile) setMobileNavOpen(false); }, [isMobile]);

  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col">
      <header className="bg-[#0B2026] px-4 md:px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-[#FF3621]" />
          <h1 className="text-lg font-serif font-bold text-white">Usage Dashboard</h1>
        </div>
        <nav className="hidden md:flex gap-1 ml-4">
          <NavLink to="/" end className={navLinkClass}>Overview</NavLink>
          <NavLink to="/districts" className={navLinkClass}>Districts</NavLink>
          <NavLink to="/sessions" className={navLinkClass}>Sessions</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)}
            className="text-white/70 hover:bg-white/10 hover:text-white">
            <Settings className="h-4 w-4" />
            <span className="sr-only">Settings</span>
          </Button>
          <div className="md:hidden">
            <Button variant="ghost" size="icon" onClick={() => setMobileNavOpen(true)}
              className="text-white hover:bg-white/10">
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left">
          <SheetHeader><SheetTitle>Navigation</SheetTitle></SheetHeader>
          <nav className="flex flex-col gap-1 mt-4">
            <NavLink to="/" end className={mobileNavLinkClass} onClick={() => setMobileNavOpen(false)}>Overview</NavLink>
            <NavLink to="/districts" className={mobileNavLinkClass} onClick={() => setMobileNavOpen(false)}>Districts</NavLink>
            <NavLink to="/sessions" className={mobileNavLinkClass} onClick={() => setMobileNavOpen(false)}>Sessions</NavLink>
          </nav>
        </SheetContent>
      </Sheet>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <main className="flex-1 p-4 md:p-6"><Outlet /></main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <OverviewPage /> },
      { path: '/districts', element: <DistrictPage /> },
      { path: '/sessions', element: <SessionsPage /> },
    ],
  },
]);

export default function App() {
  return (
    <GapThresholdProvider>
      <RouterProvider router={router} />
    </GapThresholdProvider>
  );
}
