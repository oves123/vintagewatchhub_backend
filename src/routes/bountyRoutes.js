const express = require("express");
const router = express.Router();
const bountyController = require("../controllers/bountyController");
const authMiddleware = require("../middleware/authMiddleware");

// Get all active bounties (public, for matchmaking)
router.get("/", bountyController.getAllBounties);

// Get user's own bounties
router.get("/user", authMiddleware, bountyController.getUserBounties);

// Create a new bounty
router.post("/", authMiddleware, bountyController.createBounty);

// Find matches for a specific seller product
router.get("/match/:productId", authMiddleware, bountyController.findMatchesForProduct);

module.exports = router;
