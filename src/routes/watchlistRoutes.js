const express = require("express");
const router = express.Router();
const watchlistController = require("../controllers/watchlistController");

router.post("/add", watchlistController.addToWatchlist);
router.post("/remove", watchlistController.removeFromWatchlist);
router.get("/:user_id", watchlistController.getWatchlist);

module.exports = router;
