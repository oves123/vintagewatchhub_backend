const pool = require("../config/db");
const notificationService = require("../services/notificationService");

const getBidIncrement = (currentPrice) => {
    const price = parseFloat(currentPrice);
    if (price < 10000) return 500;
    if (price < 50000) return 1000;
    if (price < 200000) return 2500;
    if (price < 500000) return 5000;
    if (price < 1000000) return 10000;
    return 25000;
};

// Place a new bid (Proxy Bidding Enabled)
exports.placeBid = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { product_id, bid_amount } = req.body;
    const user_id = req.user.id; 

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

    // Prevent sellers from bidding on their own listings
    if (parseInt(user_id) === parseInt(product.seller_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: "You cannot bid on your own listing." });
    }

    if (!product.allow_auction) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "This product is not listed for auction" });
    }

    if (!['approved', 'active'].includes(product.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "This item is no longer available for bidding." });
    }

    if (new Date(product.auction_end) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "This auction has ended" });
    }

    const newMaxBid = parseFloat(bid_amount);
    
    // 2. Fetch current top proxy bid
    const prevBidRes = await client.query(
      "SELECT user_id, bid_amount FROM bids WHERE product_id = $1 ORDER BY bid_amount DESC, created_at ASC LIMIT 1",
      [product_id]
    );
    const topBid = prevBidRes.rows[0];

    const currentPublicPrice = parseFloat(product.current_bid) || parseFloat(product.starting_bid) || 0;
    const minIncrement = getBidIncrement(currentPublicPrice);
    
    let newPublicPrice = currentPublicPrice;
    let outbidUserId = null;
    let responseMessage = "Bid placed successfully.";
    let instantlyOutbid = false;

    if (!topBid) {
       // First bid ever
       if (newMaxBid < parseFloat(product.starting_bid)) {
         await client.query('ROLLBACK');
         return res.status(400).json({ message: `Bid must be at least the starting bid of ₹${product.starting_bid}` });
       }
       newPublicPrice = parseFloat(product.starting_bid); 
       await client.query("INSERT INTO bids (product_id, user_id, bid_amount) VALUES ($1, $2, $3) RETURNING *", [product_id, user_id, newMaxBid]);
    } else {
       const topUserId = topBid.user_id;
       const topMaxBid = parseFloat(topBid.bid_amount);

       if (parseInt(topUserId) === parseInt(user_id)) {
           // Self bidding (Raising their own max proxy bid)
           if (newMaxBid <= topMaxBid) {
               await client.query('ROLLBACK');
               return res.status(400).json({ message: "You already have a higher or equal maximum bid on this item." });
           }
           await client.query("INSERT INTO bids (product_id, user_id, bid_amount) VALUES ($1, $2, $3)", [product_id, user_id, newMaxBid]);
           responseMessage = "Your maximum proxy bid has been successfully increased.";
       } else {
           // Someone else is bidding
           if (newMaxBid < currentPublicPrice + minIncrement) {
               await client.query('ROLLBACK');
               return res.status(400).json({ message: `Bid must be at least ₹${currentPublicPrice + minIncrement} (₹${minIncrement} minimum increment)` });
           }

           if (newMaxBid > topMaxBid) {
               // New bidder wins!
               outbidUserId = topUserId;
               const nextIncrementForOldMax = getBidIncrement(topMaxBid);
               newPublicPrice = Math.min(newMaxBid, topMaxBid + nextIncrementForOldMax);
               await client.query("INSERT INTO bids (product_id, user_id, bid_amount) VALUES ($1, $2, $3)", [product_id, user_id, newMaxBid]);
           } else {
               // Instantly outbid by proxy
               const nextIncrementForNewMax = getBidIncrement(newMaxBid);
               newPublicPrice = Math.min(topMaxBid, newMaxBid + nextIncrementForNewMax);
               await client.query("INSERT INTO bids (product_id, user_id, bid_amount) VALUES ($1, $2, $3)", [product_id, user_id, newMaxBid]);
               instantlyOutbid = true;
               responseMessage = "You were instantly outbid by an automatic proxy bid placed earlier by another bidder.";
           }
       }
    }

    // 4. Update current_bid in products
    let updateQuery = "UPDATE products SET current_bid = $1";
    let queryParams = [newPublicPrice, product_id];

    // 5. Dynamic Extension (Anti-Sniping)
    let isExtended = false;
    const timeRemaining = new Date(product.auction_end) - new Date();
    if (timeRemaining > 0 && timeRemaining < 2 * 60 * 1000) { // 2 minutes
      const newAuctionEnd = new Date(new Date(product.auction_end).getTime() + 2 * 60 * 1000);
      updateQuery += ", auction_end = $3";
      queryParams.push(newAuctionEnd);
      product.auction_end = newAuctionEnd;
      isExtended = true;
    }

    updateQuery += " WHERE id = $2";
    await client.query(updateQuery, queryParams);

    // Fetch bidder info for socket emit
    const emitUserId = instantlyOutbid ? topBid.user_id : user_id;
    const bidderRes = await client.query(
      `SELECT name, profile_image, rating,
       (SELECT COUNT(*) FROM product_deals WHERE seller_id = $1 AND status = 'CONFIRMED') as total_sold,
       (SELECT COUNT(*) FROM product_deals WHERE buyer_id = $1 AND status = 'CONFIRMED') as total_bought,
       (SELECT COUNT(*) FROM reviews WHERE seller_id = $1) as review_count
       FROM users WHERE id = $1`,
      [emitUserId]
    );
    const bidder = bidderRes.rows[0];

    await client.query('COMMIT');

    // Emit socket event for real-time updates
    const io = req.app.get("io");
    if (io) {
      io.to(`auction_${product_id}`).emit("newBid", {
        product_id,
        bid_amount: newPublicPrice, // EMIT PUBLIC PRICE, NOT MAX BID
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
    if (!instantlyOutbid && user_id !== topBid?.user_id) {
        try {
          await notificationService.createNotification({
            user_id: product.seller_id,
            title: "New Bid Received! 🔨",
            message: `A new bid has pushed the price to ₹${parseFloat(newPublicPrice).toLocaleString()} on your item "${product.title || 'Watch'}".`,
            type: 'info',
            link: `/products/${product_id}`
          });
        } catch (err) { console.error("Bid notification failed:", err.message); }
    }

    // 7. Notify outbid user
    if (outbidUserId) {
      try {
        await notificationService.createNotification({
          user_id: outbidUserId,
          title: "You've Been Outbid! 🔔",
          message: `Someone outbid your maximum proxy bid! The new price is ₹${parseFloat(newPublicPrice).toLocaleString()} on "${product.title || 'Watch'}". Bid now to stay in the lead!`,
          type: 'warning',
          link: `/products/${product_id}`
        });
      } catch (err) { console.error("Outbid notification failed:", err.message); }
    }

    res.json({
      message: isExtended && !instantlyOutbid ? "Bid placed and auction extended!" : responseMessage,
      isExtended,
      instantlyOutbid,
      currentPrice: newPublicPrice
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
          CASE WHEN b.user_id = $2 THEN u.name ELSE CONCAT(LEFT(u.name, 3), '***') END as user_name, 
          u.profile_image, 
          u.rating,
          (SELECT COUNT(*) FROM product_deals WHERE seller_id = u.id AND status = 'CONFIRMED') as total_sold,
          (SELECT COUNT(*) FROM product_deals WHERE buyer_id = u.id AND status = 'CONFIRMED') as total_bought,
          (SELECT COUNT(*) FROM reviews WHERE seller_id = u.id) as review_count
       FROM bids b
       JOIN users u ON b.user_id = u.id 
       WHERE b.product_id = $1 
       ORDER BY b.bid_amount DESC, b.created_at DESC`,
      [productId, req.user?.id || null]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Retract all bids for a user on a specific product
exports.retractBid = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { product_id } = req.body;
    const user_id = req.user.id;

    // 1. Fetch product
    const productCheck = await client.query(
      "SELECT id, starting_bid, auction_end, status, current_bid FROM products WHERE id = $1 FOR UPDATE",
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Product not found" });
    }
    const product = productCheck.rows[0];

    // Check if auction is ended
    if (new Date(product.auction_end) < new Date() || !['approved', 'active'].includes(product.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "You cannot retract a bid after the auction has ended." });
    }

    // 2. Check if user has bids
    const userBids = await client.query("SELECT id FROM bids WHERE product_id = $1 AND user_id = $2", [product_id, user_id]);
    if (userBids.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "You have no bids to retract on this item." });
    }

    // 3. Delete all bids by this user for this product
    await client.query("DELETE FROM bids WHERE product_id = $1 AND user_id = $2", [product_id, user_id]);

    // 4. Recalculate proxy engine for remaining bidders
    // Fetch top 2 remaining bidders based on their max bid
    const remainingBiddersRes = await client.query(`
      SELECT user_id, MAX(bid_amount) as max_bid 
      FROM bids 
      WHERE product_id = $1 
      GROUP BY user_id 
      ORDER BY max_bid DESC 
      LIMIT 2
    `, [product_id]);

    const remainingBidders = remainingBiddersRes.rows;
    let newPublicPrice = parseFloat(product.starting_bid);
    let topBidderId = null;

    if (remainingBidders.length === 0) {
        // No one left bidding. Reset to starting bid.
        newPublicPrice = parseFloat(product.starting_bid);
    } else if (remainingBidders.length === 1) {
        // Only 1 person left. Their public price drops to starting bid.
        newPublicPrice = parseFloat(product.starting_bid);
        topBidderId = remainingBidders[0].user_id;
    } else {
        // 2 or more people. Re-evaluate proxy war between top 2.
        const topBidder = remainingBidders[0];
        const secondBidder = remainingBidders[1];
        topBidderId = topBidder.user_id;

        const nextIncrementForSecondMax = getBidIncrement(secondBidder.max_bid);
        newPublicPrice = Math.min(
            parseFloat(topBidder.max_bid), 
            parseFloat(secondBidder.max_bid) + nextIncrementForSecondMax
        );
    }

    // Update product current_bid
    await client.query("UPDATE products SET current_bid = $1 WHERE id = $2", [newPublicPrice, product_id]);

    await client.query('COMMIT');

    // Emit socket event for real-time updates
    const io = req.app.get("io");
    if (io) {
      io.to(`auction_${product_id}`).emit("bidRetracted", {
        product_id,
        new_current_bid: newPublicPrice
      });
    }

    res.json({
      message: "Your bids have been successfully retracted. The auction price has been recalculated.",
      currentPrice: newPublicPrice
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Retract Bid Error:", error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};