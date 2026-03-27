const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware"); // Assuming authMiddleware is defined and imported

const orderController = require("../controllers/orderController");

router.post("/auction-order", authMiddleware, orderController.createAuctionWinnerOrder);
router.post("/create", authMiddleware, orderController.createOrder);

router.get("/buyer/:user_id", authMiddleware, orderController.getBuyerOrders);
router.get("/seller/:seller_id", authMiddleware, orderController.getSellerOrders);
router.get("/user-deals/:user_id", authMiddleware, orderController.getUserDeals);

router.patch("/:id/shipped", authMiddleware, orderController.markShipped);
router.patch("/:id/delivered", authMiddleware, orderController.markDelivered); // Seller manually marks
router.patch("/:id/confirm-received", authMiddleware, orderController.confirmReceived); // Buyer manually marks
router.patch("/:id/confirm-sale", authMiddleware, orderController.confirmSale); // Final confirmation
router.patch("/:id/cancel", authMiddleware, orderController.cancelDeal);
router.patch("/:id/dispute", authMiddleware, orderController.disputeDeal);
router.patch("/:id/returned", authMiddleware, orderController.markReturned);

module.exports = router;