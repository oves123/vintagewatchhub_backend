const pool = require("../config/db");

exports.placeBid = async (req, res) => {
  try {

    const { product_id, user_id, bid_amount } = req.body;

    // Get product and highest bid
    const productQuery = await pool.query(
      "SELECT price, auction_end FROM products WHERE id=$1",
      [product_id]
    );

    if (productQuery.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const product = productQuery.rows[0];
    const now = new Date();

    if (product.auction_end && new Date(product.auction_end) < now) {
      return res.status(400).json({ message: "Auction has ended" });
    }

    const currentHighest = product.price || 0;

    if (bid_amount <= currentHighest) {
      return res.status(400).json({
        message: "Bid must be higher than current highest bid"
      });
    }

    const result = await pool.query(
      `INSERT INTO bids(product_id,user_id,bid_amount)
    VALUES($1,$2,$3)
    RETURNING *`,
      [product_id, user_id, bid_amount]
    );

    // Update product current price
    await pool.query(
      "UPDATE products SET price=$1 WHERE id=$2",
      [bid_amount, product_id]
    );

    const io = req.app.get("io");
    io.to(`auction_${product_id}`).emit("newBid", {
      productId: product_id,
      bidAmount: bid_amount,
      userId: user_id
    });

    res.json({
      message: "Bid placed successfully",
      bid: result.rows[0]
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
exports.getBids = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, u.name as buyer_name 
       FROM bids b
       JOIN users u ON b.user_id = u.id
       WHERE b.product_id = $1 
       ORDER BY b.bid_amount DESC`,
      [req.params.product_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getUserBids = async (req, res) => {
  try {
    const { user_id } = req.params;
    const result = await pool.query(
      `SELECT bids.*, products.title, products.price as current_highest_price, products.image
       FROM bids
       JOIN products ON bids.product_id = products.id
       WHERE bids.user_id = $1
       ORDER BY bids.created_at DESC`,
      [user_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};