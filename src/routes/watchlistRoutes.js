const express = require("express");
const router = express.Router();
const watchlistController = require("../controllers/watchlistController");
const wishlistFolderController = require("../controllers/wishlistFolderController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

router.post("/add", watchlistController.addToWatchlist);
router.post("/remove", watchlistController.removeFromWatchlist);

router.post("/folders", wishlistFolderController.createFolder);
router.get("/folders/:user_id", wishlistFolderController.getFolders);
router.put("/folders/:id", wishlistFolderController.renameFolder);
router.delete("/folders/:id", wishlistFolderController.deleteFolder);

router.get("/:user_id", watchlistController.getWatchlist);

module.exports = router;
