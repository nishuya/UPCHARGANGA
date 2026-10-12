const express = require('express');
const router = express.Router();

const authRoutes = require('../modules/auth/auth.routes');
const cityRoutes = require('../modules/cities/cities.routes');
const hospitalRoutes = require('../modules/hospitals/hospitals.routes');
const departmentRoutes = require('../modules/departments/departments.routes');
const doctorRoutes = require('../modules/doctors/doctors.routes');
const patientRoutes = require('../modules/patients/patients.routes');
const receptionRoutes = require('../modules/reception/reception.routes');
const doctorAssistantRoutes = require('../modules/doctorAssistant/doctorAssistant.routes');
const adminRoutes = require('../modules/admin/admin.routes');
const staffRoutes = require('../modules/staff/staff.routes');
const notificationRoutes = require('../modules/notifications/notifications.routes');
const queueRoutes = require('../modules/queue/queue.routes');

router.use('/auth', authRoutes);
router.use('/cities', cityRoutes);
router.use('/hospitals', hospitalRoutes);
router.use('/departments', departmentRoutes);
router.use('/doctors', doctorRoutes);
router.use('/patients', patientRoutes);
router.use('/reception', receptionRoutes);
router.use('/doctor-assistant', doctorAssistantRoutes);
router.use('/admin/staff', staffRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);
router.use('/queue', queueRoutes);

module.exports = router;
