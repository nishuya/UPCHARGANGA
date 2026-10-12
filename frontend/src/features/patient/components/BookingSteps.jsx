const STEPS = ['City', 'Hospital', 'Doctor', 'Confirm'];

/**
 * Premium UpcharGanga Booking Progress Stepper
 *
 * Shows current step in appointment booking flow.
 * `current` is 1-indexed (1 = City ... 4 = Confirm) so call sites read
 * naturally: <BookingSteps current={2} /> on the Choose Hospital page.
 *
 * Uses emerald (upchar) colors for active/completed steps.
 */
const BookingSteps = ({ current }) => (
  <nav aria-label="Booking progress" className="mb-2xl">
    <ol className="flex items-center gap-md">
      {STEPS.map((step, index) => {
        const stepNumber = index + 1;
        const isDone = stepNumber < current;
        const isActive = stepNumber === current;

        return (
          <li key={step} className="flex items-center gap-md">
            {/* Step badge */}
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-all duration-fast ${
                isActive
                  ? 'bg-upchar-600 text-white shadow-md'
                  : isDone
                  ? 'bg-upchar-100 text-upchar-700'
                  : 'border-2 border-neutral-200 bg-neutral-0 text-neutral-400'
              }`}
              aria-current={isActive ? 'step' : undefined}
            >
              {isDone ? '✓' : stepNumber}
            </span>

            {/* Step label */}
            <span
              className={`text-label font-medium transition-colors duration-fast ${
                isActive
                  ? 'text-upchar-700 font-semibold'
                  : isDone
                  ? 'text-neutral-600'
                  : 'text-neutral-400'
              }`}
            >
              {step}
            </span>

            {/* Connector line */}
            {stepNumber !== STEPS.length && (
              <span
                className={`mx-md h-0.5 w-8 transition-colors duration-fast ${
                  isDone ? 'bg-upchar-200' : 'bg-neutral-200'
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  </nav>
);

export default BookingSteps;
