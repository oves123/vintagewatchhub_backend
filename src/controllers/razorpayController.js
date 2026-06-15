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
    const sellerCommissionAmount = parseFloat(deal.seller_commission_amount || deal.commission_amount || 0);
    const platformGstAmount = parseFloat(deal.platform_gst_amount || 0);

    const divisor = sellerCommissionAmount + buyerCommissionAmount;
    const buyerGst = (buyerCommissionAmount > 0 && divisor > 0)
      ? platformGstAmount * (buyerCommissionAmount / divisor)
      : 0;

    const totalAmount = productPrice + shippingFee + buyerCommissionAmount + buyerGst;

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
      // Payment is successful, update deal status and lock funds in ESCROW
      await pool.query(
        `UPDATE product_deals 
         SET payment_status = 'PAID', 
             status = 'PAID', 
             razorpay_order_id = $1, 
             razorpay_payment_id = $2,
             payment_method = 'RAZORPAY',
             escrow_status = 'HELD'
         WHERE id = $3`,
        [razorpay_order_id, razorpay_payment_id, deal_id]
      );

      // Fetch deal to notify seller and log ledger
      const dealRes = await pool.query(
        "SELECT d.*, p.title FROM product_deals d JOIN products p ON d.product_id = p.id WHERE d.id = $1",
        [deal_id]
      );
      const deal = dealRes.rows[0];

      // Update product status to sold
      await pool.query(
        "UPDATE products SET status = 'sold' WHERE id = $1",
        [deal.product_id]
      );

      // Log to Financial Ledger
      const divisor = parseFloat(deal.seller_commission_amount || deal.commission_amount || 0) + parseFloat(deal.buyer_commission_amount || 0);
      const buyerGst = (deal.buyer_commission_amount > 0 && divisor > 0)
        ? deal.platform_gst_amount * (parseFloat(deal.buyer_commission_amount) / divisor)
        : 0;
      const totalBuyerCost = parseFloat(deal.amount) + parseFloat(deal.shipping_fee || 0) + parseFloat(deal.buyer_commission_amount || 0) + parseFloat(buyerGst || 0);

      await pool.query(
        "INSERT INTO financial_ledger (deal_id, user_id, amount, type, status, metadata) VALUES ($1, $2, $3, 'PAYMENT', 'RECEIVED', $4)",
        [deal_id, deal.buyer_id, totalBuyerCost, JSON.stringify({ method: 'RAZORPAY', payment_id: razorpay_payment_id })]
      );

      // Notify Seller
      try {
        await notificationService.createNotification({
          user_id: deal.seller_id,
          title: "Payment Received & Held in Escrow! 💰",
          message: `The buyer has paid for "${deal.title}". The funds are securely held in Escrow. Please prepare the item for shipment.`,
          type: 'success',
          link: '/profile?tab=selling',
          channels: ['in_app', 'email', 'sms', 'whatsapp']
        });
      } catch (err) { console.error("Payment notification failed:", err.message); }

      res.json({ status: "success", message: "Payment verified successfully. Funds held in Escrow." });
    } else {
      res.status(400).json({ status: "failure", message: "Invalid signature" });
    }
  } catch (error) {
    console.error("Razorpay Verification Error:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Escrow Release (Razorpay Route Integration)
 * Called by Admin when verifying the shipment or releasing payout.
 */
exports.releaseEscrow = async (req, res) => {
  try {
    const { deal_id } = req.body;

    const dealRes = await pool.query("SELECT * FROM product_deals WHERE id = $1", [deal_id]);
    if (dealRes.rows.length === 0) return res.status(404).json({ message: "Deal not found" });

    const deal = dealRes.rows[0];
    
    if (deal.escrow_status === 'RELEASED') {
      return res.status(400).json({ message: "Funds have already been released from Escrow." });
    }

    if (deal.payment_status !== 'PAID') {
      return res.status(400).json({ message: "Cannot release escrow for unpaid deals." });
    }

    // ─── RAZORPAY ROUTE LOGIC (Mocked for now until keys are live) ────────
    // In production, you would call:
    // await razorpay.payments.transfer(deal.razorpay_payment_id, {
    //   transfers: [{
    //     account: seller.razorpay_connected_account_id,
    //     amount: Math.round(deal.seller_payout * 100),
    //     currency: "INR"
    //   }]
    // });
    // ──────────────────────────────────────────────────────────────────────

    // Update the DB to mark Escrow as Released
    const result = await pool.query(
      `UPDATE product_deals 
       SET escrow_status = 'RELEASED', 
           payout_status = 'RELEASED',
           payout_released_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [deal_id]
    );

    // Record in ledger
    await pool.query(
      "INSERT INTO financial_ledger (deal_id, user_id, amount, type, status) VALUES ($1, $2, $3, 'ESCROW_RELEASE', 'RELEASED')",
      [deal.id, deal.seller_id, deal.seller_payout]
    );

    // Notify the Seller
    await notificationService.createNotification({
      user_id: deal.seller_id,
      title: "Funds Released from Escrow! 💸",
      message: `Your payout of ₹${deal.seller_payout} for deal #${deal.id} has been released from Escrow to your connected bank account.`,
      type: 'success',
      link: '/profile?tab=selling'
    });

    res.json({ message: "Escrow released successfully.", deal: result.rows[0] });

  } catch (error) {
    console.error("Escrow Release Error:", error);
    res.status(500).json({ error: error.message });
  }
};
