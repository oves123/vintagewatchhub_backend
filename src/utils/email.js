const nodemailer = require("nodemailer");

const sendEmail = async (options) => {
  // 1. Create a transporter
  let transporter;

  // Check if we have valid SMTP credentials
  const hasSMTP = process.env.EMAIL_HOST && 
                  process.env.EMAIL_USER && 
                  process.env.EMAIL_PASS && 
                  process.env.EMAIL_USER !== 'your-email@gmail.com';

  if (hasSMTP) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  } else {
    // FALLBACK for Local/Development
    console.log("------------------------------------------");
    console.log("EMAILING FALLBACK (No SMTP Configured)");
    console.log(`To: ${options.email}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Message: ${options.message}`);
    console.log("------------------------------------------");
    
    // Use Ethereal for a real preview link in development if you want
    // For now, we just return to avoid crashing
    return { message: "Email logged to console (Dev Mode)" };
  }

  // 2. Define email options
  const mailOptions = {
    from: `WatchCollectorHub <${process.env.EMAIL_FROM || 'support@watchcollectorhub.com'}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html,
  };

  // 3. Send the email
  return await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
