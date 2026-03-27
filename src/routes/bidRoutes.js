const express = require("express");
const router = express.Router();

const bidController = require("../controllers/bidController");

router.post("/place", bidController.placeBid);
router.get("/user/:user_id", bidController.getUserBids);
router.get("/:product_id", bidController.getBids);

module.exports = router;