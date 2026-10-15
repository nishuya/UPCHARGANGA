const STEPS = ['City', 'Hospital', 'Doctor', 'Confirm'];

/**
 * Premium UpcharGanga Booking Progress Stepper
 * Responsive across 320px mobile phones through desktop screens.
 */
const BookingSteps = ({ current }) => (
  <nav aria-label="Booking progress" className="mb-6 sm:mb-2xl w-full overflow-x-auto no-scrollbar">
    <ol className="flex items-center justify-between sm:justify-start gap-1.5 sm:gap-md min-w-0">
      {STEPS.map((step, index) => {
        const stepNumber = index + 1;
        const isDone = stepNumber < current;
        const isActive = stepNumber === current;

        return (
          <li
            key={step}
            className="flex items-center gap-1.5 sm:gap-md flex-1 sm:flex-initial min-w-0"
          >
            {/* Step badge */}
            <span
              className={`flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full text-xs sm:text-sm font-semibold transition-all duration-fast ${
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
              className={`text-xs sm:text-label font-medium truncate transition-colors duration-fast ${
                isActive
                  ? 'text-upchar-700 font-semibold'
                  : isDone
                    ? 'text-neutral-600'
                    : 'text-neutral-400 hidden xs:inline'
              }`}
            >
              {step}
            </span>

            {/* Connector line */}
            {stepNumber !== STEPS.length && (
              <span
                className={`mx-1 sm:mx-md h-0.5 flex-1 sm:w-8 sm:flex-none transition-colors duration-fast ${
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
