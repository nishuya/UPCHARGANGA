import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../../../../context/AuthContext';
import { useLogout } from '../../../../hooks/useLogout';
import { ROUTES } from '../../../../constants/routePaths';
import UpcharGangaLogo from '../../../../assets/logo/UpcharGangaLogo';
import NotificationBell from '../NotificationBell';

const NAV_ITEMS = [
  { label: 'Dashboard', path: ROUTES.PATIENT.ROOT, end: true },
  { label: 'Book Appointment', path: ROUTES.PATIENT.CHOOSE_CITY },
  { label: 'My Appointments', path: ROUTES.PATIENT.APPOINTMENTS },
  { label: 'Profile', path: ROUTES.PATIENT.PROFILE },
];

const PatientTopNav = () => {
  const { user } = useAuth();
  const handleLogout = useLogout();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navLinkClasses = ({ isActive }) =>
    `rounded-md px-md py-2 text-sm font-medium transition-all duration-fast ${
      isActive
        ? 'bg-upchar-50 text-upchar-600 font-semibold'
        : 'text-neutral-600 hover:bg-neutral-50 hover:text-upchar-600'
    }`;

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col overflow-x-hidden">
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-neutral-0 shadow-base">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8">
          {/* Brand Logo — visible on both mobile and desktop */}
          <Link
            to={ROUTES.PATIENT.ROOT}
            className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-shrink-0"
          >
            <UpcharGangaLogo size={34} variant="mark" />
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-bold text-neutral-900 truncate">
                UpcharGanga
              </div>
              <div className="text-[11px] sm:text-xs text-upchar-600 font-medium truncate">
                Patient Portal
              </div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-1 lg:gap-sm md:flex">
            {NAV_ITEMS.map(({ label, path, end }) => (
              <NavLink key={path} to={path} end={end} className={navLinkClasses}>
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Desktop User Menu */}
          <div className="hidden items-center gap-md lg:gap-lg md:flex">
            <NotificationBell />
            <span className="max-w-[140px] lg:max-w-[200px] truncate text-sm font-medium text-neutral-700">
              {user?.fullName}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md border border-neutral-200 px-md py-2 text-sm font-medium text-neutral-600 transition-all duration-fast hover:border-upchar-500 hover:bg-upchar-50 hover:text-upchar-600"
            >
              Log out
            </button>
          </div>

          {/* Mobile Actions: Notification Bell + Hamburger Menu Button */}
          <div className="flex items-center gap-1 md:hidden">
            <NotificationBell />
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-label="Toggle menu"
              aria-expanded={isMenuOpen}
              className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 transition-colors duration-fast"
            >
              {isMenuOpen ? (
                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                  <path
                    d="M4 6h16M4 12h16M4 18h16"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {isMenuOpen && (
          <nav className="border-t border-neutral-100 bg-neutral-0 px-4 py-4 shadow-md md:hidden">
            <div className="flex flex-col gap-1.5 mb-4">
              {NAV_ITEMS.map(({ label, path, end }) => (
                <NavLink
                  key={path}
                  to={path}
                  end={end}
                  onClick={() => setIsMenuOpen(false)}
                  className={navLinkClasses}
                >
                  {label}
                </NavLink>
              ))}
              <NavLink
                to={ROUTES.PATIENT.NOTIFICATIONS}
                onClick={() => setIsMenuOpen(false)}
                className={navLinkClasses}
              >
                Notifications
              </NavLink>
            </div>
            <div className="border-t border-neutral-200 pt-3 flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900 truncate">
                  {user?.fullName}
                </p>
                {user?.email && (
                  <p className="text-xs text-neutral-500 truncate">{user.email}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  handleLogout();
                }}
                className="w-full xs:w-auto rounded-md border border-neutral-200 px-md py-2 text-center text-sm font-medium text-neutral-700 transition-all duration-fast hover:border-danger-300 hover:bg-danger-50 hover:text-danger-600"
              >
                Log out
              </button>
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
};

export default PatientTopNav;
