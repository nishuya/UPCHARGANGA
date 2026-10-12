import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../../../../context/AuthContext';
import { ROUTES } from '../../../../constants/routePaths';
import UpcharGangaLogo from '../../../../assets/logo/UpcharGangaLogo';
import NotificationBell from '../NotificationBell';

/**
 * Premium UpcharGanga Patient Portal Top Navigation
 *
 * Horizontal navigation for patient-facing surface.
 * Features:
 * - Sticky header with brand logo
 * - Desktop horizontal nav, mobile hamburger
 * - Clean, professional, healthcare-focused styling
 * - Emerald green accent color
 */
const NAV_ITEMS = [
  { label: 'Dashboard', path: ROUTES.PATIENT.ROOT, end: true },
  { label: 'Book Appointment', path: ROUTES.PATIENT.CHOOSE_CITY },
  { label: 'My Appointments', path: ROUTES.PATIENT.APPOINTMENTS },
  { label: 'Profile', path: ROUTES.PATIENT.PROFILE },
];

const PatientTopNav = () => {
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navLinkClasses = ({ isActive }) =>
    `rounded-md px-md py-2 text-sm font-medium transition-all duration-fast ${
      isActive
        ? 'bg-upchar-50 text-upchar-600'
        : 'text-neutral-600 hover:bg-neutral-50 hover:text-upchar-600'
    }`;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-neutral-0 shadow-base">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-lg px-lg py-3 sm:px-xl">
          {/* Brand Logo */}
          <Link to={ROUTES.PATIENT.ROOT} className="flex items-center gap-2.5 flex-shrink-0">
            <UpcharGangaLogo size={36} variant="mark" />
            <div className="hidden sm:block">
              <div className="text-base font-bold text-neutral-900">UpcharGanga</div>
              <div className="text-xs text-upchar-600 font-medium">Patient Portal</div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-sm md:flex">
            {NAV_ITEMS.map(({ label, path, end }) => (
              <NavLink key={path} to={path} end={end} className={navLinkClasses}>
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Desktop User Menu */}
          <div className="hidden items-center gap-lg md:flex">
            <NotificationBell />
            <span className="text-sm text-neutral-600">{user?.fullName}</span>
            <button
              type="button"
              onClick={logout}
              className="rounded-md border border-neutral-200 px-md py-2 text-sm font-medium text-neutral-600 transition-all duration-fast hover:border-upchar-500 hover:bg-upchar-50 hover:text-upchar-600"
            >
              Log out
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-label="Toggle menu"
            className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 md:hidden transition-colors duration-fast"
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
        </div>

        {/* Mobile Navigation Menu */}
        {isMenuOpen && (
          <nav className="border-t border-neutral-100 bg-neutral-50 px-lg py-lg md:hidden">
            <div className="flex flex-col gap-sm mb-lg">
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
            </div>
            <div className="border-t border-neutral-200 pt-lg flex items-center justify-between">
              <div className="flex items-center gap-lg flex-1">
                <NotificationBell />
                <span className="text-sm text-neutral-600">{user?.fullName}</span>
              </div>
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-neutral-200 px-md py-2 text-sm font-medium text-neutral-600 transition-all duration-fast hover:border-upchar-500 hover:bg-upchar-50 hover:text-upchar-600"
              >
                Log out
              </button>
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-lg py-2xl sm:px-xl sm:py-3xl lg:px-3xl">
        <Outlet />
      </main>
    </div>
  );
};

export default PatientTopNav;
