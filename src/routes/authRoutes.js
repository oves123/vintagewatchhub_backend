const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const twoFactorController = require("../controllers/twoFactorController");
const authMiddleware = require("../middleware/authMiddleware");
const rateLimit = require("express-rate-limit");
const { validate } = require("../middleware/validate");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { message: "Too many login attempts. Please wait 15 minutes and try again." },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { message: "Too many password reset requests. Please try again in 1 hour." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Standard Auth ───────────────────────────────────────────────────────────
router.post("/register", validate("register"), authController.register);
router.post("/login", authController.login);
router.post("/forgot-password", forgotPasswordLimiter, authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

// ─── Admin 2FA ────────────────────────────────────────────────────────────────
// Step 1: Generate QR code (admin must be already logged in)
router.post("/2fa/setup", authMiddleware, twoFactorController.setup2FA);
// Step 2: Confirm setup with first TOTP code
router.post("/2fa/verify-setup", authMiddleware, twoFactorController.verifySetup2FA);
// Step 3: Complete login — exchange temp_token + totp_code for a real JWT
router.post("/2fa/validate", twoFactorController.validate2FA);
// Optional: Disable 2FA (requires confirming with a valid code)
router.post("/2fa/disable", authMiddleware, twoFactorController.disable2FA);

module.exports = router;