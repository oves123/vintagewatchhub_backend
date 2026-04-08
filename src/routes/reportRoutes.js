const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/authMiddleware');

// Submit a report against a seller/product
router.post('/', authMiddleware, reportController.createReport);

// Note: Admin GET and PATCH routes are handled in adminRoutes.js

module.exports = router;
