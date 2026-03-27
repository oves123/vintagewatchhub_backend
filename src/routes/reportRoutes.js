const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

// Submit a report against a seller/product
router.post('/', reportController.createReport);

// Note: Admin GET and PATCH routes are handled in adminRoutes.js

module.exports = router;
