const pool = require("../config/db");

// Place a new bid
exports.placeBid = async (req, res) => {
  try {
    const { product_id, user_id, bid_amount } = req.body;

    // 1. Check if product allows auctions
    const productCheck = await pool.query(
      "SELECT allow_auction, starting_bid, auction_end, status FROM products WHERE id = $1",
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const product = productCheck.rows[0];

    if (!product.allow_auction) {
      return res.status(400).json({ message: "This product is not listed for auction" });
    }

    if (new Date(product.auction_end) < new Date()) {
      return res.status(400).json({ message: "This auction has ended" });
    }

    // 2. Check if bid is higher than starting bid and current highest bid
    if (parseFloat(bid_amount) < parseFloat(product.starting_bid)) {
      return res.status(400).json({ message: `Bid must be at least the starting bid of ₹${product.starting_bid}` });
    }

    const highestBidCheck = await pool.query(
      "SELECT MAX(bid_amount) as current_highest FROM bids WHERE product_id = $1",
      [product_id]
    );

    const currentHighest = highestBidCheck.rows[0].current_highest || 0;
    if (parseFloat(bid_amount) <= parseFloat(currentHighest)) {
      return res.status(400).json({ message: `Bid must be higher than current highest bid of ₹${currentHighest}` });
    }

    // 3. Insert the bid
    const result = await pool.query(
      "INSERT INTO bids (product_id, user_id, bid_amount) VALUES ($1, $2, $3) RETURNING *",
      [product_id, user_id, bid_amount]
    );

    res.json({
      message: "Bid placed successfully",
      bid: result.rows[0]
    });

  } catch (error) {
    console.error("Place Bid Error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get bid history for a product
exports.getBidHistory = async (req, res) => {
  try {
    const { productId } = req.params;
    const result = await pool.query(
      `SELECT bids.*, users.name as user_name 
       FROM bids 
       JOIN users ON bids.user_id = users.id 
       WHERE product_id = $1 
       ORDER BY bid_amount DESC`,
      [productId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};