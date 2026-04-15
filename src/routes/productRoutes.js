const express = require("express");
const router = express.Router();

const productController = require("../controllers/productController");
const cloudUpload = require("../middleware/cloudUpload");

router.post(
 "/create",
 cloudUpload.array("images", 10),
 productController.createProduct
);

router.put(
 "/update/:id",
 cloudUpload.array("images", 10),
 productController.updateProduct
);

router.delete("/delete/:id", productController.deleteProduct);
router.get("/my-listings/:userId", productController.getMyListings);
router.patch("/status/:id", productController.updateProductStatus);
router.get("/", productController.getProducts);
router.get("/categories", productController.getCategories);
router.get("/brands", productController.getBrands);
router.get("/:id", productController.getProductById);

module.exports = router;