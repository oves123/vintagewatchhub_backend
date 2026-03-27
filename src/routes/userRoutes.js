const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");

// Profile Routes
router.get("/profile/:id", userController.getUserProfile);
router.put("/profile/:id", userController.updateUserProfile);
router.get("/activity/:id", userController.getUserActivity);

// Watch Vault Routes
router.get("/vault/:user_id", userController.getWatchVault);
router.post("/vault/add", userController.addToVault);

module.exports = router;
