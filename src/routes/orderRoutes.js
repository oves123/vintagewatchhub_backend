const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware"); // Assuming authMiddleware is defined and imported

const orderController = require("../controllers/orderController");
const cloudUpload = require("../middleware/cloudUpload");

router.post("/auction-order", authMiddleware, orderController.createAuctionWinnerOrder);
router.post("/create", authMiddleware, orderController.createOrder);
router.post("/buy-now", authMiddleware, orderController.buyNowDirect);

router.get("/buyer/:user_id", authMiddleware, orderController.getBuyerOrders);
// getSellerOrders is deprecated — use /user-deals/:user_id instead
router.get("/user-deals/:user_id", authMiddleware, orderController.getUserDeals);
router.post("/:id/upload-evidence", authMiddleware, cloudUpload.array("evidence", 5), orderController.uploadEvidence);

router.patch("/:id/mark-paid", authMiddleware, cloudUpload.single("receipt"), orderController.markDealAsPaid);
router.patch("/:id/shipped", authMiddleware, cloudUpload.single("packing_video"), orderController.markShipped);
router.patch("/:id/delivered", authMiddleware, orderController.markDelivered); // Seller manually marks
router.patch("/:id/confirm-received", authMiddleware, orderController.confirmReceived); // Buyer manually marks
router.patch("/:id/quote-shipping", authMiddleware, orderController.addShippingQuote); // Seller quotes shipping
router.patch("/:id/confirm-sale", authMiddleware, cloudUpload.single("unboxing_video"), orderController.confirmSale); // Final confirmation
router.patch("/:id/cancel", authMiddleware, orderController.cancelDeal);
router.patch("/:id/dispute", authMiddleware, orderController.disputeDeal);
router.patch("/:id/returned", authMiddleware, orderController.markReturned);

module.exports = router;