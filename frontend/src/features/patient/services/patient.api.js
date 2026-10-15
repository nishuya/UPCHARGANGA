import apiClient from '../../../services/apiClient';

// ---- Lookup data (public/optionalAuth on the backend) ----

export const getCities = (params = {}) =>
  apiClient.get('/cities', { params: { limit: 100, ...params } });

export const getHospitals = (params = {}) =>
  apiClient.get('/hospitals', { params: { limit: 100, ...params } });

export const getHospitalById = (id) => apiClient.get(`/hospitals/${id}`);

export const getDepartments = (params = {}) =>
  apiClient.get('/departments', { params: { limit: 100, ...params } });

export const getDoctors = (params = {}) =>
  apiClient.get('/doctors', { params: { limit: 100, ...params } });

export const getDoctorById = (id) => apiClient.get(`/doctors/${id}`);

// ---- Patient-only appointment endpoints ----

export const bookAppointment = (payload) => apiClient.post('/patients/appointments', payload);

export const getMyAppointments = (params = {}) =>
  apiClient.get('/patients/appointments', { params });

export const getMyAppointmentById = (id) => apiClient.get(`/patients/appointments/${id}`);

export const getMyAppointmentQueueEntry = (id) =>
  apiClient.get(`/patients/appointments/${id}/queue-entry`);

export const cancelMyAppointment = (id, cancellationReason) =>
  apiClient.patch(`/patients/appointments/${id}/cancel`, { cancellationReason });
