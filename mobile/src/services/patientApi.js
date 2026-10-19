import api, { getStoredRefreshToken } from './api';

export const patientApi = {
  register: (payload) => api.post('/auth/register', payload),
  login: (payload) => api.post('/auth/login', payload),
  logout: async () =>
    api.post('/auth/logout', { refreshToken: await getStoredRefreshToken() }),
  me: () => api.get('/auth/me'),
  getCities: () => api.get('/cities'),
  getHospitals: (params = {}) => api.get('/hospitals', { params }),
  getHospitalById: (id) => api.get(`/hospitals/${id}`),
  getDoctors: (params = {}) => api.get('/doctors', { params }),
  getDoctorById: (id) => api.get(`/doctors/${id}`),
  getMyAppointments: () => api.get('/patients/appointments'),
  getAppointmentById: (id) => api.get(`/patients/appointments/${id}`),
  getQueueEntry: (id) => api.get(`/patients/appointments/${id}/queue-entry`),
  bookAppointment: (payload) => api.post('/patients/appointments', payload),
  cancelAppointment: (id, reason) =>
    api.patch(`/patients/appointments/${id}/cancel`, { cancellationReason: reason }),
  getUnreadNotifications: (limit = 20) => api.get('/notifications', { params: { limit } }),
  getAllNotifications: (limit = 100) => api.get('/notifications/all', { params: { limit } }),
  markNotificationAsRead: (id) => api.patch(`/notifications/${id}/read`),
};
