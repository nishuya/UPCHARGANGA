import api from './api';

const lookupCache = new Map();

const cachedLookup = (key, maxAgeMs, request) => {
  const cached = lookupCache.get(key);
  if (cached?.response && Date.now() - cached.cachedAt < maxAgeMs) {
    return Promise.resolve(cached.response);
  }
  if (cached?.promise) return cached.promise;

  const promise = request()
    .then((response) => {
      lookupCache.set(key, { response, cachedAt: Date.now() });
      return response;
    })
    .catch((error) => {
      if (lookupCache.get(key)?.promise === promise) lookupCache.delete(key);
      throw error;
    });
  lookupCache.set(key, { promise });
  return promise;
};

const getCachedLookup = (path, params = {}, maxAgeMs = 60000) => {
  const key = `${path}:${JSON.stringify(params)}`;
  return cachedLookup(key, maxAgeMs, () => api.get(path, { params }));
};

export const invalidateDoctorLookupCache = () => {
  for (const key of lookupCache.keys()) {
    if (key.startsWith('/doctors:')) lookupCache.delete(key);
  }
};

export const patientApi = {
  register: (payload) => api.post('/auth/register', payload),
  login: (payload) => api.post('/auth/login', payload),
  logout: (refreshToken) => api.post('/auth/logout', refreshToken ? { refreshToken } : {}),
  me: () => api.get('/auth/me', { timeout: 10000 }),
  getCities: () => getCachedLookup('/cities', {}, 5 * 60 * 1000),
  getHospitals: (params = {}) => getCachedLookup('/hospitals', params),
  getHospitalById: (id) => getCachedLookup(`/hospitals/${id}`),
  getDoctors: (params = {}) => getCachedLookup('/doctors', params, 30 * 1000),
  getDoctorById: (id) => getCachedLookup(`/doctors/${id}`, {}, 2 * 60 * 1000),
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
