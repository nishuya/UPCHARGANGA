import { Link } from 'react-router-dom';
import { ROUTES } from '../../../constants/routePaths';
import UpcharGangaLogo from '../../../assets/logo/UpcharGangaLogo';

/**
 * Premium UpcharGanga Authentication Layout — Responsive
 */
const PremiumAuthLayout = ({
  page = 'login',
  title,
  children,
  footerText,
  footerLinkText,
  footerLinkTo,
}) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-upchar-50 via-neutral-50 to-teal-50/30 overflow-x-hidden">
      <div className="flex min-h-screen flex-col lg:flex-row">
        {/* LEFT SIDE: BRANDING & VISUAL (Desktop) */}
        <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center bg-gradient-to-br from-upchar-600 via-upchar-500 to-teal-600 px-3xl py-2xl text-neutral-0 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <svg viewBox="0 0 100 100" className="h-full w-full">
              <defs>
                <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="10" cy="10" r="2" fill="currentColor" />
                </pattern>
              </defs>
              <rect width="100" height="100" fill="url(#dots)" />
            </svg>
          </div>

          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-gold-500 to-transparent opacity-60" />

          <div className="relative z-10 max-w-md text-center">
            <div className="flex justify-center mb-2xl">
              <div className="p-lg bg-neutral-0/10 backdrop-blur rounded-2xl">
                <UpcharGangaLogo size={56} variant="mark" />
              </div>
            </div>

            <h2 className="text-4xl font-display font-bold mb-md">UpcharGanga</h2>

            <p className="text-xl font-medium text-neutral-0/90 mb-lg">
              Smart Hospital Queue Management
            </p>

            <div className="flex items-center gap-lg my-2xl">
              <div className="flex-1 h-px bg-neutral-0/20" />
              <div className="h-2 w-2 rounded-full bg-gold-500 opacity-60" />
              <div className="flex-1 h-px bg-neutral-0/20" />
            </div>

            <div className="space-y-lg">
              <p className="text-body-lg text-neutral-0/95">
                Book hospital appointments online and track your live position in the queue.
              </p>

              <div className="space-y-md pt-lg text-left">
                <div className="flex items-start gap-md">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gold-500/20 flex items-center justify-center mt-0.5">
                    <span className="text-sm">✓</span>
                  </div>
                  <span className="text-body-sm">Real-time queue position tracking</span>
                </div>
                <div className="flex items-start gap-md">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gold-500/20 flex items-center justify-center mt-0.5">
                    <span className="text-sm">✓</span>
                  </div>
                  <span className="text-body-sm">Instant appointment confirmation</span>
                </div>
                <div className="flex items-start gap-md">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gold-500/20 flex items-center justify-center mt-0.5">
                    <span className="text-sm">✓</span>
                  </div>
                  <span className="text-body-sm">Used by leading hospitals</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: AUTH FORM */}
        <div className="flex w-full lg:w-1/2 flex-1 flex-col items-center justify-center bg-neutral-50 px-4 py-6 sm:px-6 sm:py-10 lg:px-3xl lg:bg-neutral-0">
          {/* Mobile branding */}
          <div className="lg:hidden mb-6 text-center">
            <Link to={ROUTES.HOME} className="inline-flex items-center gap-2.5">
              <UpcharGangaLogo size={36} variant="mark" />
              <div className="text-left">
                <div className="text-lg font-bold text-neutral-900">UpcharGanga</div>
                <div className="text-xs text-upchar-600 font-medium">Patient Portal</div>
              </div>
            </Link>
          </div>

          {/* Auth card */}
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-neutral-0 p-5 shadow-base sm:p-8 lg:border-0 lg:p-0 lg:shadow-none">
            <Link
              to={ROUTES.HOME}
              className="hidden lg:flex items-center gap-2 mb-2xl justify-center"
            >
              <UpcharGangaLogo size={32} variant="mark" />
              <div className="text-lg font-bold text-upchar-600">UpcharGanga</div>
            </Link>

            <div className="mb-6 sm:mb-2xl">
              <h1 className="text-2xl sm:text-h1 font-bold text-neutral-900">{title}</h1>
            </div>

            <div className="space-y-4 sm:space-y-lg mb-6 sm:mb-2xl">{children}</div>

            {footerLinkTo && (
              <>
                <div className="relative mb-6 sm:mb-2xl">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-neutral-200" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-md bg-neutral-0 text-neutral-600">
                      {page === 'login' ? 'New to UpcharGanga?' : 'Already have an account?'}
                    </span>
                  </div>
                </div>

                <p className="text-center text-body-sm text-neutral-600">
                  {footerText}{' '}
                  <Link
                    to={footerLinkTo}
                    className="font-semibold text-upchar-600 hover:text-upchar-700 transition-colors duration-fast"
                  >
                    {footerLinkText}
                  </Link>
                </p>
              </>
            )}

            <div className="mt-6 sm:mt-2xl pt-4 sm:pt-lg border-t border-neutral-100 text-center">
              <p className="text-caption text-neutral-500">
                ✓ Secure &amp; HIPAA compliant | Trusted by leading hospitals
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PremiumAuthLayout;
