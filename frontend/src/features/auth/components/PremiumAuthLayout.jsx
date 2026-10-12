import { Link } from 'react-router-dom';
import { ROUTES } from '../../../constants/routePaths';
import UpcharGangaLogo from '../../../assets/logo/UpcharGangaLogo';

/**
 * Premium UpcharGanga Authentication Layout
 *
 * Two-column design:
 * - Left: Healthcare brand/visual section (desktop/tablet)
 * - Right: Authentication form card
 *
 * Responsive:
 * - Desktop: Full two-column split
 * - Tablet: Reduced two-column
 * - Mobile: Single column, stacked
 */
const PremiumAuthLayout = ({
  page = 'login', // 'login' or 'register'
  title,
  children,
  footerText,
  footerLinkText,
  footerLinkTo,
}) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-upchar-50 via-neutral-50 to-teal-50/30">
      {/* Two-column container */}
      <div className="flex min-h-screen flex-col lg:flex-row">
        {/* LEFT SIDE: BRANDING & VISUAL (Hidden on mobile) */}
        <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center bg-gradient-to-br from-upchar-600 via-upchar-500 to-teal-600 px-3xl py-2xl text-neutral-0 relative overflow-hidden">
          {/* Decorative background elements */}
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

          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-gold-500 to-transparent opacity-60" />

          {/* Content */}
          <div className="relative z-10 max-w-md text-center">
            {/* Logo */}
            <div className="flex justify-center mb-2xl">
              <div className="p-lg bg-neutral-0/10 backdrop-blur rounded-2xl">
                <UpcharGangaLogo size={56} variant="mark" />
              </div>
            </div>

            {/* Brand name */}
            <h2 className="text-4xl font-display font-bold mb-md">UpcharGanga</h2>

            {/* Tagline */}
            <p className="text-xl font-medium text-neutral-0/90 mb-lg">
              Smart Hospital Queue Management
            </p>

            {/* Divider */}
            <div className="flex items-center gap-lg my-2xl">
              <div className="flex-1 h-px bg-neutral-0/20" />
              <div className="h-2 w-2 rounded-full bg-gold-500 opacity-60" />
              <div className="flex-1 h-px bg-neutral-0/20" />
            </div>

            {/* Healthcare message */}
            <div className="space-y-lg">
              <p className="text-body-lg text-neutral-0/95">
                Book hospital appointments online and track your live position in the queue.
              </p>

              {/* Feature points */}
              <div className="space-y-md pt-lg">
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

            {/* Bottom accent */}
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-teal-400/10 rounded-full blur-3xl -z-10" />
            <div className="absolute top-20 left-0 w-48 h-48 bg-gold-400/10 rounded-full blur-2xl -z-10" />
          </div>
        </div>

        {/* RIGHT SIDE: AUTH FORM */}
        <div className="flex w-full lg:w-1/2 flex-col items-center justify-center bg-neutral-50 px-lg py-2xl sm:px-xl lg:px-3xl lg:bg-neutral-0">
          {/* Mobile branding (visible on mobile/tablet, hidden on desktop) */}
          <div className="lg:hidden mb-2xl text-center">
            <Link to={ROUTES.HOME} className="inline-flex items-center gap-2.5 mb-lg">
              <UpcharGangaLogo size={40} variant="mark" />
              <div>
                <div className="text-xl font-bold text-neutral-900">UpcharGanga</div>
                <div className="text-xs text-upchar-600 font-medium">Patient Portal</div>
              </div>
            </Link>
          </div>

          {/* Auth card */}
          <div className="w-full max-w-md">
            {/* Desktop logo (hidden on mobile) */}
            <Link
              to={ROUTES.HOME}
              className="hidden lg:flex items-center gap-2 mb-2xl justify-center"
            >
              <UpcharGangaLogo size={32} variant="mark" />
              <div className="text-lg font-bold text-upchar-600">UpcharGanga</div>
            </Link>

            {/* Title & subtitle */}
            <div className="mb-2xl">
              <h1 className="text-h1 font-bold text-neutral-900">{title}</h1>
            </div>

            {/* Form */}
            <div className="space-y-lg mb-2xl">{children}</div>

            {/* Divider with text */}
            <div className="relative mb-2xl">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-neutral-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-md bg-neutral-50 lg:bg-neutral-0 text-neutral-600">
                  {page === 'login' ? 'New to UpcharGanga?' : 'Already have an account?'}
                </span>
              </div>
            </div>

            {/* Footer link */}
            <p className="text-center text-body-sm text-neutral-600">
              {footerText}{' '}
              <Link
                to={footerLinkTo}
                className="font-semibold text-upchar-600 hover:text-upchar-700 transition-colors duration-fast"
              >
                {footerLinkText}
              </Link>
            </p>

            {/* Trust indicator */}
            <div className="mt-2xl pt-lg border-t border-neutral-100 text-center">
              <p className="text-caption text-neutral-500">
                ✓ Secure &amp; HIPAA compliant | Trusted by leading hospitals
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom accent on mobile */}
      <div className="lg:hidden absolute bottom-0 right-0 w-40 h-40 bg-upchar-100/30 rounded-full blur-3xl -z-10" />
    </div>
  );
};

export default PremiumAuthLayout;
