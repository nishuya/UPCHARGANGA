import { Link } from 'react-router-dom';
import { ROUTES } from '../../../constants/routePaths';
import UpcharGangaLogo from '../../../assets/logo/UpcharGangaLogo';

/**
 * Premium UpcharGanga Auth Layout
 *
 * Shared visual shell for login and register pages:
 * - UpcharGanga logo and branding
 * - Centered auth card with professional styling
 * - Footer link for switching between login/register
 * - Professional healthcare aesthetic
 */
const AuthLayout = ({ title, subtitle, footerText, footerLinkText, footerLinkTo, children }) => (
  <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-upchar-50/30 to-neutral-50 px-lg py-3xl">
    <div className="w-full max-w-md">
      {/* Logo & Brand */}
      <div className="mb-2xl text-center">
        <Link to={ROUTES.HOME} className="inline-flex items-center gap-2.5">
          <UpcharGangaLogo size={44} variant="mark" />
          <div>
            <div className="text-2xl font-bold text-neutral-900">UpcharGanga</div>
            <div className="text-xs text-upchar-600 font-medium">Patient Portal</div>
          </div>
        </Link>
      </div>

      {/* Auth Card */}
      <div className="rounded-2xl border border-neutral-200 bg-neutral-0 p-2xl shadow-lg sm:p-3xl">
        <h1 className="text-h1 font-bold text-neutral-900">{title}</h1>
        {subtitle && <p className="mt-md text-body-sm text-neutral-600">{subtitle}</p>}
        <div className="mt-2xl">{children}</div>
      </div>

      {/* Footer Link */}
      <p className="mt-lg text-center text-body-sm text-neutral-600">
        {footerText}{' '}
        <Link to={footerLinkTo} className="font-semibold text-upchar-600 hover:text-upchar-700 transition-colors duration-fast">
          {footerLinkText}
        </Link>
      </p>
    </div>
  </div>
);

export default AuthLayout;
