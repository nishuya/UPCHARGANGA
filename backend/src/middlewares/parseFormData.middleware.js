/**
 * Middleware to parse JSON string fields in FormData requests
 * CRITICAL: When using Multer with FormData, text fields go to req.body
 * and files go to req.file. This middleware parses JSON strings in req.body
 *
 * Order in route: uploadSingle('image') → handleMulterError → parseFormData → validate
 */
const parseFormDataFields = (req, res, next) => {
  console.log('\n========== [FORMDATA] START ==========');
  console.log('[FORMDATA] req.body exists?', !!req.body);
  console.log('[FORMDATA] req.file exists?', !!req.file);

  if (!req.body) {
    console.log('[FORMDATA] ERROR: No req.body found!');
    console.log('========== [FORMDATA] END ==========\n');
    return next();
  }

  console.log('[FORMDATA] Body keys:', Object.keys(req.body));
  console.log('[FORMDATA] Body content (first 300 chars):');
  Object.keys(req.body).forEach(key => {
    const val = req.body[key];
    const display = typeof val === 'string' ? val.substring(0, 100) : JSON.stringify(val).substring(0, 100);
    console.log(`  ${key}: ${display}`);
  });

  // CRITICAL: Parse availability from JSON string to array
  if (req.body.availability !== undefined && req.body.availability !== null) {
    console.log('\n[FORMDATA] Processing availability field...');
    console.log(`[FORMDATA] Type: ${typeof req.body.availability}`);
    console.log(`[FORMDATA] Value: ${JSON.stringify(req.body.availability).substring(0, 150)}`);

    if (Array.isArray(req.body.availability)) {
      console.log('[FORMDATA] ✓ availability is already an array');
    } else if (typeof req.body.availability === 'string') {
      console.log('[FORMDATA] availability is a string - attempting JSON.parse...');
      try {
        const parsed = JSON.parse(req.body.availability);
        if (Array.isArray(parsed)) {
          req.body.availability = parsed;
          console.log(`[FORMDATA] ✓ Parsed successfully! Now an array with ${parsed.length} items`);
        } else {
          console.error('[FORMDATA] ERROR: Parsed JSON is not an array:', typeof parsed);
        }
      } catch (err) {
        console.error(`[FORMDATA] ERROR: JSON.parse failed: ${err.message}`);
        console.error(`[FORMDATA] String value was: ${req.body.availability}`);
      }
    } else {
      console.error(`[FORMDATA] ERROR: availability is type '${typeof req.body.availability}', not string or array`);
    }
  } else {
    console.log('[FORMDATA] availability field is missing - setting to []');
    req.body.availability = [];
  }

  // CRITICAL: Parse qualifications from JSON string to array
  if (req.body.qualifications !== undefined && req.body.qualifications !== null) {
    console.log('\n[FORMDATA] Processing qualifications field...');
    console.log(`[FORMDATA] Type: ${typeof req.body.qualifications}`);
    console.log(`[FORMDATA] Value: ${JSON.stringify(req.body.qualifications).substring(0, 150)}`);

    if (Array.isArray(req.body.qualifications)) {
      console.log('[FORMDATA] ✓ qualifications is already an array');
    } else if (typeof req.body.qualifications === 'string') {
      console.log('[FORMDATA] qualifications is a string - attempting JSON.parse...');
      try {
        const parsed = JSON.parse(req.body.qualifications);
        if (Array.isArray(parsed)) {
          req.body.qualifications = parsed;
          console.log(`[FORMDATA] ✓ Parsed successfully! Now an array with ${parsed.length} items`);
        } else {
          console.error('[FORMDATA] ERROR: Parsed JSON is not an array:', typeof parsed);
        }
      } catch (err) {
        console.error(`[FORMDATA] ERROR: JSON.parse failed: ${err.message}`);
        console.error(`[FORMDATA] String value was: ${req.body.qualifications}`);
      }
    } else {
      console.error(`[FORMDATA] ERROR: qualifications is type '${typeof req.body.qualifications}', not string or array`);
    }
  } else {
    console.log('[FORMDATA] qualifications field is missing - setting to []');
    req.body.qualifications = [];
  }

  // Parse other JSON fields if present
  ['address', 'contact', 'postalCodes'].forEach(field => {
    if (req.body[field] && typeof req.body[field] === 'string') {
      try {
        req.body[field] = JSON.parse(req.body[field]);
        console.log(`[FORMDATA] Parsed ${field} successfully`);
      } catch (err) {
        console.warn(`[FORMDATA] Could not parse ${field}: ${err.message}`);
      }
    }
  });

  console.log('\n[FORMDATA] Final state:');
  console.log(`[FORMDATA] availability type: ${Array.isArray(req.body.availability) ? 'ARRAY ✓' : typeof req.body.availability}`);
  console.log(`[FORMDATA] availability value: ${JSON.stringify(req.body.availability)}`);
  console.log(`[FORMDATA] qualifications type: ${Array.isArray(req.body.qualifications) ? 'ARRAY ✓' : typeof req.body.qualifications}`);
  console.log(`[FORMDATA] qualifications value: ${JSON.stringify(req.body.qualifications)}`);
  console.log('========== [FORMDATA] END ==========\n');

  next();
};

module.exports = parseFormDataFields;


