const pool = require("../config/db");
const notificationService = require("../services/notificationService");

// Place a new bid
exports.placeBid = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { product_id, user_id, bid_amount } = req.body;

    // 1. Check if product allows auctions
    const productCheck = await client.query(
      "SELECT id, allow_auction, starting_bid, auction_end, status, reserve_price, current_bid, seller_id, title FROM products WHERE id = $1 FOR UPDATE",
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Product not found" });
    }

    const product = productCheck.rows[0];

    if (!product.allow_auction) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "This product is not listed for auction" });
    }

    const buyerRes = await client.query("SELECT state FROM users WHERE id = $1", [user_id]);
    const buyer = buyerRes.rows[0];

    const sellerRes = await client.query("SELECT state FROM users WHERE id = $1", [product.seller_id]);
    const seller = sellerRes.rows[0];

    if (product.shipping_scope === 'LOCAL' && (!buyer || !seller || buyer.state !== seller.state)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: `Shipping Restricted: This seller is legally restricted to selling within their home state (${seller?.state || 'Unknown'}). You cannot place a bid on this item.` });
    }

    if (new Date(product.auction_end) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "This auction has ended" });
    }

    // 2. Check if bid is higher than starting bid and current highest bid
    if (parseFloat(bid_amount) < parseFloat(product.starting_bid)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Bid must be at least the starting bid of ₹${product.starting_bid}` });
    }

    const currentHighest = product.current_bid || 0;
    if (parseFloat(bid_amount) <= parseFloat(currentHighest)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Bid must be higher than current highest bid of ₹${currentHighest}` });
    }

    // 3. Insert the bid
    const bidResult = await client.query(
      "INSERT INTO bids (product_id, user_id, bid_amount) VALUES ($1, $2, $3) RETURNING *",
      [product_id, user_id, bid_amount]
    );

    // 4. Update current_bid in products
    let updateQuery = "UPDATE products SET current_bid = $1";
    let queryParams = [bid_amount, product_id];

    // 5. Dynamic Extension (Anti-Sniping)
    let isExtended = false;
    const timeRemaining = new Date(product.auction_end) - new Date();
    if (timeRemaining > 0 && timeRemaining < 5 * 60 * 1000) { // 5 minutes
      const newAuctionEnd = new Date(new Date(product.auction_end).getTime() + 5 * 60 * 1000);
      updateQuery += ", auction_end = $3";
      queryParams.push(newAuctionEnd);
      product.auction_end = newAuctionEnd;
      isExtended = true;
    }

    updateQuery += " WHERE id = $2";
    await client.query(updateQuery, queryParams);

    // Fetch bidder info for socket emit with stats
    const bidderRes = await client.query(
      `SELECT name, profile_image, rating,
       (SELECT COUNT(*) FROM product_deals WHERE seller_id = $1 AND status = 'CONFIRMED') as total_sold,
       (SELECT COUNT(*) FROM product_deals WHERE buyer_id = $1 AND status = 'CONFIRMED') as total_bought,
       (SELECT COUNT(*) FROM reviews WHERE seller_id = $1) as review_count
       FROM users WHERE id = $1`,
      [user_id]
    );
    const bidder = bidderRes.rows[0];

    await client.query('COMMIT');

    // Emit socket event for real-time updates
    const io = req.app.get("io");
    if (io) {
      io.to(`auction_${product_id}`).emit("newBid", {
        product_id,
        bid_amount: bid_amount,
        user_name: bidder.name,
        profile_image: bidder.profile_image,
        rating: bidder.rating,
        total_sold: bidder.total_sold,
        total_bought: bidder.total_bought,
        review_count: bidder.review_count,
        auction_end: queryParams.length > 2 ? queryParams[2] : product.auction_end,
        isExtended
      });
    }

    // 6. Notify Seller
    try {
      await notificationService.createNotification({
        user_id: product.seller_id,
        title: "New Bid Received! 🔨",
        message: `A new bid of ₹${parseFloat(bid_amount).toLocaleString()} has been placed on your item "${product.title || 'Watch'}".`,
        type: 'info',
        link: `/products/${product_id}`
      });
    } catch (err) { console.error("Bid notification failed:", err.message); }

    res.json({
      message: isExtended ? "Bid placed and auction extended!" : "Bid placed successfully",
      bid: bidResult.rows[0],
      isExtended
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Place Bid Error:", error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// Get bid history for a product
exports.getBidHistory = async (req, res) => {
  try {
    const { productId } = req.params;
    const result = await pool.query(
      `SELECT 
          b.*, 
          u.name as user_name, 
          u.profile_image, 
          u.rating,
          (SELECT COUNT(*) FROM product_deals WHERE seller_id = u.id AND status = 'CONFIRMED') as total_sold,
          (SELECT COUNT(*) FROM product_deals WHERE buyer_id = u.id AND status = 'CONFIRMED') as total_bought,
          (SELECT COUNT(*) FROM reviews WHERE seller_id = u.id) as review_count
       FROM bids b
       JOIN users u ON b.user_id = u.id 
       WHERE b.product_id = $1 
       ORDER BY b.bid_amount DESC`,
      [productId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};