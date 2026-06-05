/**
 * Watch Register Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Checks a watch serial number against a stolen-asset database.
 *
 * PRODUCTION SETUP:
 *   Register at https://www.thewatchregister.com/api and set:
 *     WATCH_REGISTER_API_KEY=your_real_key_here
 *   in your .env file. The service will auto-switch to the live API.
 *
 * CURRENT MODE: Mock / Offline
 *   Fully functional mock that simulates the API with a local blacklist so
 *   you can test the full Admin approval flow right now, without a paid key.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const pool = require("../config/db");

// ─── Local Blacklist (used when no API key is configured) ───────────────────
// Format: { serial, brand, reason }
// Add any known stolen serials here for testing.
const LOCAL_STOLEN_BLACKLIST = [
  { serial: "TEST-STOLEN-001", brand: "Rolex", reason: "Reported stolen - London, UK (2024)" },
  { serial: "FAKE-ROLEX-999",  brand: "Rolex", reason: "Counterfeit serial identified by Rolex SA" },
  { serial: "STOLEN-123456",   brand: "Patek Philippe", reason: "Interpol red notice - theft from private collector" },
];

// ─── Core Check Function ─────────────────────────────────────────────────────
/**
 * Checks if a serial number is flagged as stolen.
 * @param {string} serial - The watch serial number to check
 * @param {string} brand  - The declared brand name (used for live API)
 * @returns {Promise<{ clean: boolean, flagged: boolean, reason: string|null, source: string }>}
 */
async function checkSerial(serial, brand = "") {
  if (!serial || serial.trim() === "") {
    // No serial provided — cannot check, pass through with a warning
    return { clean: true, flagged: false, reason: null, source: "no_serial_provided" };
  }

  const normalizedSerial = serial.trim().toUpperCase();

  // ── LIVE API PATH ──────────────────────────────────────────────────────────
  if (process.env.WATCH_REGISTER_API_KEY) {
    try {
      const response = await fetch("https://api.thewatchregister.com/v1/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": process.env.WATCH_REGISTER_API_KEY,
        },
        body: JSON.stringify({ serial: normalizedSerial, brand }),
        signal: AbortSignal.timeout(8000), // 8 second timeout
      });

      if (!response.ok) {
        // API error — fail open (allow approval) but log the issue
        console.error(`[WatchRegister] API returned ${response.status}. Failing open.`);
        return { clean: true, flagged: false, reason: null, source: "api_error_fail_open" };
      }

      const data = await response.json();

      // The Watch Register API response schema: { status: "clean"|"flagged", reason: string }
      if (data.status === "flagged") {
        await _logStolenCheck(normalizedSerial, brand, true, data.reason, "live_api");
        return { clean: false, flagged: true, reason: data.reason || "Flagged by The Watch Register", source: "live_api" };
      }

      await _logStolenCheck(normalizedSerial, brand, false, null, "live_api");
      return { clean: true, flagged: false, reason: null, source: "live_api" };

    } catch (err) {
      // Network timeout or error — fail open
      console.error("[WatchRegister] Live API call failed, failing open:", err.message);
      return { clean: true, flagged: false, reason: null, source: "api_timeout_fail_open" };
    }
  }

  // ── MOCK / OFFLINE PATH ────────────────────────────────────────────────────
  const hit = LOCAL_STOLEN_BLACKLIST.find(
    (entry) => entry.serial.toUpperCase() === normalizedSerial
  );

  if (hit) {
    await _logStolenCheck(normalizedSerial, brand, true, hit.reason, "mock_blacklist");
    return { clean: false, flagged: true, reason: hit.reason, source: "mock_blacklist" };
  }

  await _logStolenCheck(normalizedSerial, brand, false, null, "mock_blacklist");
  return { clean: true, flagged: false, reason: null, source: "mock_blacklist" };
}

// ─── Audit Logger ─────────────────────────────────────────────────────────────
async function _logStolenCheck(serial, brand, flagged, reason, source) {
  try {
    await pool.query(
      `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, details, ip_address)
       VALUES (NULL, 'serial_check', 'product', NULL, $1::jsonb, '0.0.0.0')`,
      [JSON.stringify({ serial, brand, flagged, reason, source, checked_at: new Date().toISOString() })]
    );
  } catch (err) {
    // Non-fatal — don't crash the approval flow if audit log fails
    console.error("[WatchRegister] Audit log failed:", err.message);
  }
}

module.exports = { checkSerial };
