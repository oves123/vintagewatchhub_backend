const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const userController = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");

// Profile Routes
router.get("/profile/:id", userController.getUserProfile);
router.put("/profile/:id", userController.updateUserProfile);
router.get("/activity/:id", userController.getUserActivity);

// T&C Acceptance
router.post("/accept-terms", authMiddleware, userController.acceptTerms);
router.get("/terms", adminController.getSettings); // Public access to terms via settings

// Watch Vault Routes
router.get("/vault/:user_id", userController.getWatchVault);
router.post("/vault/add", userController.addToVault);

module.exports = router;
