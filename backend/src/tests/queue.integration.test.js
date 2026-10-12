/**
 * Queue Token & Booking System - Integration Test
 * Verifies the entire booking flow works correctly without double-incrementation
 */

const mongoose = require('mongoose');
const Queue = require('../src/modules/queue/queue.model');
const Appointment = require('../src/modules/appointments/appointments.model');
const QueueService = require('../src/modules/queue/queue.service');
const withTransaction = require('../src/utils/withTransaction.util');

/**
 * Test Scenario: Multiple patients book with the same doctor on the same day
 * Expected: Token numbers should be sequential (1, 2, 3, ...) with no gaps
 */
async function testQueueTokenSequence() {
  console.log('\n=== Testing Queue Token Sequence ===\n');

  const testDoctorId = new mongoose.Types.ObjectId();
  const testDate = new Date('2026-10-15');
  const testHospitalId = new mongoose.Types.ObjectId();
  const testDepartmentId = new mongoose.Types.ObjectId();

  try {
    // Clean up any existing test data
    await Queue.deleteMany({ doctor: testDoctorId, date: testDate });
    await Appointment.deleteMany({ doctor: testDoctorId, appointmentDate: testDate });

    console.log('✓ Cleaned up existing test data');

    // Simulate 5 patients booking sequentially
    const bookings = [];
    for (let i = 1; i <= 5; i++) {
      const result = await withTransaction(async (session) => {
        console.log(`\n📋 Booking patient ${i}...`);

        // Get next token
        const tokenNumber = await QueueService.getNextTokenNumber(
          testDoctorId,
          testDate,
          session
        );
        console.log(`   Token assigned: ${tokenNumber}`);

        // Verify token matches expected sequence
        if (tokenNumber !== i) {
          throw new Error(
            `❌ Token mismatch! Expected ${i}, got ${tokenNumber}. Double-incrementation detected!`
          );
        }

        // Create appointment
        const [appointment] = await Appointment.create(
          [
            {
              patient: new mongoose.Types.ObjectId(),
              doctor: testDoctorId,
              hospital: testHospitalId,
              department: testDepartmentId,
              appointmentDate: testDate,
              timeSlot: { start: '09:00', end: '09:30' },
              tokenNumber,
              bookingNumber: `BK-${testDoctorId}-${i}`,
              status: 'confirmed',
              consultationType: 'online_booking',
              reasonForVisit: 'Test booking',
              isActive: true,
            },
          ],
          { session }
        );

        // Add to queue
        await QueueService.addEntry(
          {
            hospitalId: testHospitalId,
            departmentId: testDepartmentId,
            doctorId: testDoctorId,
            date: testDate,
            appointmentId: appointment._id,
            patientId: appointment.patient,
            tokenNumber,
            averageConsultationMinutes: 30,
          },
          session
        );

        // Recalculate queue
        const queue = await QueueService.recalculateQueue(
          testDoctorId,
          testDate,
          session
        );

        return {
          tokenNumber,
          queueDocument: queue,
        };
      });

      bookings.push(result);
      console.log(`   ✓ Patient ${i} booked with token ${result.tokenNumber}`);
    }

    // Verify final state
    const finalQueue = await Queue.findOne({ doctor: testDoctorId, date: testDate });
    console.log(`\n✅ Final Queue State:`);
    console.log(`   Total tokens issued: ${finalQueue.totalTokensIssued}`);
    console.log(`   Total entries: ${finalQueue.entries.length}`);
    console.log(`   Entry tokens: ${finalQueue.entries.map(e => e.tokenNumber).join(', ')}`);

    // Assertions
    if (finalQueue.totalTokensIssued !== 5) {
      throw new Error(
        `❌ Expected totalTokensIssued=5, got ${finalQueue.totalTokensIssued}. Double-incrementation detected!`
      );
    }
    if (finalQueue.entries.length !== 5) {
      throw new Error(`❌ Expected 5 entries, got ${finalQueue.entries.length}`);
    }

    const expectedTokens = [1, 2, 3, 4, 5];
    const actualTokens = finalQueue.entries.map(e => e.tokenNumber);
    if (JSON.stringify(actualTokens) !== JSON.stringify(expectedTokens)) {
      throw new Error(
        `❌ Token sequence mismatch! Expected [1,2,3,4,5], got [${actualTokens.join(',')}]`
      );
    }

    console.log(`\n✅ SUCCESS: All 5 patients have sequential tokens with no duplicates!\n`);
    return true;
  } catch (error) {
    console.error(`\n❌ TEST FAILED: ${error.message}\n`);
    return false;
  }
}

