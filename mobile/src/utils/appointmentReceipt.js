const escapeHtml = (value) =>
  String(value ?? 'N/A').replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });

const formatDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'N/A'
    : date.toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
};

export const createAppointmentShareMessage = (appointment) => {
  const time = appointment?.timeSlot?.start
    ? `, ${appointment.timeSlot.start}${appointment.timeSlot.end ? `-${appointment.timeSlot.end}` : ''}`
    : '';
  return [
    'UpcharGanga appointment receipt',
    `Token: #${appointment?.tokenNumber ?? 'N/A'}`,
    `Doctor: Dr. ${appointment?.doctor?.user?.fullName || 'Doctor'}`,
    `Hospital: ${appointment?.hospital?.name || 'Hospital'}`,
    `Date: ${formatDate(appointment?.appointmentDate)}${time}`,
    `Booking reference: ${appointment?.bookingNumber || 'N/A'}`,
  ].join('\n');
};

export const createAppointmentReceiptHtml = (appointment) => {
  const address = appointment?.hospital?.address;
  const addressText = [
    address?.line1,
    address?.line2,
    address?.pincode,
  ].filter(Boolean).join(', ');
  const detail = (label, value) =>
    `<div class="row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;

  return `<!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; color: #111827; padding: 28px; }
          .receipt { max-width: 640px; margin: 0 auto; border: 1px solid #d1d5db; border-radius: 16px; overflow: hidden; }
          header { background: #f0faf7; border-bottom: 1px solid #a8e1d5; padding: 24px; text-align: center; }
          h1 { margin: 0; color: #1f7d6f; font-size: 24px; }
          .confirmed { color: #059669; margin: 12px 0 0; font-weight: bold; }
          .token { padding: 24px; text-align: center; border-bottom: 1px solid #e5e7eb; }
          .token-label { color: #6b7280; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; }
          .token-value { color: #1f7d6f; font-size: 52px; font-weight: bold; margin: 8px 0 0; }
          section { padding: 20px 24px; border-bottom: 1px solid #e5e7eb; }
          h2 { margin: 0 0 12px; font-size: 14px; color: #4b5563; text-transform: uppercase; letter-spacing: 1px; }
          .row { display: flex; justify-content: space-between; gap: 20px; padding: 7px 0; }
          .row span { color: #6b7280; }
          .row strong { text-align: right; }
          footer { padding: 18px 24px; text-align: center; color: #4b5563; font-size: 12px; }
          @media print { body { padding: 0; } .receipt { border-radius: 0; } }
        </style>
      </head>
      <body>
        <article class="receipt">
          <header><h1>UpcharGanga</h1><p>Hospital Queue Management</p><p class="confirmed">Appointment Confirmed</p></header>
          <div class="token"><div class="token-label">Your Token Number</div><div class="token-value">#${escapeHtml(appointment?.tokenNumber)}</div></div>
          <section>
            <h2>Doctor and Hospital</h2>
            ${detail('Doctor', `Dr. ${appointment?.doctor?.user?.fullName || 'Doctor'}`)}
            ${detail('Specialization', appointment?.doctor?.specialization)}
            ${detail('Hospital', appointment?.hospital?.name || 'Hospital')}
            ${addressText ? detail('Address', addressText) : ''}
            ${appointment?.hospital?.contact?.phone ? detail('Hospital phone', appointment.hospital.contact.phone) : ''}
            ${appointment?.department?.name ? detail('Department', appointment.department.name) : ''}
          </section>
          <section>
            <h2>Patient and Booking</h2>
            ${detail('Patient', appointment?.patient?.fullName || appointment?.bookedByPatient?.fullName)}
            ${detail('Booking reference', appointment?.bookingNumber)}
            ${detail('Appointment date', formatDate(appointment?.appointmentDate))}
            ${detail('Booked time', appointment?.timeSlot?.start
              ? `${appointment.timeSlot.start}${appointment.timeSlot.end ? ` - ${appointment.timeSlot.end}` : ''}`
              : 'N/A')}
          </section>
          <footer>Please arrive at the hospital at least 15 minutes before your appointment time.</footer>
        </article>
      </body>
    </html>`;
};
