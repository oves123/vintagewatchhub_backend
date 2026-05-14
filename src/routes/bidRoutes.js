const express = require("express");
const router = express.Router();
const bidController = require("../controllers/bidController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/place", authMiddleware, bidController.placeBid);
router.get("/history/:productId", bidController.getBidHistory);

module.exports = router;