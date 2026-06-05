const multer = require("multer");
const path = require("path");
const fs = require("fs");
const imageService = require("../services/imageService");

const logToFile = (msg) => {
  fs.appendFileSync(path.join(__dirname, "../../multer_debug.log"), `${new Date().toISOString()} - ${msg}\n`);
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
   cb(null, "src/uploads/");
  },
  filename: function (req, file, cb) {
   cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 20
  },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp|gif|mp4|mov|webm|quicktime|avi|mkv|heic|heif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype || extname) {
      return cb(null, true);
    } else {
      logToFile(`Rejected file: ${file.originalname}, Mimetype: ${file.mimetype}`);
      cb(new Error("Error: Images and Videos only!"));
    }
  }
});

async function processUploadedFiles(req, res, next) {
  if (!req.files || req.files.length === 0) return next();

  const results = [];
  for (const file of req.files) {
    const fullPath = path.resolve("src/uploads", file.filename);
    try {
      const meta = await imageService.processImage(fullPath);
      results.push(meta || { original: file.filename, variants: {} });
    } catch (err) {
      console.error("Image processing error:", err);
      results.push({ original: file.filename, variants: {} });
    }
  }

  req.imageMeta = results;
  next();
}

upload.processImages = processUploadedFiles;

module.exports = upload;