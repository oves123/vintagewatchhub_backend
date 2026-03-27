const multer = require("multer");
const path = require("path");
const fs = require("fs");

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
    fileSize: 50 * 1024 * 1024, // 50MB limit
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

module.exports = upload;