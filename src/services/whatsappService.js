const twilio = require('twilio');

let client;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

exports.sendWhatsApp = async ({ to, body }) => {
  if (!client || !process.env.TWILIO_WHATSAPP_NUMBER) {
    console.warn("⚠️ WhatsApp not sent: Twilio credentials not configured in .env");
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
      from: process.env.TWILIO_WHATSAPP_NUMBER, // e.g., 'whatsapp:+14155238886'
      to: `whatsapp:${formattedTo}`
    });
    console.log("✅ WhatsApp sent: %s", message.sid);
    return true;
  } catch (error) {
    console.error("❌ Error sending WhatsApp:", error.message);
    return false;
  }
};
