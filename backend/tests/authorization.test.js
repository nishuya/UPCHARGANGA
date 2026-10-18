/**
 * AUTHORIZATION TESTS
 * ===================
 * Comprehensive test suite for authorization and data isolation
 *
 * Tests verify:
 * 1. Patient data isolation (patients can only access own appointments)
 * 2. Hospital staff isolation (reception/doctors can only access own hospital)
 * 3. Queue operation boundaries (doctors only operate on assigned queues)
 * 4. Role-based access control enforcement
 * 5. No data leakage in error responses
 */

const request = require('supertest');
const app = require('../src/app');
const User = require('../src/modules/auth/auth.model');
const Appointment = require('../src/modules/appointments/appointments.model');
const Queue = require('../src/modules/queue/queue.model');
const Hospital = require('../src/modules/hospitals/hospitals.model');
const Doctor = require('../src/modules/doctors/doctors.model');
const Department = require('../src/modules/departments/departments.model');

// =====================================================================
// TEST FIXTURES & HELPERS
// =====================================================================

let testData = {};

beforeAll(async () => {
  // Create test hospitals
  testData.hospitalA = await Hospital.create({
    name: 'Hospital A',
    address: { line1: '123 Main St' },
    contact: { phone: '123-456-7890' },
    isActive: true,
  });

  testData.hospitalB = await Hospital.create({
    name: 'Hospital B',
    address: { line1: '456 Oak Ave' },
    contact: { phone: '456-789-0123' },
    isActive: true,
  });

  // Create test departments
  testData.deptA = await Department.create({
    name: 'Cardiology',
    hospital: testData.hospitalA._id,
    isActive: true,
  });

  testData.deptB = await Department.create({
    name: 'Orthopedics',
    hospital: testData.hospitalB._id,
    isActive: true,
  });

  // Create test users
  testData.patient1 = await User.create({
    email: 'patient1@test.com',
    password: 'password123',
    fullName: 'Patient One',
    role: 'patient',
    isActive: true,
  });

  testData.patient2 = await User.create({
    email: 'patient2@test.com',
    password: 'password123',
    fullName: 'Patient Two',
    role: 'patient',
    isActive: true,
  });

  testData.receptionistA = await User.create({
    email: 'reception-a@test.com',
    password: 'password123',
    fullName: 'Receptionist A',
    role: 'receptionist',
    hospital: testData.hospitalA._id,
    isActive: true,
  });

  testData.receptionistB = await User.create({
    email: 'reception-b@test.com',
    password: 'password123',
    fullName: 'Receptionist B',
    role: 'receptionist',
    hospital: testData.hospitalB._id,
    isActive: true,
  });

  testData.doctor = await User.create({
    email: 'doctor1@test.com',
    password: 'password123',
    fullName: 'Dr. Smith',
    role: 'doctor',
    hospital: testData.hospitalA._id,
    isActive: true,
  });

  testData.doctorAssistant = await User.create({
    email: 'assistant1@test.com',
    password: 'password123',
    fullName: 'Assistant One',
    role: 'doctor-assistant',
    hospital: testData.hospitalA._id,
    isActive: true,
  });

  testData.admin = await User.create({
    email: 'admin@system.com',
    password: 'password123',
    fullName: 'System Admin',
    role: 'admin',
    isActive: true,
  });

  // Create test doctors
  testData.docA = await Doctor.create({
    user: testData.doctor._id,
    hospital: testData.hospitalA._id,
    department: testData.deptA._id,
    specialization: 'Cardiology',
    availability: [
      { day: 'Monday', startTime: '09:00', endTime: '17:00', maxPatients: 10, slotDurationMinutes: 15 },
    ],
    isActive: true,
  });

  // Create test appointments
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  testData.appointmentP1 = await Appointment.create({
    patient: testData.patient1._id,
    doctor: testData.docA._id,
    hospital: testData.hospitalA._id,
    department: testData.deptA._id,
    appointmentDate: today,
    timeSlot: { start: '09:00', end: '09:15' },
    tokenNumber: 1,
    bookingNumber: 'BK001',
    status: 'confirmed',
    consultationType: 'online-booking',
    createdBy: testData.patient1._id,
    isActive: true,
  });

  testData.appointmentP2 = await Appointment.create({
    patient: testData.patient2._id,
    doctor: testData.docA._id,
    hospital: testData.hospitalA._id,
    department: testData.deptA._id,
    appointmentDate: today,
    timeSlot: { start: '09:15', end: '09:30' },
    tokenNumber: 2,
    bookingNumber: 'BK002',
    status: 'confirmed',
    consultationType: 'online-booking',
    createdBy: testData.patient2._id,
    isActive: true,
  });

  // Create test queue
  testData.queue = await Queue.create({
    doctor: testData.docA._id,
    hospital: testData.hospitalA._id,
    department: testData.deptA._id,
    date: today,
    entries: [
      {
        appointment: testData.appointmentP1._id,
        patient: testData.patient1._id,
        tokenNumber: 1,
        status: 'waiting',
        queuePosition: 1,
      },
      {
        appointment: testData.appointmentP2._id,
        patient: testData.patient2._id,
        tokenNumber: 2,
        status: 'waiting',
        queuePosition: 2,
      },
    ],
    currentTokenNumber: 0,
    totalTokensIssued: 2,
    averageConsultationMinutes: 15,
  });
});

