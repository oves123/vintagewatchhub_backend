const twilio = require('twilio');

let client;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

exports.sendSMS = async ({ to, body }) => {
  if (!client || !process.env.TWILIO_PHONE_NUMBER) {
    console.warn("⚠️ SMS not sent: Twilio credentials not configured in .env");
    return false;
  }

  // Ensure phone number starts with +91 (or other country code)
  let formattedTo = to;
  if (!formattedTo.startsWith('+')) {
    formattedTo = `+91${formattedTo.replace(/\D/g, '')}`; 
  }

  try {
    const message = await client.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedTo
    });
    console.log("✅ SMS sent: %s", message.sid);
    return true;
  } catch (error) {
    console.error("❌ Error sending SMS:", error.message);
    return false;
  }
};
