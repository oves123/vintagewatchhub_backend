const express = require("express");
const router = express.Router();

const productController = require("../controllers/productController");
const cloudUpload = require("../middleware/cloudUpload");

const authMiddleware = require("../middleware/authMiddleware");

router.post(
 "/create",
 authMiddleware,
 cloudUpload.array("images", 35),
 productController.createProduct
);

router.put(
 "/update/:id",
 authMiddleware,
 cloudUpload.array("images", 35),
 productController.updateProduct
);

router.delete("/delete/:id", authMiddleware, productController.deleteProduct);
router.get("/my-listings/:userId", authMiddleware, productController.getMyListings);
router.patch("/status/:id", authMiddleware, productController.updateProductStatus);
router.get("/", productController.getProducts);
router.get("/categories", productController.getCategories);
router.get("/brands", productController.getBrands);
router.get("/filter-counts", productController.getFilterCounts);
router.get("/seller/:sellerId", productController.getSellerListings);
router.get("/:id", productController.getProductById);
router.get("/:id/view", productController.recordProductView);

module.exports = router;