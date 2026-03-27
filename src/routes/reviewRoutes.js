const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const authMiddleware = require("../middleware/authMiddleware");

// Create a review
router.post("/", authMiddleware, reviewController.createReview);

// Get seller reviews
router.get("/seller/:sellerId", reviewController.getSellerReviews);

// Get reviews left by a user
router.get("/user/:userId", reviewController.getUserReviews);

module.exports = router;
