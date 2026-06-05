const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");

let sharp;
try { sharp = require("sharp"); } catch { sharp = null; }

const VALID_SIZES = ["thumb", "sm", "md", "lg", "placeholder"];
const SIZE_CONFIG = {
  placeholder: { width: 16, quality: 10 },
  thumb: { width: 200, quality: 80 },
  sm: { width: 400, quality: 85 },
  md: { width: 800, quality: 90 },
  lg: { width: 1200, quality: 90 },
};

const UPLOAD_DIRS = [
  path.resolve(__dirname, "../../uploads"),
  path.resolve(__dirname, "../../src/uploads"),
];

function findFile(filename) {
  for (const dir of UPLOAD_DIRS) {
    const fullPath = path.join(dir, filename);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

router.get("/:size/:filename", async (req, res) => {
  const { size, filename } = req.params;
  const safeName = path.basename(filename);

  const originalPath = findFile(safeName);
  if (!originalPath) {
    return res.status(404).send("File not found");
  }

  if (size === "original" || !VALID_SIZES.includes(size)) {
    return res.sendFile(originalPath);
  }

  const ext = path.extname(safeName);
  const base = safeName.slice(0, -ext.length);
  const variantName = `${base}__${size}.webp`;

  const existingVariant = findFile(variantName);
  if (existingVariant) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.sendFile(existingVariant);
  }

  if (!sharp) {
    return res.sendFile(originalPath);
  }

  const config = SIZE_CONFIG[size];
  const variantDir = path.dirname(originalPath);
  const variantPath = path.join(variantDir, variantName);

  try {
    await sharp(originalPath)
      .resize(config.width, undefined, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: config.quality })
      .toFile(variantPath);

    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Type", "image/webp");
    res.sendFile(variantPath);
  } catch (err) {
    console.error("Image resize error:", err);
    res.sendFile(originalPath);
  }
});

module.exports = router;
