const rateLimit = require('express-rate-limit');

const WINDOW_MS = 60 * 1000; // 1 minute

// Create specific limiters for different routes
const defaultLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 300,
  message: { error: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 100,
  message: { error: "Too many authentication requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

const bidOfferLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 100,
  message: { error: "Too many bids/offers placed. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

const orderLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 150,
  message: { error: "Too many order requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

const messagesLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 30,
  message: { error: "Too many messages sent. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

const searchLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 150,
  message: { error: "Too many search requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Dynamic router based on path
exports.rateLimiter = (req, res, next) => {
  const path = req.path;
  
  if (path.includes("/auth/")) return authLimiter(req, res, next);
  if (path.includes("/bids/") || path.includes("/offers/")) return bidOfferLimiter(req, res, next);
  if (path.includes("/orders/")) return orderLimiter(req, res, next);
  if (path.includes("/chat/") || path.includes("/messages")) return messagesLimiter(req, res, next);
  if (path.includes("/products") && (path.includes("search") || req.query.search)) return searchLimiter(req, res, next);
  
  return defaultLimiter(req, res, next);
};
