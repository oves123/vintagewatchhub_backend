const Tesseract = require('tesseract.js');

/**
 * Safety Service to prevent platform bypass (Disintermediation)
 */
class SafetyService {
  constructor() {
    this.phoneRegex = /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s-]?)?\d{3}[\s-]?\d{4}/;
    this.emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    this.spacedPhoneRegex = /(\d\s*){10,12}/;
    this.upiRegex = /[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/i;
    this.pinCodeRegex = /\b\d{6}\b/; // Indian PIN code
    this.socialKeywords = /\b(whatsapp|insta|telegram|t\.me|wa\.me|instagram|facebook|fb\.com|gpay|phonepe|paytm|dm me|text me|call me)\b/i;
    this.addressKeywords = /\b(sector|floor|flat|street|pincode|pin code|landmark|near by|opposite|behind|bldg|building|apartment|apt|wing|road|lane|house|h\.no|st\.|ave\.|house no|address|location|meet up|pickup|pick up)\b/i;
    this.cityKeywords = /\b(mumbai|delhi|bangalore|hyderabad|ahmedabad|chennai|kolkata|surat|pune|jaipur|lucknow|kanpur|nagpur|indore|thane|bhopal|visakhapatnam|pimpri-chinchwad|patna|vadodara)\b/i;
    this.numberWordsRegex = /\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/i;

    // Whitelist for legitimate platform data
    this.trackingWhitelist = /\b(AWB|TRACKING|ID|UPS|DHL|FEDEX|DTDC|DELHIVERY|BLUE DART|1Z|RR|CP)\b/i;
  }

  /**
   * Scans text for potential contact information
   * @param {string} text 
   * @returns {boolean} true if unsafe
   */
  isUnsafeText(text) {
    if (!text) return false;
    
    const cleanText = text.toLowerCase();
    let score = 0;

    // 1. Check Whitelist first
    if (this.trackingWhitelist.test(cleanText)) {
      return false; 
    }

    // 2. Direct PII Blocks (Instant block)
    if (this.phoneRegex.test(text) || this.emailRegex.test(text) || this.upiRegex.test(text) || this.pinCodeRegex.test(text)) {
      console.log("[SafetyService] Instant block: Phone/Email/UPI/PIN detected");
      return true;
    }

    // 3. Social Keywords (Instant block)
    if (this.socialKeywords.test(cleanText)) {
      console.log("[SafetyService] Instant block: Social keyword detected");
      return true;
    }

    // 4. Address Scoring (Fuzzy detection)
    // Count address-related keywords
    const matches = cleanText.match(new RegExp(this.addressKeywords.source, 'gi')) || [];
    const cityMatches = cleanText.match(new RegExp(this.cityKeywords.source, 'gi')) || [];
    const digitCount = (text.match(/\d/g) || []).length;

    score += matches.length * 2;
    score += cityMatches.length * 3;
    if (digitCount >= 4) score += 3; // Addresses usually have house/flat/pin numbers

    // If text mentions a building/wing/flat AND a city, or multiple address keywords
    if (score >= 5) {
      console.log(`[SafetyService] Address Block: Score ${score} detected in: ${text}`);
      return true;
    }

    // 5. Check for 10 digits spread out (Phone number bypass)
    const digitsOnly = text.replace(/\D/g, '');
    if (digitsOnly.length >= 10 && !this.trackingWhitelist.test(text)) {
      return true;
    }

    return false;
  }

  /**
   * Scans an image for text and checks for safety
   * @param {string} imagePath 
   * @returns {Promise<Object>} { safe: boolean, detectedText: string }
   */
  async isUnsafeImage(imagePath) {
    try {
      console.log(`[SafetyService] Scanning image: ${imagePath}`);
      const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
      
      const unsafe = this.isUnsafeText(text);
      if (unsafe) {
        console.warn(`[SafetyService] Unsafe content detected in image OCR: ${text.substring(0, 100)}...`);
      }
      
      return { 
        safe: !unsafe, 
        detectedText: text 
      };
    } catch (error) {
      console.error("[SafetyService] OCR Error:", error.message);
      // If OCR fails, we default to safe but log the error
      return { safe: true, error: error.message };
    }
  }
}

module.exports = new SafetyService();
