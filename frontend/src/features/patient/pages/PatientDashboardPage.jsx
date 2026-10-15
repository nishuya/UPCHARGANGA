import { Link } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useMyAppointments } from '../hooks/useAppointments';
import { Spinner, EmptyState, ErrorNotice } from '../components/ui/PStateNotice';
import Button from '../components/ui/PButton';
import AppointmentCard from '../components/AppointmentCard';
import { ROUTES } from '../../../constants/routePaths';

const UPCOMING_STATUSES = ['pending', 'confirmed', 'checked-in', 'in-consultation'];

/**
 * Premium UpcharGanga Patient Dashboard — Responsive
 */
const PatientDashboardPage = () => {
  const { user } = useAuth();
  const { data: appointments, isLoading, isError } = useMyAppointments({ limit: 10 });

  const upcoming = appointments?.filter((a) => UPCOMING_STATUSES.includes(a.status)) ?? [];
  const nextAppointment = upcoming[0];

  return (
    <div className="space-y-6 sm:space-y-2xl">
      {/* Header + Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-display font-bold text-neutral-900 break-words">
            Hi {user?.fullName?.split(' ')[0]},
          </h1>
          <p className="mt-1 sm:mt-md text-body text-neutral-600">
            Welcome to your UpcharGanga patient portal
          </p>
        </div>

        <Link to={ROUTES.PATIENT.CHOOSE_CITY} className="w-full sm:w-auto shrink-0">
          <Button size="lg" className="w-full sm:w-auto">
            + Book a new appointment
          </Button>
        </Link>
      </div>

      {/* Loading State */}
      {isLoading && <Spinner label="Loading your appointments…" />}

      {/* Error State */}
      {isError && (
        <ErrorNotice
          message="Couldn't load your appointments right now."
          action={
            <button
              onClick={() => window.location.reload()}
              className="text-sm font-medium text-upchar-600 hover:text-upchar-700 underline"
            >
              Try again
            </button>
          }
        />
      )}

      {/* Main Content */}
      {!isLoading && !isError && (
        <>
          {upcoming.length === 0 ? (
            <EmptyState
              title="No upcoming appointments"
              description="Book your first appointment to get started. You'll receive a token number and can track your position in real-time."
              action={
                <Link to={ROUTES.PATIENT.CHOOSE_CITY}>
                  <Button size="sm" variant="secondary">
                    Book an appointment
                  </Button>
                </Link>
              }
            />
          ) : (
            <>
              {/* Next Appointment - Featured Section */}
              <div>
                <h2 className="text-label font-semibold uppercase tracking-widest text-neutral-600 mb-3 sm:mb-lg">
                  Your next appointment
                </h2>
                {nextAppointment && (
                  <div className="rounded-xl border-2 border-upchar-200 bg-gradient-to-br from-upchar-50 to-neutral-0 p-4 sm:p-xl">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-lg">
                      {/* Left: Doctor and Details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-caption font-medium uppercase tracking-widest text-neutral-500">
                          Doctor
                        </p>
                        <h3 className="text-xl sm:text-h2 font-bold text-neutral-900 mt-1 break-words">
                          Dr. {nextAppointment.doctor?.user?.fullName}
                        </h3>

                        <div className="mt-4 sm:mt-lg space-y-2.5 sm:space-y-md">
                          <div className="flex flex-col xs:flex-row xs:justify-between xs:items-start gap-0.5 xs:gap-4">
                            <span className="text-body-sm text-neutral-600 shrink-0">Hospital</span>
                            <span className="text-body-sm font-semibold text-neutral-900 xs:text-right break-words">
                              {nextAppointment.hospital?.name}
                            </span>
                          </div>
                          <div className="flex flex-col xs:flex-row xs:justify-between xs:items-start gap-0.5 xs:gap-4">
                            <span className="text-body-sm text-neutral-600 shrink-0">
                              Date &amp; time
                            </span>
                            <span className="text-body-sm font-semibold text-neutral-900 xs:text-right">
                              {new Date(nextAppointment.appointmentDate).toLocaleDateString(
                                undefined,
                                {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                }
                              )}{' '}
                              · {nextAppointment.timeSlot?.start}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Token */}
                      <div className="border-t border-upchar-200 pt-4 sm:border-t-0 sm:pt-0 sm:border-l sm:pl-xl flex sm:block items-center justify-between">
                        <p className="text-caption font-medium uppercase tracking-widest text-neutral-500">
                          Your token
                        </p>
                        <p className="text-4xl sm:text-5xl font-black text-upchar-600 sm:mt-md">
                          #{nextAppointment.tokenNumber}
                        </p>
                      </div>
                    </div>

                    {/* Track Button */}
                    <div className="mt-4 sm:mt-lg">
                      <Link
                        to={`${ROUTES.PATIENT.APPOINTMENT_TRACK}/${nextAppointment._id}`}
                        className="block sm:inline-flex"
                      >
                        <Button variant="secondary" size="sm" className="w-full sm:w-auto">
                          Track live status →
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* Other Upcoming Appointments */}
              {upcoming.length > 1 && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3 sm:mb-lg">
                    <h2 className="text-label font-semibold uppercase tracking-widest text-neutral-600">
                      More appointments
                    </h2>
                    <Link
                      to={ROUTES.PATIENT.APPOINTMENTS}
                      className="text-body-sm font-semibold text-upchar-600 hover:text-upchar-700 transition-colors shrink-0"
                    >
                      View all →
                    </Link>
                  </div>
                  <div className="space-y-3 sm:space-y-md">
                    {upcoming.slice(1).map((appointment) => (
                      <AppointmentCard key={appointment._id} appointment={appointment} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default PatientDashboardPage;
