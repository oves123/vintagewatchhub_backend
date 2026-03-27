const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");

const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ 
  storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

router.post("/chat/init", chatController.createOrGetChat);
router.get("/chat/user/:userId", chatController.getUserChats);
router.get("/chat/messages/:chatId", chatController.getChatMessages);
router.post("/chat/message", chatController.sendMessage);
router.post("/chat/upload", upload.single("image"), chatController.uploadChatImage);
router.patch("/chat/:chatId/read", chatController.markMessagesAsRead);
router.get("/chat/unread/count/:userId", chatController.getTotalUnreadCount);
router.patch("/chat/message/:messageId", chatController.updateMessage);
router.post("/chat/confirm-direct-deal", chatController.confirmDirectDeal);

module.exports = router;
