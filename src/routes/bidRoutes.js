const express = require("express");
const router = express.Router();
const bidController = require("../controllers/bidController");

router.post("/place", bidController.placeBid);
router.get("/history/:productId", bidController.getBidHistory);

module.exports = router;