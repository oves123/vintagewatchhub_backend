const express = require("express");
const router = express.Router();
const labelController = require("../controllers/labelController");

router.get("/ui-labels", labelController.getUiLabels);
router.get("/quick-replies", labelController.getQuickReplies);

module.exports = router;
