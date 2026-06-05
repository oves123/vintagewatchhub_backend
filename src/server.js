require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

// Validate required environment variables at boot
const requiredEnv = ['DATABASE_URL', 'JWT_SECRET'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const bidRoutes = require("./routes/bidRoutes");
const orderRoutes = require("./routes/orderRoutes");
const watchlistRoutes = require("./routes/watchlistRoutes");
const adminRoutes = require("./routes/adminRoutes");
const userRoutes = require("./routes/userRoutes");
const offerRoutes = require("./routes/offerRoutes");
const chatRoutes = require("./routes/chatRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const reportRoutes = require("./routes/reportRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const labelRoutes = require("./routes/labelRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const featureRoutes = require("./routes/featureRoutes");
const imageRoutes = require("./routes/imageRoutes");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "*",
        methods: ["GET", "POST"]
    },
    pingInterval: 25000,
    pingTimeout: 20000,
});

app.use(helmet());
const corsOrigin = process.env.FRONTEND_URL;
if (!corsOrigin && process.env.NODE_ENV === 'production') {
  console.error("FATAL: FRONTEND_URL is required in production!");
  process.exit(1);
} else if (!corsOrigin) {
  console.warn("WARNING: FRONTEND_URL not set — using default http://localhost:3000");
}
app.use(cors({ origin: corsOrigin || "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use("/uploads/resize", imageRoutes);
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));
app.use("/uploads", express.static(path.join(__dirname, "..", "src", "uploads")));

const rateLimiter = require("./middleware/rateLimiter");
app.use("/api", rateLimiter.rateLimiter);

// Visitor Logging Middleware — only log individual product page views, not every API call
const pool = require("./config/db");
const PRODUCT_DETAIL_REGEX = /^\/api\/products\/\d+$/;
app.use(async (req, res, next) => {
    if (req.method === 'GET' && PRODUCT_DETAIL_REGEX.test(req.path)) {
        try {
            await pool.query(
                "INSERT INTO visitor_logs (ip_address, user_agent) VALUES ($1, $2)",
                [req.ip || req.connection.remoteAddress, req.get('User-Agent')]
            );
        } catch (err) {
            // Non-critical — never block a request due to logging failure
            console.error("Visitor logging error:", err.message);
        }
    }
    next();
});

// Expose io to routes
app.set("io", io);
global.io = io;

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/bids", bidRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/user", userRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/labels", labelRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/features", featureRoutes);
app.use("/api", chatRoutes);

// 404 handler
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: "API Route not found" });
    }
    next();
});

// 500 error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Internal server error", message: err.message });
});

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("joinAuction", (productId) => {
        socket.join(`auction_${productId}`);
    });

    socket.on("joinChat", (chatId) => {
        socket.join(`chat_${chatId}`);
    });

    socket.on("joinUser", (userId) => {
        socket.join(`user_${userId}`);
    });

    // Online Status Tracking
    socket.on("registerUser", (userId) => {
        if (!userId) return;
        socket.userId = userId;
        if (!global.connectedUsers) global.connectedUsers = new Map();
        if (!global.connectedUsers.has(userId)) {
            global.connectedUsers.set(userId, new Set());
        }
        global.connectedUsers.get(userId).add(socket.id);
        io.emit("userStatus", { userId, status: "online" });
    });

    socket.on("checkStatus", (userId) => {
        const isOnline = global.connectedUsers && global.connectedUsers.has(userId);
        socket.emit("userStatus", { userId, status: isOnline ? "online" : "offline" });
    });

    // ===== MESSAGING RELIABILITY =====

    // Typing indicator
    socket.on("typing", async ({ chatId, userId }) => {
        socket.to(`chat_${chatId}`).emit("userTyping", { chatId, userId });
        try {
            await pool.query(
                "INSERT INTO typing_indicators (chat_id, user_id, started_at) VALUES ($1, $2, NOW()) ON CONFLICT (chat_id, user_id) DO UPDATE SET started_at = NOW()",
                [chatId, userId]
            );
        } catch (e) { /* ignore */ }
    });

    socket.on("stopTyping", async ({ chatId, userId }) => {
        socket.to(`chat_${chatId}`).emit("userStoppedTyping", { chatId, userId });
        try {
            await pool.query("DELETE FROM typing_indicators WHERE chat_id = $1 AND user_id = $2", [chatId, userId]);
        } catch (e) { /* ignore */ }
    });

    // Message delivery receipt
    socket.on("messageDelivered", async ({ messageId, chatId }) => {
        try {
            await pool.query("UPDATE messages SET delivered_at = NOW() WHERE id = $1 AND delivered_at IS NULL", [messageId]);
        } catch (e) { /* ignore */ }
        socket.to(`chat_${chatId}`).emit("messageStatus", { messageId, status: "delivered" });
    });

    // Message read receipt
    socket.on("messageRead", async ({ messageId, chatId }) => {
        try {
            await pool.query("UPDATE messages SET read_at = NOW() WHERE id = $1 AND read_at IS NULL", [messageId]);
        } catch (e) { /* ignore */ }
        socket.to(`chat_${chatId}`).emit("messageStatus", { messageId, status: "read" });
    });

    // Mark all messages as read for a chat
    socket.on("markChatRead", async ({ chatId, userId }) => {
        try {
            await pool.query(
                "UPDATE messages SET read_at = NOW() WHERE chat_id = $1 AND sender_id != $2 AND read_at IS NULL",
                [chatId, userId]
            );
        } catch (e) { /* ignore */ }
    });

    // Handle reconnection — rejoin rooms
    socket.on("rejoinRooms", ({ userId, chatIds }) => {
        if (!userId) return;
        socket.userId = userId;
        if (!global.connectedUsers) global.connectedUsers = new Map();
        if (!global.connectedUsers.has(userId)) {
            global.connectedUsers.set(userId, new Set());
        }
        global.connectedUsers.get(userId).add(socket.id);
        io.emit("userStatus", { userId, status: "online" });
        if (Array.isArray(chatIds)) {
            chatIds.forEach(chatId => socket.join(`chat_${chatId}`));
        }
    });

    socket.on("disconnect", () => {
        if (socket.userId && global.connectedUsers && global.connectedUsers.has(socket.userId)) {
            const sockets = global.connectedUsers.get(socket.userId);
            sockets.delete(socket.id);
            if (sockets.size === 0) {
                global.connectedUsers.delete(socket.userId);
                io.emit("userStatus", { userId: socket.userId, status: "offline" });
            }
        }
    });

});

const cronService = require("./services/cronService");

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Database health check passed");
  } catch (err) {
    console.error("FATAL: Database health check failed:", err.message);
    process.exit(1);
  }
})();

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    cronService.init();
});

