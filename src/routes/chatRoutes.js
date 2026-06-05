const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");

const cloudUpload = require("../middleware/cloudUpload");

const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

router.post("/chat/init", chatController.createOrGetChat);
router.get("/chat/user/:userId", chatController.getUserChats);
router.get("/chat/messages/:chatId", chatController.getChatMessages);
router.post("/chat/message", chatController.sendMessage);
router.post("/chat/upload", cloudUpload.single("image"), chatController.uploadChatImage);
router.patch("/chat/:chatId/read", chatController.markMessagesAsRead);
router.get("/chat/unread/count/:userId", chatController.getTotalUnreadCount);
router.patch("/chat/message/:messageId", chatController.updateMessage);
router.post("/chat/confirm-direct-deal", chatController.confirmDirectDeal);
router.post("/chat/:chatId/admin-join", chatController.joinDisputeChat);

module.exports = router;
