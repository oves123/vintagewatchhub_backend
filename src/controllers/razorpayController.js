const Razorpay = require("razorpay");
const crypto = require("crypto");
const pool = require("../config/db");
const notificationService = require("../services/notificationService");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.createRazorpayOrder = async (req, res) => {
  try {
    const { deal_id } = req.body;

    // 1. Fetch deal details
    const dealRes = await pool.query(
      `SELECT d.*, p.title 
       FROM product_deals d 
       JOIN products p ON d.product_id = p.id 
       WHERE d.id = $1`,
      [deal_id]
    );

    if (dealRes.rows.length === 0) {
      return res.status(404).json({ message: "Deal not found" });
    }

    const deal = dealRes.rows[0];

    // 2. Calculate total amount (Amount + Shipping + Buyer Commission + GST)
    // In our system, 'amount' is already the product price.
    // Total for buyer = amount + shipping_fee + buyer_commission_amount + platform_gst_amount (if applicable)
    // Actually, looking at orderController, buyer_commission_amount and platform_gst_amount are calculated.
    // Let's re-calculate total buyer cost correctly.
    
    const productPrice = parseFloat(deal.amount);
    const shippingFee = parseFloat(deal.shipping_fee || 0);
    const buyerCommissionAmount = parseFloat(deal.buyer_commission_amount || 0);
    
    // Platform GST is usually on the commission.
    const gstRate = 18; // Default 18%
    const platformGstOnBuyerComm = buyerCommissionAmount * (gstRate / 100);
    
    const totalAmount = productPrice + shippingFee + buyerCommissionAmount + platformGstOnBuyerComm;

    // Razorpay expects amount in paise (multiply by 100)
    const options = {
      amount: Math.round(totalAmount * 100),
      currency: "INR",
      receipt: `receipt_deal_${deal_id}`,
    };

    const order = await razorpay.orders.create(options);

    res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
      deal_title: deal.title
    });
  } catch (error) {
    console.error("Razorpay Order Error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.verifyRazorpayPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      deal_id
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    const isSignatureValid = expectedSignature === razorpay_signature;

    if (isSignatureValid) {
      // Payment is successful, update deal status and save Razorpay IDs
      await pool.query(
        `UPDATE product_deals 
         SET payment_status = 'PAID', 
             status = 'PAID', 
             razorpay_order_id = $1, 
             razorpay_payment_id = $2,
             payment_method = 'RAZORPAY'
         WHERE id = $3`,
        [razorpay_order_id, razorpay_payment_id, deal_id]
      );

      // Fetch deal to notify seller
      const dealRes = await pool.query(
        "SELECT d.*, p.title FROM product_deals d JOIN products p ON d.product_id = p.id WHERE d.id = $1",
        [deal_id]
      );
      const deal = dealRes.rows[0];

      // Notify Seller
      try {
        await notificationService.createNotification({
          user_id: deal.seller_id,
          title: "Payment Received! 💰",
          message: `The buyer has paid for "${deal.title}". Please prepare the item for shipment.`,
          type: 'success',
          link: '/profile?tab=selling',
          channels: ['in_app', 'email', 'sms', 'whatsapp']
        });
      } catch (err) { console.error("Payment notification failed:", err.message); }

      res.json({ status: "success", message: "Payment verified successfully" });
    } else {
      res.status(400).json({ status: "failure", message: "Invalid signature" });
    }
  } catch (error) {
    console.error("Razorpay Verification Error:", error);
    res.status(500).json({ error: error.message });
  }
};
