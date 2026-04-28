const express = require("express");
const router = express.Router();

const adminController = require("../controllers/adminController");
const adminMiddleware = require("../middleware/adminMiddleware");
const upload = require("../utils/upload");

router.get("/stats", adminMiddleware, adminController.getStats);
router.get("/users", adminMiddleware, adminController.getUsers);
router.delete("/users/:id", adminMiddleware, adminController.deleteUser);
router.get("/products", adminMiddleware, adminController.getProducts);
router.get("/users/:id", adminMiddleware, adminController.getUserDetail);
router.patch("/users/:id/status", adminMiddleware, adminController.toggleUserStatus);
router.patch("/products/:id", adminMiddleware, adminController.updateProductStatus);
router.delete("/products/:id", adminMiddleware, adminController.deleteProduct);
router.get("/analytics", adminMiddleware, adminController.getAnalytics);

// Logging and settings
router.get("/logs", adminMiddleware, adminController.getLogs);
router.get("/settings", adminMiddleware, adminController.getSettings);
router.patch("/settings", adminMiddleware, adminController.updateSetting);

// New routes
router.get("/orders", adminMiddleware, adminController.getOrders);
router.get("/chats", adminMiddleware, adminController.getChats);
router.get("/auctions", adminMiddleware, adminController.getAuctions);
router.post("/notify-seller", adminMiddleware, adminController.notifySeller);
router.post("/products/create", adminMiddleware, upload.array("images", 10), adminController.adminCreateProduct);

// Reports management
router.get("/reports", adminMiddleware, adminController.getReports);
router.patch("/reports/:id", adminMiddleware, adminController.resolveReport);

// Transaction & Chat Moderation
router.patch("/deals/:id/resolve", adminMiddleware, adminController.resolveDeal);
router.get("/chats/:id/messages", adminMiddleware, adminController.getChatHistory);

// Escrow & Financials
router.get("/escrow", adminMiddleware, adminController.getEscrowDeals);
router.patch("/deals/:id/release-payout", adminMiddleware, adminController.releasePayout);
router.get("/financials", adminMiddleware, adminController.getFinancials);

module.exports = router;