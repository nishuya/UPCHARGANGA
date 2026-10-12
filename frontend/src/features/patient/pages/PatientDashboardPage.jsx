import { Link } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useMyAppointments } from '../hooks/useAppointments';
import { Spinner, EmptyState, ErrorNotice } from '../components/ui/PStateNotice';
import Button from '../components/ui/PButton';
import AppointmentCard from '../components/AppointmentCard';
import { ROUTES } from '../../../constants/routePaths';

const UPCOMING_STATUSES = ['pending', 'confirmed', 'checked-in', 'in-consultation'];

/**
 * Premium UpcharGanga Patient Dashboard
 *
 * The patient's home page after login. Shows:
 * - Personalized greeting
 * - Current/upcoming appointment prominently
 * - Quick booking action
 * - List of upcoming appointments
 * - Professional empty state
 */
const PatientDashboardPage = () => {
  const { user } = useAuth();
  const { data: appointments, isLoading, isError } = useMyAppointments({ limit: 10 });

  const upcoming = appointments?.filter((a) => UPCOMING_STATUSES.includes(a.status)) ?? [];
  const nextAppointment = upcoming[0];

  return (
    <div className="space-y-2xl">
      {/* Header */}
      <div>
        <h1 className="text-display font-bold text-neutral-900">
          Hi {user?.fullName?.split(' ')[0]},
        </h1>
        <p className="mt-md text-body text-neutral-600">
          Welcome to your UpcharGanga patient portal
        </p>
      </div>

      {/* Quick Action: Book New Appointment */}
      <Link to={ROUTES.PATIENT.CHOOSE_CITY}>
        <Button size="lg" className="w-full sm:w-auto">
          + Book a new appointment
        </Button>
      </Link>

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

      {/* Main Content: Not Loading & Not Error */}
      {!isLoading && !isError && (
        <>
          {/* Empty State */}
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
                <h2 className="text-label font-semibold uppercase tracking-widest text-neutral-600 mb-lg">
                  Your next appointment
                </h2>
                {nextAppointment && (
                  <div className="rounded-xl border-2 border-upchar-200 bg-gradient-to-br from-upchar-50 to-neutral-0 p-lg sm:p-xl">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-lg">
                      {/* Left: Doctor and Details */}
                      <div className="flex-1">
                        <p className="text-caption font-medium uppercase tracking-widest text-neutral-500">
                          Doctor
                        </p>
                        <h3 className="text-h2 font-bold text-neutral-900 mt-sm">
                          Dr. {nextAppointment.doctor?.user?.fullName}
                        </h3>

                        <div className="mt-lg space-y-md">
                          <div className="flex justify-between items-start">
                            <span className="text-body-sm text-neutral-600">Hospital</span>
                            <span className="text-body-sm font-semibold text-neutral-900">
                              {nextAppointment.hospital?.name}
                            </span>
                          </div>
                          <div className="flex justify-between items-start">
                            <span className="text-body-sm text-neutral-600">Date & time</span>
                            <span className="text-body-sm font-semibold text-neutral-900">
                              {new Date(nextAppointment.appointmentDate).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })} · {nextAppointment.timeSlot?.start}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Token */}
                      <div className="sm:border-l sm:border-upchar-200 sm:pl-xl">
                        <p className="text-caption font-medium uppercase tracking-widest text-neutral-500">
                          Your token
                        </p>
                        <p className="text-5xl font-black text-upchar-600 mt-md">
                          #{nextAppointment.tokenNumber}
                        </p>
                      </div>
                    </div>

                    {/* Track Button */}
                    <Link
                      to={`${ROUTES.PATIENT.APPOINTMENT_TRACK}/${nextAppointment._id}`}
                      className="mt-lg inline-flex items-center gap-md"
                    >
                      <Button variant="secondary" size="sm">
                        Track live status →
                      </Button>
                    </Link>
                  </div>
                )}
              </div>

              {/* Other Upcoming Appointments */}
              {upcoming.length > 1 && (
                <div>
                  <div className="flex items-center justify-between mb-lg">
                    <h2 className="text-label font-semibold uppercase tracking-widest text-neutral-600">
                      More appointments
                    </h2>
                    <Link
                      to={ROUTES.PATIENT.APPOINTMENTS}
                      className="text-body-sm font-semibold text-upchar-600 hover:text-upchar-700 transition-colors"
                    >
                      View all →
                    </Link>
                  </div>
                  <div className="space-y-md">
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
