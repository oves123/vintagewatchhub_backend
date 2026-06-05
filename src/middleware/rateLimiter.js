const pool = require("../config/db");

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = {
  default: 60,
  auth: 10,
  bids: 20,
  offers: 20,
  orders: 30,
  messages: 30,
  search: 30,
};

const getLimit = (path) => {
  if (path.includes("/auth/")) return MAX_REQUESTS.auth;
  if (path.includes("/bids/")) return MAX_REQUESTS.bids;
  if (path.includes("/offers/")) return MAX_REQUESTS.offers;
  if (path.includes("/orders/")) return MAX_REQUESTS.orders;
  if (path.includes("/chat/") || path.includes("/messages")) return MAX_REQUESTS.messages;
  if (path.includes("/products") && (path.includes("search") || path.includes("?search"))) return MAX_REQUESTS.search;
  return MAX_REQUESTS.default;
};

exports.rateLimiter = (req, res, next) => {
  const identifier = req.ip || req.connection.remoteAddress || "unknown";
  const limit = getLimit(req.path);

  pool.query(
    `SELECT COUNT(*) as count FROM rate_limit_log
     WHERE identifier = $1 AND endpoint = $2 AND attempted_at > NOW() - INTERVAL '1 minute'`,
    [identifier, req.path]
  ).then(result => {
    const count = parseInt(result.rows[0].count);
    if (count >= limit) {
      return res.status(429).json({
        error: "Too many requests. Please slow down.",
        retryAfter: Math.ceil(WINDOW_MS / 1000)
      });
    }
    pool.query(
      "INSERT INTO rate_limit_log (identifier, endpoint) VALUES ($1, $2)",
      [identifier, req.path]
    ).catch(() => {});
    next();
  }).catch(() => next());
};
