/**
 * Shared commission and payout calculator for product deals.
 * Single source of truth — used by cronService, orderController, and razorpayController.
 * Prevents formula drift across duplicate implementations.
 *
 * @param {Object} params
 * @param {number} params.price              - Product sale price (highest bid or fixed price)
 * @param {number} params.shippingFee        - Shipping fee amount
 * @param {number} params.sellerCommRate     - Seller commission rate (as a percentage, e.g. 5 for 5%)
 * @param {number} params.buyerCommRate      - Buyer commission rate (as a percentage)
 * @param {number} params.gstRate            - GST rate on platform commission (as a percentage, e.g. 18)
 * @param {boolean} params.hasGst            - Whether the seller is GST-registered (affects TCS)
 * @returns {Object} Calculated financial breakdown
 */
exports.calculateDealFinancials = ({
  price,
  shippingFee = 0,
  sellerCommRate,
  buyerCommRate,
  gstRate,
  hasGst = false,
}) => {
  const sellerCommAmt   = price * (sellerCommRate / 100);
  const buyerCommAmt    = price * (buyerCommRate / 100);
  const platformGst     = (sellerCommAmt + buyerCommAmt) * (gstRate / 100);
  const totalFee        = sellerCommAmt + buyerCommAmt + platformGst;

  const tcsRate = hasGst ? 1.0 : 0;
  const tcsAmt  = hasGst ? price * 0.01 : 0;

  // What the seller receives after all deductions
  const sellerGstOnComm = sellerCommAmt * (gstRate / 100);
  const sellerPayout    = (price - sellerCommAmt - sellerGstOnComm - tcsAmt) + shippingFee;

  // What the buyer pays in total
  const buyerGstOnComm  = buyerCommAmt * (gstRate / 100);
  const totalBuyerCost  = price + shippingFee + buyerCommAmt + buyerGstOnComm;

  return {
    sellerCommAmt,
    buyerCommAmt,
    platformGst,
    totalFee,
    tcsRate,
    tcsAmt,
    sellerPayout,
    totalBuyerCost,
  };
};
