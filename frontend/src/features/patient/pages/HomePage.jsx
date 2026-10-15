import { Link } from 'react-router-dom';
import Button from '../components/ui/PButton';
import Card from '../components/ui/PCard';
import UpcharGangaLogo from '../../../assets/logo/UpcharGangaLogo';
import { ROUTES } from '../../../constants/routePaths';

const HIGHLIGHTS = [
  {
    title: 'Find your hospital',
    description: 'Pick your city, browse nearby hospitals, and see every department at a glance.',
  },
  {
    title: 'Book in a few taps',
    description: 'Choose a doctor, pick a date, and get an instant token number — no phone calls.',
  },
  {
    title: 'Track your queue live',
    description: 'Watch your position and estimated wait time update in real time as your turn nears.',
  },
];

/**
 * Premium UpcharGanga Landing Page — Fully Responsive
 */
const HomePage = () => (
  <div className="min-h-screen bg-gradient-to-b from-upchar-50/50 to-neutral-50 overflow-x-hidden">
    {/* Header */}
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-neutral-0/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8">
        <Link to={ROUTES.HOME} className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <UpcharGangaLogo size={34} variant="mark" />
          <div className="min-w-0">
            <div className="text-sm sm:text-base font-bold text-neutral-900 truncate">
              UpcharGanga
            </div>
            <div className="hidden xs:block text-[11px] sm:text-xs text-upchar-600 font-medium truncate">
              Healthcare Queue Management
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-2 sm:gap-lg shrink-0">
          <Link
            to={ROUTES.LOGIN}
            className="px-2 py-1.5 text-xs sm:text-sm font-medium text-neutral-600 hover:text-upchar-600 transition-colors duration-fast"
          >
            Log in
          </Link>
          <Link to={ROUTES.REGISTER}>
            <Button size="sm" className="text-xs sm:text-sm px-3 py-1.5">
              Get started
            </Button>
          </Link>
        </div>
      </div>
    </header>

    {/* Hero Section */}
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
      <div className="grid gap-8 sm:gap-12 lg:grid-cols-2 lg:items-center">
        {/* Left: Copy */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-upchar-100 px-3.5 py-1.5 sm:px-lg sm:py-md mb-4 sm:mb-xl">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-upchar-700">
              ✓ Live Queue Tracking
            </span>
          </div>

          <h1 className="font-display text-3xl sm:text-5xl lg:text-display-lg font-bold leading-tight text-neutral-900">
            Skip the waiting room.
            <span className="block text-upchar-600 mt-1">Track your turn instead.</span>
          </h1>

          <p className="mt-4 sm:mt-lg text-sm sm:text-body-lg text-neutral-600 max-w-md">
            Book hospital appointments online and watch your live position in the queue update in real time.
            No more guessing how long you&apos;ll be waiting.
          </p>

          <div className="mt-6 sm:mt-xl flex flex-col xs:flex-row flex-wrap gap-3 sm:gap-md">
            <Link to={ROUTES.REGISTER} className="w-full xs:w-auto">
              <Button size="lg" className="w-full xs:w-auto">
                Book your first appointment
              </Button>
            </Link>
            <Link to={ROUTES.LOGIN} className="w-full xs:w-auto">
              <Button size="lg" variant="secondary" className="w-full xs:w-auto">
                I have an account
              </Button>
            </Link>
          </div>
        </div>

        {/* Right: Token Card Preview */}
        <div className="relative mx-auto w-full max-w-sm">
          <div
            className="absolute -inset-4 sm:-inset-6 -z-10 rounded-3xl bg-upchar-200/40 blur-2xl"
            aria-hidden="true"
          />

          <div className="rounded-2xl border border-upchar-200 bg-neutral-0 p-5 sm:p-2xl shadow-xl">
            <div className="flex items-center justify-between mb-4 sm:mb-xl">
              <span className="text-label font-medium uppercase tracking-widest text-neutral-500">
                Your Token
              </span>
              <span className="flex items-center gap-sm text-caption font-semibold text-upchar-600">
                <span className="h-2 w-2 animate-pulse rounded-full bg-upchar-600" />
                Live
              </span>
            </div>

            <div className="mb-4 sm:mb-xl">
              <p className="text-label font-semibold uppercase tracking-widest text-neutral-500">
                Queue Position
              </p>
              <p className="font-display text-4xl sm:text-5xl font-bold text-upchar-600 mt-2 sm:mt-md">
                #04
              </p>
            </div>

            <div className="space-y-3 sm:space-y-lg border-t border-upchar-100 pt-4 sm:pt-xl">
              <div className="flex justify-between items-start gap-2">
                <span className="text-body-sm text-neutral-600">Doctor</span>
                <span className="text-body font-semibold text-neutral-900 text-right">
                  Dr. Priya Sharma
                </span>
              </div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-body-sm text-neutral-600">Patients ahead</span>
                <span className="text-body font-semibold text-neutral-900">3</span>
              </div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-body-sm text-neutral-600">Estimated wait</span>
                <span className="text-body font-semibold text-neutral-900">~16 min</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="mt-10 sm:mt-3xl grid grid-cols-1 gap-4 sm:gap-lg sm:grid-cols-3">
        {HIGHLIGHTS.map((item, idx) => (
          <Card key={idx} className="h-full">
            <div className="flex items-start gap-4 sm:gap-lg">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-upchar-100">
                  <span className="text-base font-bold text-upchar-600">{idx + 1}</span>
                </div>
              </div>
              <div>
                <h3 className="text-base sm:text-h3 font-semibold text-neutral-900">{item.title}</h3>
                <p className="mt-1.5 sm:mt-md text-body-sm text-neutral-600">{item.description}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* CTA Section */}
      <div className="mt-10 sm:mt-3xl rounded-2xl bg-upchar-600 px-5 py-8 text-center sm:px-3xl sm:py-4xl">
        <h2 className="font-display text-xl sm:text-3xl font-bold text-neutral-0">
          Ready to transform your healthcare experience?
        </h2>
        <p className="mt-3 sm:mt-lg text-sm sm:text-body-lg text-upchar-100 max-w-2xl mx-auto">
          Join thousands of patients who are already booking smarter and waiting smarter with UpcharGanga.
        </p>
        <div className="mt-6 sm:mt-xl flex flex-wrap gap-md justify-center">
          <Link to={ROUTES.REGISTER} className="w-full xs:w-auto">
            <Button size="lg" className="w-full xs:w-auto bg-neutral-0 text-upchar-600 hover:bg-neutral-100">
              Create free account
            </Button>
          </Link>
        </div>
      </div>
    </main>

    {/* Footer */}
    <footer className="border-t border-neutral-200 bg-neutral-900 text-neutral-300 py-8 sm:py-2xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5 mb-4 sm:mb-xl">
          <UpcharGangaLogo size={32} variant="mark" />
          <div>
            <div className="text-base font-bold text-neutral-0">UpcharGanga</div>
            <div className="text-xs text-upchar-400 font-medium">
              Smart Healthcare Queue Management
            </div>
          </div>
        </div>
        <p className="text-body-sm text-neutral-400">
          Making hospital appointments smarter, faster, and more transparent for patients everywhere.
        </p>
        <div className="mt-6 sm:mt-xl pt-6 sm:pt-xl border-t border-neutral-800">
          <p className="text-caption text-neutral-500">
            © 2026 UpcharGanga. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  </div>
);

export default HomePage;
