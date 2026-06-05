const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const priceAlertController = require("../controllers/priceAlertController");
const disputeController = require("../controllers/disputeController");
const couponController = require("../controllers/couponController");
const sellerVerificationController = require("../controllers/sellerVerificationController");
const featuredProductController = require("../controllers/featuredProductController");
const bulkListingController = require("../controllers/bulkListingController");
const payoutBatchController = require("../controllers/payoutBatchController");

// Price Drop Alerts
router.post("/price-alerts", authMiddleware, priceAlertController.createAlert);
router.get("/price-alerts/:user_id", authMiddleware, priceAlertController.getAlerts);
router.delete("/price-alerts/:id", authMiddleware, priceAlertController.deleteAlert);
router.patch("/price-alerts/:id/toggle", authMiddleware, priceAlertController.toggleAlert);

// Disputes
router.post("/disputes", authMiddleware, disputeController.createDispute);
router.get("/disputes/deal/:deal_id", authMiddleware, disputeController.getDisputeByDeal);
router.get("/disputes/:id", authMiddleware, disputeController.getDisputeById);
router.post("/disputes/:id/evidence", authMiddleware, disputeController.addEvidence);
router.get("/admin/disputes", adminMiddleware, disputeController.listDisputes);
router.patch("/admin/disputes/:id/resolve", adminMiddleware, disputeController.resolveDispute);

// Coupons (admin)
router.post("/admin/coupons", adminMiddleware, couponController.createCoupon);
router.get("/admin/coupons", adminMiddleware, couponController.listCoupons);
router.patch("/admin/coupons/:id", adminMiddleware, couponController.updateCoupon);
router.delete("/admin/coupons/:id", adminMiddleware, couponController.deleteCoupon);

// Coupon validation (user-facing)
router.post("/coupons/validate", authMiddleware, couponController.validateCoupon);
router.post("/coupons/apply", authMiddleware, couponController.applyCouponToDeal);

// Seller Verification
router.post("/verification", authMiddleware, sellerVerificationController.submitDocument);
router.get("/verification/:user_id", authMiddleware, sellerVerificationController.getVerificationStatus);
router.get("/admin/verifications", adminMiddleware, sellerVerificationController.listAllVerifications);
router.patch("/admin/verifications/:id/review", adminMiddleware, sellerVerificationController.reviewDocument);

// Featured Products
router.get("/products/featured", featuredProductController.getFeaturedProducts);
router.patch("/admin/products/:id/feature", adminMiddleware, featuredProductController.toggleFeatured);
router.post("/admin/products/:id/feature", adminMiddleware, featuredProductController.setFeatured);

// Bulk Listing
router.post("/products/bulk-create", authMiddleware, bulkListingController.bulkCreateProducts);

// Payout Batch Processing
router.post("/admin/payouts/batch-release", adminMiddleware, payoutBatchController.batchRelease);
router.get("/admin/payouts/pending", adminMiddleware, payoutBatchController.getPendingPayouts);

module.exports = router;