/**
 * Test Scenario: Multiple concurrent bookings (simulating race condition)
 * Expected: Each gets a unique token number
 */
async function testConcurrentBookings() {
  console.log('\n=== Testing Concurrent Bookings ===\n');

  const testDoctorId = new mongoose.Types.ObjectId();
  const testDate = new Date('2026-10-16');
  const testHospitalId = new mongoose.Types.ObjectId();
  const testDepartmentId = new mongoose.Types.ObjectId();

  try {
    // Clean up
    await Queue.deleteMany({ doctor: testDoctorId, date: testDate });
    await Appointment.deleteMany({ doctor: testDoctorId, appointmentDate: testDate });

    console.log('✓ Cleaned up existing test data');

    // Fire 5 bookings concurrently
    const concurrentPromises = Array.from({ length: 5 }, (_, i) =>
      withTransaction(async (session) => {
        const tokenNumber = await QueueService.getNextTokenNumber(
          testDoctorId,
          testDate,
          session
        );

        const [appointment] = await Appointment.create(
          [
            {
              patient: new mongoose.Types.ObjectId(),
              doctor: testDoctorId,
              hospital: testHospitalId,
              department: testDepartmentId,
              appointmentDate: testDate,
              timeSlot: { start: '09:00', end: '09:30' },
              tokenNumber,
              bookingNumber: `BK-${testDoctorId}-${i + 1}`,
              status: 'confirmed',
              consultationType: 'online_booking',
              reasonForVisit: 'Concurrent test booking',
              isActive: true,
            },
          ],
          { session }
        );

        await QueueService.addEntry(
          {
            hospitalId: testHospitalId,
            departmentId: testDepartmentId,
            doctorId: testDoctorId,
            date: testDate,
            appointmentId: appointment._id,
            patientId: appointment.patient,
            tokenNumber,
            averageConsultationMinutes: 30,
          },
          session
        );

        return tokenNumber;
      })
    );

    const assignedTokens = await Promise.all(concurrentPromises);
    console.log(`Assigned tokens: ${assignedTokens.join(', ')}`);

    // Verify uniqueness
    const uniqueTokens = new Set(assignedTokens);
    if (uniqueTokens.size !== 5) {
      throw new Error(
        `❌ Concurrent booking generated duplicate tokens! Expected 5 unique, got ${uniqueTokens.size}`
      );
    }

    // Verify they're sequential
    const sorted = [...assignedTokens].sort((a, b) => a - b);
    if (JSON.stringify(sorted) !== JSON.stringify([1, 2, 3, 4, 5])) {
      throw new Error(
        `❌ Tokens not sequential after concurrent bookings: [${sorted.join(',')}]`
      );
    }

    const finalQueue = await Queue.findOne({ doctor: testDoctorId, date: testDate });
    console.log(`Final totalTokensIssued: ${finalQueue.totalTokensIssued}`);

    if (finalQueue.totalTokensIssued !== 5) {
      throw new Error(
        `❌ Expected totalTokensIssued=5, got ${finalQueue.totalTokensIssued}`
      );
    }

    console.log(`\n✅ SUCCESS: Concurrent bookings generated unique sequential tokens!\n`);
    return true;
  } catch (error) {
    console.error(`\n❌ TEST FAILED: ${error.message}\n`);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║     QUEUE TOKEN & BOOKING SYSTEM - INTEGRATION TESTS   ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  const results = [];

  results.push(await testQueueTokenSequence());
  results.push(await testConcurrentBookings());

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log(`║ SUMMARY: ${results.filter(r => r).length}/${results.length} tests passed`);
  console.log('╚════════════════════════════════════════════════════════╝\n');

  if (results.every(r => r)) {
    console.log('✅ All tests passed! Queue token system is working correctly.\n');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Check the output above.\n');
    process.exit(1);
  }
}

// Export for use in test runners
module.exports = {
  testQueueTokenSequence,
  testConcurrentBookings,
  runAllTests,
};

// Run if executed directly
if (require.main === module) {
  runAllTests().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
