import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import PatientLayout from '../layouts/PatientLayout';
import ReceptionLayout from '../layouts/ReceptionLayout';
import DoctorLayout from '../layouts/DoctorLayout';
import AdminLayout from '../layouts/AdminLayout';
import ComingSoon from '../components/common/ComingSoon';
import { ROUTES } from '../constants/routePaths';
import { USER_ROLES } from '../constants/roles';
import FullScreenLoader from '../components/common/FullScreenLoader';

import HomePage from '../features/patient/pages/HomePage';
import LoginPage from '../features/auth/pages/LoginPage';
import RegisterPage from '../features/auth/pages/RegisterPage';

// Patient routes - lazy loaded
const PatientDashboardPage = lazy(() => import('../features/patient/pages/PatientDashboardPage'));
const ChooseCityPage = lazy(() => import('../features/patient/pages/ChooseCityPage'));
const ChooseHospitalPage = lazy(() => import('../features/patient/pages/ChooseHospitalPage'));
const DoctorListPage = lazy(() => import('../features/patient/pages/DoctorListPage'));
const BookingPage = lazy(() => import('../features/patient/pages/BookingPage'));
const BookingSuccessPage = lazy(() => import('../features/patient/pages/BookingSuccessPage'));
const AppointmentsPage = lazy(() => import('../features/patient/pages/AppointmentsPage'));
const AppointmentTrackPage = lazy(() => import('../features/patient/pages/AppointmentTrackPage'));
const PatientNotificationsPage = lazy(() => import('../features/patient/pages/PatientNotificationsPage'));
const ProfilePage = lazy(() => import('../features/patient/pages/ProfilePage'));

// Reception routes - lazy loaded
const ReceptionDashboardPage = lazy(() => import('../features/reception/pages/ReceptionDashboardPage'));
const SearchBookingPage = lazy(() => import('../features/reception/pages/SearchBookingPage'));

// Doctor routes - lazy loaded
const DoctorQueuePage = lazy(() => import('../features/doctorAssistant/pages/DoctorQueuePage'));

// Admin routes - lazy loaded (these are the heaviest with charts)
const AdminOverviewPage = lazy(() => import('../features/admin/pages/AdminOverviewPage'));
const AdminAnalyticsPage = lazy(() => import('../features/admin/pages/AdminAnalyticsPage'));
const AdminReportsPage = lazy(() => import('../features/admin/pages/AdminReportsPage'));
const AdminHospitalsPage = lazy(() => import('../features/admin/pages/AdminHospitalsPage'));
const AdminDoctorsPage = lazy(() => import('../features/admin/pages/AdminDoctorsPage'));
const AdminPatientsPage = lazy(() => import('../features/admin/pages/AdminPatientsPage'));
const AdminAppointmentsPage = lazy(() => import('../features/admin/pages/AdminAppointmentsPage'));
const AdminDepartmentsPage = lazy(() => import('../features/admin/pages/AdminDepartmentsPage'));
const AdminCitiesPage = lazy(() => import('../features/admin/pages/AdminCitiesPage'));
const AdminStaffPage = lazy(() => import('../features/admin/pages/AdminStaffPage'));

/**
 * The full route tree. Patient, Reception, Doctor Assistant, and Admin
 * (including Departments/Cities) are fully built out.
 *
 * Optimized with React.lazy for route-level code splitting to defer loading
 * of heavy sections until they're actually navigated to. Suspense boundaries
 * show a loader while chunks are being fetched.
 */
const AppRoutes = () => (
  <Routes>
    <Route path={ROUTES.HOME} element={<HomePage />} />
    <Route path={ROUTES.LOGIN} element={<LoginPage />} />
    <Route path={ROUTES.REGISTER} element={<RegisterPage />} />
    <Route path={ROUTES.UNAUTHORIZED} element={<ComingSoon title="Unauthorized" />} />

    {/* Patient */}
    <Route element={<ProtectedRoute allowedRoles={[USER_ROLES.PATIENT]} />}>
      <Route path={ROUTES.PATIENT.ROOT} element={<PatientLayout />}>
        <Route
          index
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <PatientDashboardPage />
            </Suspense>
          }
        />
        <Route
          path="book/city"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <ChooseCityPage />
            </Suspense>
          }
        />
        <Route
          path="book/hospital"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <ChooseHospitalPage />
            </Suspense>
          }
        />
        <Route
          path="book/doctors"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <DoctorListPage />
            </Suspense>
          }
        />
        <Route
          path="book/confirm/:doctorId"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <BookingPage />
            </Suspense>
          }
        />
        <Route
          path="book/success/:appointmentId"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <BookingSuccessPage />
            </Suspense>
          }
        />
        <Route
          path="appointments"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <AppointmentsPage />
            </Suspense>
          }
        />
        <Route
          path="appointments/:id"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <AppointmentTrackPage />
            </Suspense>
          }
        />
        <Route
          path="notifications"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <PatientNotificationsPage />
            </Suspense>
          }
        />
        <Route
          path="profile"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <ProfilePage />
            </Suspense>
          }
        />
      </Route>
    </Route>

    {/* Reception (Panel 1) */}
    <Route element={<ProtectedRoute allowedRoles={[USER_ROLES.RECEPTIONIST]} />}>
      <Route path={ROUTES.RECEPTION.ROOT} element={<ReceptionLayout />}>
        <Route
          index
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <ReceptionDashboardPage />
            </Suspense>
          }
        />
        <Route
          path="search"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <SearchBookingPage />
            </Suspense>
          }
        />
      </Route>
    </Route>

    {/* Doctor Assistant (Panel 2) */}
    <Route element={<ProtectedRoute allowedRoles={[USER_ROLES.DOCTOR_ASSISTANT]} />}>
      <Route path={ROUTES.DOCTOR.ROOT} element={<DoctorLayout />}>
        <Route
          index
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <DoctorQueuePage />
            </Suspense>
          }
        />
        <Route path="history" element={<ComingSoon title="Consultation History" />} />
      </Route>
    </Route>

    {/* Admin */}
    <Route element={<ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]} />}>
      <Route path={ROUTES.ADMIN.ROOT} element={<AdminLayout />}>
        <Route
          index
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <AdminOverviewPage />
            </Suspense>
          }
        />
        <Route
          path="analytics"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <AdminAnalyticsPage />
            </Suspense>
          }
        />
        <Route
          path="reports"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <AdminReportsPage />
            </Suspense>
          }
        />
        <Route
          path="hospitals"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <AdminHospitalsPage />
            </Suspense>
          }
        />
        <Route
          path="doctors"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <AdminDoctorsPage />
            </Suspense>
          }
        />
        <Route
          path="patients"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <AdminPatientsPage />
            </Suspense>
          }
        />
        <Route
          path="appointments"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <AdminAppointmentsPage />
            </Suspense>
          }
        />
        <Route
          path="departments"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <AdminDepartmentsPage />
            </Suspense>
          }
        />
        <Route
          path="cities"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <AdminCitiesPage />
            </Suspense>
          }
        />
        <Route
          path="staff"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <AdminStaffPage />
            </Suspense>
          }
        />
      </Route>
    </Route>

    <Route path={ROUTES.NOT_FOUND} element={<ComingSoon title="404 — Not Found" />} />
    <Route path="*" element={<Navigate to={ROUTES.NOT_FOUND} replace />} />
  </Routes>
);

export default AppRoutes;
