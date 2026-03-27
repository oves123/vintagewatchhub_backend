const express = require("express");
const router = express.Router();
const offerController = require("../controllers/offerController");

router.post("/create", offerController.createOffer);
router.put("/:id/respond", offerController.respondToOffer);
router.get("/product/:product_id", offerController.getOffersForProduct);
router.get("/user/:user_id", offerController.getUserOffers);

module.exports = router;
