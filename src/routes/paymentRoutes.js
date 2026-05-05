const express = require("express");
const router = express.Router();
const razorpayController = require("../controllers/razorpayController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/create-order", authMiddleware, razorpayController.createRazorpayOrder);
router.post("/verify", authMiddleware, razorpayController.verifyRazorpayPayment);

module.exports = router;
