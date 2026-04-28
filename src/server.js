require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

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

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors({
    origin: process.env.FRONTEND_URL || "*",
    credentials: true
}));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Visitor Logging Middleware
const pool = require("./config/db");
app.use(async (req, res, next) => {
    // Only log page hits, not static files or busy API endpoints if needed
    // But for now, let's log everything to get an idea of traffic
    if (req.method === 'GET' && !req.path.includes('.') && !req.path.includes('admin/stats')) {
        try {
            await pool.query(
                "INSERT INTO visitor_logs (ip_address, user_agent) VALUES ($1, $2)",
                [req.ip || req.connection.remoteAddress, req.get('User-Agent')]
            );
        } catch (err) {
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
        console.log(`User joined auction room: auction_${productId}`);
    });

    socket.on("joinChat", (chatId) => {
        socket.join(`chat_${chatId}`);
        console.log(`User joined chat room: chat_${chatId}`);
    });

    socket.on("joinUser", (userId) => {
        socket.join(`user_${userId}`);
        console.log(`User joined private room: user_${userId}`);
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
        
        // Notify others that this user is online
        io.emit("userStatus", { userId, status: "online" });
        console.log(`User ${userId} is online`);
    });

    socket.on("checkStatus", (userId) => {
        const isOnline = global.connectedUsers && global.connectedUsers.has(userId);
        socket.emit("userStatus", { userId, status: isOnline ? "online" : "offline" });
    });

    socket.on("disconnect", () => {
        if (socket.userId && global.connectedUsers && global.connectedUsers.has(socket.userId)) {
            const sockets = global.connectedUsers.get(socket.userId);
            sockets.delete(socket.id);
            if (sockets.size === 0) {
                global.connectedUsers.delete(socket.userId);
                io.emit("userStatus", { userId: socket.userId, status: "offline" });
                console.log(`User ${socket.userId} is offline`);
            }
        }
        console.log("User disconnected:", socket.id);
    });

});

const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});