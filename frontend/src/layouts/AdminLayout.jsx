import DashboardShell from '../components/common/DashboardShell';
import { ROUTES } from '../constants/routePaths';

/**
 * Icon components — simple SVG symbols for admin navigation.
 * No external icon library — all inline to reduce dependencies.
 */
const IconChart = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/>
  </svg>
);

const IconAnalytics = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
  </svg>
);

const IconReport = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z M16 18H8v-2h8v2zm0-4H8v-2h8v2zm0-4H8V8h8v2z"/>
  </svg>
);

const IconHospital = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 11h-2v4h-2v-4H8v-2h2V8h2v4h2v2z"/>
  </svg>
);

const IconDoctor = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="8" r="4"/>
    <path d="M12 14c-6 0-8 3-8 3v3h16v-3s-2-3-8-3z"/>
  </svg>
);

const IconPatient = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
  </svg>
);

const IconCalendar = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/>
  </svg>
);

const IconSettings = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l1.72-1.35c.15-.12.19-.34.1-.51l-1.63-2.83c-.12-.22-.38-.28-.59-.15l-2.03 1.6c-.42-.32-.9-.59-1.42-.78l-.31-2.26c-.03-.25-.25-.43-.5-.43h-3.26c-.25 0-.46.18-.49.43l-.31 2.26c-.52.19-1 .46-1.42.78l-2.03-1.6c-.21-.13-.47-.07-.59.15L2.74 8.87c-.12.22-.08.44.1.51l1.72 1.35c-.05.3-.07.62-.07.94s.02.64.07.94l-1.72 1.35c-.15.12-.19.34-.1.51l1.63 2.83c.12.22.38.28.59.15l2.03-1.6c.42.32.9.59 1.42.78l.31 2.26c.03.25.25.43.5.43h3.26c.25 0 .46-.18.49-.43l.31-2.26c.52-.19 1-.46 1.42-.78l2.03 1.6c.21.13.47.07.59-.15l1.63-2.83c.12-.22.07-.44-.1-.51l-1.72-1.35zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
  </svg>
);

const IconTag = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.05-.59-1.41zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>
  </svg>
);

const IconMap = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5z"/>
  </svg>
);

const IconPeople = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
  </svg>
);

/**
 * Admin navigation organized into logical sections.
 * Each section has a visual grouping for better UX.
 */
const NAV_SECTIONS = [
  {
    title: 'Analytics',
    items: [
      { label: 'Overview', path: ROUTES.ADMIN.ROOT, icon: IconChart, end: true },
      { label: 'Analytics', path: `${ROUTES.ADMIN.ROOT}/analytics`, icon: IconAnalytics },
      { label: 'Reports', path: `${ROUTES.ADMIN.ROOT}/reports`, icon: IconReport },
    ],
  },
  {
    title: 'Management',
    items: [
      { label: 'Hospitals', path: `${ROUTES.ADMIN.ROOT}/hospitals`, icon: IconHospital },
      { label: 'Doctors', path: `${ROUTES.ADMIN.ROOT}/doctors`, icon: IconDoctor },
      { label: 'Patients', path: `${ROUTES.ADMIN.ROOT}/patients`, icon: IconPatient },
      { label: 'Appointments', path: `${ROUTES.ADMIN.ROOT}/appointments`, icon: IconCalendar },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Departments', path: `${ROUTES.ADMIN.ROOT}/departments`, icon: IconTag },
      { label: 'Cities', path: `${ROUTES.ADMIN.ROOT}/cities`, icon: IconMap },
      { label: 'Staff', path: `${ROUTES.ADMIN.ROOT}/staff`, icon: IconPeople },
    ],
  },
];

/** Convert sections into flat navItems for DashboardShell */
const navItems = NAV_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({
    ...item,
    section: section.title,
  }))
);

/** Root layout for the Admin panel — wraps every /admin/* route. */
const AdminLayout = () => (
  <DashboardShell
    roleLabel="Admin"
    accent="admin"
    navItems={navItems}
    navSections={NAV_SECTIONS}
  />
);

export default AdminLayout;
