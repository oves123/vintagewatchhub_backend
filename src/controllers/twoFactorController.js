/**
 * Two-Factor Authentication Controller (Admin 2FA)
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses TOTP (Time-Based One-Time Passwords) compatible with:
 *   - Google Authenticator
 *   - Authy
 *   - Microsoft Authenticator
 *
 * Flow:
 *   1. Admin calls POST /auth/2fa/setup → receives a QR code image (base64)
 *   2. Admin scans QR code with their Authenticator app
 *   3. Admin confirms setup with POST /auth/2fa/verify-setup (sends the first 6-digit code)
 *   4. 2FA is now ENABLED on their account
 *   5. On subsequent logins, the login endpoint returns { requires_2fa: true, temp_token }
 *   6. Admin sends their 6-digit code to POST /auth/2fa/validate to get the real JWT
 * ─────────────────────────────────────────────────────────────────────────────
 */

const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

// ─── Step 1: Generate a secret and return a QR code ─────────────────────────
exports.setup2FA = async (req, res) => {
  try {
    const userId = req.user.id;

    // Only admins can set up 2FA
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "2FA setup is only available for admin accounts." });
    }

    // Generate a new TOTP secret
    const secret = speakeasy.generateSecret({
      name: `Aera Admin (${req.user.email || "Admin"})`,
      issuer: "Aera Marketplace",
      length: 32,
    });

    // Temporarily store the secret (unconfirmed) in the DB
    await pool.query(
      "UPDATE users SET two_fa_secret = $1, two_fa_enabled = false WHERE id = $2",
      [secret.base32, userId]
    );

    // Generate QR code as a base64 PNG data URL
    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      message: "Scan this QR code with Google Authenticator or Authy, then call /auth/2fa/verify-setup to confirm.",
      qr_code: qrCodeDataUrl,           // base64 PNG — display directly in an <img> tag
      manual_entry_key: secret.base32,  // Fallback for manual entry
    });

  } catch (error) {
    console.error("[2FA Setup Error]", error);
    res.status(500).json({ error: error.message });
  }
};

// ─── Step 2: Verify setup by confirming the first code ────────────────────
exports.verifySetup2FA = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Please provide the 6-digit code from your Authenticator app." });
    }

    const userResult = await pool.query("SELECT two_fa_secret FROM users WHERE id = $1", [userId]);
    if (userResult.rows.length === 0) return res.status(404).json({ message: "User not found" });

    const secret = userResult.rows[0].two_fa_secret;
    if (!secret) {
      return res.status(400).json({ message: "No 2FA setup in progress. Please call /auth/2fa/setup first." });
    }

    const isValid = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token: token.toString().replace(/\s/g, ""),
      window: 2, // Allow 1 step before/after for clock drift
    });

    if (!isValid) {
      return res.status(400).json({ message: "Invalid code. Please try again — make sure your device clock is accurate." });
    }

    // Confirm 2FA is now active
    await pool.query("UPDATE users SET two_fa_enabled = true WHERE id = $1", [userId]);

    res.json({
      message: "✅ Two-Factor Authentication is now ENABLED on your admin account. You will need your Authenticator app on every login.",
      two_fa_enabled: true,
    });

  } catch (error) {
    console.error("[2FA Verify Setup Error]", error);
    res.status(500).json({ error: error.message });
  }
};

// ─── Step 3: Validate 2FA code during login (exchanges temp_token for full JWT) ──
exports.validate2FA = async (req, res) => {
  try {
    const { temp_token, totp_code } = req.body;

    if (!temp_token || !totp_code) {
      return res.status(400).json({ message: "temp_token and totp_code are required." });
    }

    // Verify the temp_token (short-lived, 5 minutes)
    let payload;
    try {
      payload = jwt.verify(temp_token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Session expired. Please log in again." });
    }

    if (!payload.requires_2fa) {
      return res.status(400).json({ message: "This token does not require 2FA validation." });
    }

    // Fetch user's 2FA secret
    const userResult = await pool.query(
      "SELECT id, name, email, role, two_fa_secret, two_fa_enabled, seller_type, state, terms_accepted FROM users WHERE id = $1",
      [payload.id]
    );
    if (userResult.rows.length === 0) return res.status(404).json({ message: "User not found" });

    const user = userResult.rows[0];

    if (!user.two_fa_enabled || !user.two_fa_secret) {
      return res.status(400).json({ message: "2FA is not configured for this account." });
    }

    const isValid = speakeasy.totp.verify({
      secret: user.two_fa_secret,
      encoding: "base32",
      token: totp_code.toString().replace(/\s/g, ""),
      window: 2,
    });

    if (!isValid) {
      return res.status(401).json({ message: "Invalid authenticator code. Please try again." });
    }

    // Issue the real, full-access JWT
    const fullToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({
      message: "Login successful",
      token: fullToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        seller_type: user.seller_type,
        state: user.state,
        terms_accepted: user.terms_accepted,
      },
    });

  } catch (error) {
    console.error("[2FA Validate Error]", error);
    res.status(500).json({ error: error.message });
  }
};

// ─── Step 4 (Optional): Disable 2FA ──────────────────────────────────────────
exports.disable2FA = async (req, res) => {
  try {
    const userId = req.user.id;
    const { totp_code } = req.body;

    const userResult = await pool.query("SELECT two_fa_secret, two_fa_enabled FROM users WHERE id = $1", [userId]);
    const user = userResult.rows[0];

    if (!user?.two_fa_enabled) {
      return res.status(400).json({ message: "2FA is not currently enabled." });
    }

    // Must confirm with a valid code to disable (prevents malicious disabling)
    const isValid = speakeasy.totp.verify({
      secret: user.two_fa_secret,
      encoding: "base32",
      token: totp_code.toString().replace(/\s/g, ""),
      window: 2,
    });

    if (!isValid) {
      return res.status(401).json({ message: "Invalid authenticator code. 2FA was NOT disabled." });
    }

    await pool.query("UPDATE users SET two_fa_enabled = false, two_fa_secret = NULL WHERE id = $1", [userId]);

    res.json({ message: "Two-Factor Authentication has been disabled.", two_fa_enabled: false });

  } catch (error) {
    console.error("[2FA Disable Error]", error);
    res.status(500).json({ error: error.message });
  }
};
