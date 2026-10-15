import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLogout } from '../../hooks/useLogout';
import UpcharGangaLogo from '../../assets/logo/UpcharGangaLogo';

const ROLE_ACCENTS = {
  reception: {
    dot: 'bg-gold-500',
    active: 'bg-gold-50 text-gold-600 border-l-4 border-l-gold-500',
    border: 'border-neutral-200',
  },
  doctor: {
    dot: 'bg-teal-500',
    active: 'bg-teal-50 text-teal-600 border-l-4 border-l-teal-500',
    border: 'border-neutral-200',
  },
  admin: {
    dot: 'bg-blue-500',
    active: 'bg-blue-50 text-blue-600 border-l-4 border-l-blue-500',
    border: 'border-neutral-200',
  },
};

const DashboardShell = ({ roleLabel, accent, navItems, navSections }) => {
  const { user } = useAuth();
  const handleLogout = useLogout();
  const accentColors = ROLE_ACCENTS[accent] || ROLE_ACCENTS.admin;
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const hospitalName = user?.hospital?.name || user?.assignedHospital?.name || 'Hospital';
  const hasNavSections = !!navSections && navSections.length > 0;

  const sidebarContent = (
    <>
      {/* Dual Branding Section */}
      <div className="border-b border-neutral-200 px-lg py-lg bg-gradient-to-b from-neutral-0 to-neutral-50">
        <div className="flex items-center justify-between gap-md mb-md">
          <div className="flex items-center gap-md min-w-0 flex-1">
            <div className="w-8 h-8 flex-shrink-0">
              <UpcharGangaLogo variant="mark" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black text-upchar-700 truncate">UpcharGanga</div>
              {hasNavSections ? (
                <div className="text-xs font-medium text-neutral-600 truncate">
                  Healthcare Queue Platform
                </div>
              ) : (
                <div className="text-xs font-medium text-upchar-600">Platform</div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsDrawerOpen(false)}
            aria-label="Close menu"
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 md:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="my-md h-px bg-neutral-200" />

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-sm">
            Your Hospital
          </p>
          <p className="text-sm font-bold text-neutral-900 truncate" title={hospitalName}>
            {hospitalName}
          </p>
          <p className="text-xs text-neutral-600 mt-sm">{roleLabel}</p>
        </div>
      </div>

      {/* Navigation */}
      {hasNavSections ? (
        <nav className="flex-1 space-y-xl px-md py-lg overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.title}>
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-md px-md">
                {section.title}
              </p>
              <div className="space-y-sm">
                {section.items.map(({ label, path, end, icon: Icon }) => (
                  <NavLink
                    key={path}
                    to={path}
                    end={end}
                    onClick={() => setIsDrawerOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-md rounded-md px-md py-2.5 text-sm font-medium transition-all duration-fast ${
                        isActive
                          ? accentColors.active
                          : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                      }`
                    }
                  >
                    {Icon && <Icon className="w-5 h-5 flex-shrink-0" />}
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      ) : (
        <nav className="flex-1 space-y-sm px-md py-lg overflow-y-auto">
          {navItems.map(({ label, path, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              onClick={() => setIsDrawerOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-md rounded-md px-md py-2.5 text-sm font-medium transition-all duration-fast ${
                  isActive
                    ? accentColors.active
                    : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      )}

      {/* User & Actions */}
      <div className="border-t border-neutral-200 px-lg py-lg space-y-lg">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-sm">
            Logged in as
          </p>
          <p className="text-sm font-semibold text-neutral-900 truncate" title={user?.fullName}>
            {user?.fullName ?? '—'}
          </p>
          <p className="text-xs text-neutral-600 mt-sm truncate">{user?.email}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded-md border border-neutral-200 px-md py-2.5 text-sm font-medium text-neutral-600 transition-all duration-fast hover:border-danger-300 hover:bg-danger-50 hover:text-danger-600"
        >
          Log out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen md:h-screen flex-col bg-neutral-50 md:flex-row overflow-x-hidden">
      {/* Mobile Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-200 bg-neutral-0 px-4 py-3 md:hidden shadow-base">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 flex-shrink-0">
            <UpcharGangaLogo variant="mark" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black text-upchar-700 truncate">UpcharGanga</div>
            <div className="text-xs font-medium text-neutral-600 truncate">{hospitalName}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 transition-colors duration-fast flex-shrink-0"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
            <path
              d="M4 6h16M4 12h16M4 18h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      {/* Mobile Drawer Backdrop */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-neutral-900/50 md:hidden"
          onClick={() => setIsDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-neutral-200 bg-neutral-0 transition-transform duration-200 ease-in-out md:static md:z-auto md:w-64 md:max-w-none md:translate-x-0 ${
          isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Main Content — min-w-0 prevents flex child from overflowing horizontally when tables/grids are inside */}
      <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardShell;