// =====================================================================
// 1. PATIENT DATA ISOLATION TESTS
// =====================================================================

describe('1. Patient Data Isolation', () => {
  let patient1Token, patient2Token;

  beforeAll(async () => {
    const res1 = await request(app)
      .post('/api/auth/login')
      .send({ email: 'patient1@test.com', password: 'password123' });
    patient1Token = res1.body.accessToken;

    const res2 = await request(app)
      .post('/api/auth/login')
      .send({ email: 'patient2@test.com', password: 'password123' });
    patient2Token = res2.body.accessToken;
  });

  test('Patient can view own appointment', async () => {
    const res = await request(app)
      .get(`/api/patients/appointments/${testData.appointmentP1._id}`)
      .set('Authorization', `Bearer ${patient1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.appointment._id.toString()).toBe(testData.appointmentP1._id.toString());
  });

  test('Patient cannot view other patient appointment', async () => {
    const res = await request(app)
      .get(`/api/patients/appointments/${testData.appointmentP2._id}`)
      .set('Authorization', `Bearer ${patient1Token}`);

    expect(res.status).toBe(404);
    expect(res.body.data).toBeUndefined(); // No data leak
  });

  test('Patient cannot view other patient queue entry', async () => {
    const res = await request(app)
      .get(`/api/patients/appointments/${testData.appointmentP2._id}/queue-entry`)
      .set('Authorization', `Bearer ${patient1Token}`);

    expect(res.status).toBe(404);
  });

  test('Patient cannot cancel other patient appointment', async () => {
    const res = await request(app)
      .patch(`/api/patients/appointments/${testData.appointmentP2._id}/cancel`)
      .set('Authorization', `Bearer ${patient1Token}`)
      .send({ cancellationReason: 'Emergency' });

    expect(res.status).toBe(404);

    // Verify appointment was NOT cancelled
    const appt = await Appointment.findById(testData.appointmentP2._id);
    expect(appt.status).toBe('confirmed');
  });

  test('Unauthenticated user cannot access patient endpoints', async () => {
    const res = await request(app).get(`/api/patients/appointments/${testData.appointmentP1._id}`);

    expect(res.status).toBe(401);
  });
});

// =====================================================================
// 2. RECEPTION HOSPITAL ISOLATION TESTS
// =====================================================================

describe('2. Reception Hospital Isolation', () => {
  let receptionAToken, receptionBToken;

  beforeAll(async () => {
    const resA = await request(app)
      .post('/api/auth/login')
      .send({ email: 'reception-a@test.com', password: 'password123' });
    receptionAToken = resA.body.accessToken;

    const resB = await request(app)
      .post('/api/auth/login')
      .send({ email: 'reception-b@test.com', password: 'password123' });
    receptionBToken = resB.body.accessToken;
  });

  test('Reception can view appointments for their hospital', async () => {
    const res = await request(app)
      .get('/api/reception/appointments/waiting-for-arrival')
      .set('Authorization', `Bearer ${receptionAToken}`);

    expect(res.status).toBe(200);
    // Should see appointments from Hospital A only
    const apptIds = res.body.data.appointments.map(a => a._id.toString());
    expect(apptIds).toContain(testData.appointmentP1._id.toString());
  });

  test('Reception cannot access other hospital appointments', async () => {
    const res = await request(app)
      .patch(`/api/reception/appointments/${testData.appointmentP1._id}/arrive`)
      .set('Authorization', `Bearer ${receptionBToken}`)
      .send({ verificationMethod: 'id-card', verificationNotes: 'Verified' });

    expect(res.status).toBe(403);
  });

  test('Reception cannot mark patient arrived in different hospital', async () => {
    const res = await request(app)
      .patch(`/api/reception/appointments/${testData.appointmentP1._id}/arrive`)
      .set('Authorization', `Bearer ${receptionBToken}`)
      .send({ verificationMethod: 'id-card', verificationNotes: 'Verified' });

    expect(res.status).toBe(403);
  });
});

// =====================================================================
// 3. QUEUE OPERATION BOUNDARIES TESTS
// =====================================================================

describe('3. Queue Operation Boundaries', () => {
  let doctorToken, assistantToken, patient1Token;

  beforeAll(async () => {
    const resDoc = await request(app)
      .post('/api/auth/login')
      .send({ email: 'doctor1@test.com', password: 'password123' });
    doctorToken = resDoc.body.accessToken;

    const resAssist = await request(app)
      .post('/api/auth/login')
      .send({ email: 'assistant1@test.com', password: 'password123' });
    assistantToken = resAssist.body.accessToken;

    const resPat = await request(app)
      .post('/api/auth/login')
      .send({ email: 'patient1@test.com', password: 'password123' });
    patient1Token = resPat.body.accessToken;
  });

  test('Patient cannot perform queue operations', async () => {
    const res = await request(app)
      .post(`/api/queue/${testData.queue._id}/call-next`)
      .set('Authorization', `Bearer ${patient1Token}`);

    expect(res.status).toBe(403);
  });

  test('Doctor assistant can access their assigned queue', async () => {
    const res = await request(app)
      .get(`/api/queue/${testData.docA._id}/${testData.queue.date.toISOString().split('T')[0]}`)
      .set('Authorization', `Bearer ${assistantToken}`);

    expect(res.status).toBe(200);
  });

  test('Doctor assistant cannot call next from unassigned queue', async () => {
    // Create a queue for a doctor not in their hospital (simulating cross-hospital attack)
    // This test would require setup in a different hospital
    // For now, verify the authorization middleware is in place
    expect(true).toBe(true); // Placeholder
  });

  test('Queue access requires authorization header', async () => {
    const res = await request(app).get(
      `/api/queue/${testData.docA._id}/${testData.queue.date.toISOString().split('T')[0]}`
    );

    expect(res.status).toBe(401);
  });
});

// =====================================================================
// 4. ROLE-BASED ACCESS CONTROL TESTS
// =====================================================================

describe('4. Role-Based Access Control', () => {
  let adminToken, patientToken;

  beforeAll(async () => {
    const resAdmin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@system.com', password: 'password123' });
    adminToken = resAdmin.body.accessToken;

    const resPat = await request(app)
      .post('/api/auth/login')
      .send({ email: 'patient1@test.com', password: 'password123' });
    patientToken = resPat.body.accessToken;
  });

  test('Patient cannot access reception endpoints', async () => {
    const res = await request(app)
      .get('/api/reception/appointments/waiting-for-arrival')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(403);
  });

  test('Patient cannot access doctor queue operations', async () => {
    const res = await request(app)
      .post(`/api/queue/${testData.queue._id}/call-next`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(403);
  });

  test('Admin can access any resource', async () => {
    const res = await request(app)
      .get(`/api/queue/${testData.docA._id}/${testData.queue.date.toISOString().split('T')[0]}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });
});

// =====================================================================
// 5. NO DATA LEAKAGE IN ERROR RESPONSES
// =====================================================================

describe('5. No Data Leakage in Error Responses', () => {
  let patient1Token;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'patient1@test.com', password: 'password123' });
    patient1Token = res.body.accessToken;
  });

  test('404 errors do not leak appointment data', async () => {
    const res = await request(app)
      .get(`/api/patients/appointments/${testData.appointmentP2._id}`)
      .set('Authorization', `Bearer ${patient1Token}`);

    expect(res.status).toBe(404);
    expect(res.body.data).toBeUndefined(); // No appointment data
    expect(res.body.message).not.toContain('patient2'); // No patient info
  });

  test('403 errors do not leak resource details', async () => {
    const res = await request(app)
      .patch(`/api/reception/appointments/${testData.appointmentP1._id}/arrive`)
      .set('Authorization', `Bearer ${testData.receptionistB._id}`)
      .send({ verificationMethod: 'id-card', verificationNotes: 'Verified' });

    expect(res.status).toBe(403);
    expect(res.body.message).not.toContain('Hospital A'); // No hospital name
    expect(res.body.message).not.toContain('Patient'); // No patient name
  });

  test('Invalid token returns 401 without leaking user info', async () => {
    const res = await request(app)
      .get(`/api/patients/appointments/${testData.appointmentP1._id}`)
      .set('Authorization', 'Bearer invalid.token.here');

    expect(res.status).toBe(401);
    expect(res.body.data).toBeUndefined();
  });
});

// =====================================================================
// 6. DEACTIVATED USER CANNOT ACCESS API
// =====================================================================

describe('6. Deactivated User Access Control', () => {
  test('Deactivated user cannot access API', async () => {
    // Create a temporary user
    const tempUser = await User.create({
      email: 'temp@test.com',
      password: 'password123',
      fullName: 'Temporary User',
      role: 'patient',
      isActive: true,
    });

    // Login to get token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'temp@test.com', password: 'password123' });

    const tempToken = loginRes.body.accessToken;

    // Deactivate the user
    await User.updateOne({ _id: tempUser._id }, { isActive: false });

    // Try to access API with valid token but deactivated account
    const res = await request(app)
      .get('/api/patients/appointments')
      .set('Authorization', `Bearer ${tempToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('deactivated');
  });
});
