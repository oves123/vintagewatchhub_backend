const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const userController = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");

// Profile Routes
router.get("/profile/:id", authMiddleware, userController.getUserProfile);
router.put("/profile/:id", authMiddleware, userController.updateUserProfile);
router.get("/activity/:id", authMiddleware, userController.getUserActivity);
router.get("/reports/:id", authMiddleware, userController.getMyFinancialReports);
router.get("/ledger/:id", authMiddleware, userController.getMyFinancialLedger);

// T&C Acceptance
router.post("/accept-terms", authMiddleware, userController.acceptTerms);
router.get("/terms", adminController.getSettings); // Public access to terms via settings

// Watch Vault Routes
router.get("/vault/:user_id", authMiddleware, userController.getWatchVault);
router.post("/vault/add", authMiddleware, userController.addToVault);

module.exports = router;
