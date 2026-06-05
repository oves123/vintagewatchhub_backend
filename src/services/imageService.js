const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const SIZES = {
  placeholder: { width: 16, quality: 10 },
  thumb: { width: 200, quality: 80 },
  sm: { width: 400, quality: 85 },
  md: { width: 800, quality: 90 },
  lg: { width: 1200, quality: 90 },
};

const VARIANT_SUFFIXES = Object.keys(SIZES).reduce((acc, key) => {
  acc[key] = `__${key}.webp`;
  return acc;
}, {});

function isImageFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"].includes(ext);
}

async function getMetadata(filePath) {
  try {
    const { width, height, format } = await sharp(filePath).metadata();
    return { width, height, format };
  } catch {
    return null;
  }
}

async function processImage(filePath) {
  if (!isImageFile(filePath)) return null;

  const meta = await getMetadata(filePath);
  if (!meta) return null;

  const ext = path.extname(filePath);
  const base = filePath.slice(0, -ext.length);
  const variants = {};

  for (const [size, opts] of Object.entries(SIZES)) {
    const outputPath = `${base}${VARIANT_SUFFIXES[size]}`;
    try {
      await sharp(filePath)
        .resize(opts.width, undefined, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: opts.quality })
        .toFile(outputPath);
      variants[size] = path.basename(outputPath);
    } catch (err) {
      console.error(`Failed to generate ${size} variant for ${filePath}:`, err.message);
    }
  }

  let placeholderBase64 = null;
  try {
    const placeholderBuf = await sharp(filePath)
      .resize(16, undefined, { fit: "inside" })
      .webp({ quality: 10 })
      .toBuffer();
    placeholderBase64 = `data:image/webp;base64,${placeholderBuf.toString("base64")}`;
  } catch (err) {
    console.error("Failed to generate placeholder:", err.message);
  }

  return {
    original: path.basename(filePath),
    originalWidth: meta.width,
    originalHeight: meta.height,
    originalFormat: meta.format,
    variants,
    placeholderBase64,
  };
}

function getVariantPath(originalPath, size) {
  const ext = path.extname(originalPath);
  const dir = path.dirname(originalPath);
  const base = path.basename(originalPath, ext);
  return path.join(dir, `${base}${VARIANT_SUFFIXES[size]}`);
}

function variantExists(originalPath, size) {
  const variantPath = getVariantPath(originalPath, size);
  return fs.existsSync(variantPath);
}

function getImageUrl(originalPath, size) {
  if (originalPath.startsWith("http")) {
    const sizeMap = { thumb: 200, sm: 400, md: 800, lg: 1200 };
    const w = sizeMap[size];
    if (w && originalPath.includes("cloudinary")) {
      return originalPath.replace("/upload/", `/upload/w_${w},f_webp,q_auto/`);
    }
    if (w) {
      return originalPath.replace("/upload/", `/upload/w_${w}/`);
    }
    return originalPath;
  }

  const baseUrl = process.env.API_URL?.replace(/\/api\/?$/, "") || "http://127.0.0.1:5000";

  if (size === "original" || !variantExists(originalPath, size)) {
    return `${baseUrl}/uploads/${path.basename(originalPath)}`;
  }

  const variantName = `${path.parse(originalPath).name}${VARIANT_SUFFIXES[size]}`;
  return `${baseUrl}/uploads/${variantName}`;
}

module.exports = {
  processImage,
  getMetadata,
  variantExists,
  getImageUrl,
  isImageFile,
  SIZES,
};
