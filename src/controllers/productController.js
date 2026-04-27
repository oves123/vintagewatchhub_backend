const pool = require("../config/db");
const notificationService = require("../services/notificationService");

exports.createProduct = async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      seller_id,
      category_id,
      product_type,
      condition_code,
      item_specifics,
      condition_details,
      shipping_info,
      payment_info,
      status,
      shipping_fee,
      shipping_type,
      allow_buy_now,
      buy_it_now_price,
      allow_auction,
      starting_bid,
      auction_end,
      allow_offers
    } = req.body;

    const images = req.files ? req.files.map(f => f.path) : [];
    const hasVideo = req.files && req.files.some(f => f.mimetype && f.mimetype.startsWith('video/'));

    // Listing Options Validation (Max 2 out of 3)
    const optionsCount = [allow_buy_now, allow_auction, allow_offers].filter(Boolean).length;
    if (optionsCount > 2) {
      return res.status(400).json({ error: "You can select a maximum of two listing options (Buy Now, Auction, or Offers)." });
    }

    if (status !== 'draft' && !hasVideo) {
      return res.json({ message: "At least one video is mandatory for listing." });
    }

    // Auto-approve for verified sellers
    let finalStatus = status || 'pending';
    const userResult = await pool.query("SELECT is_verified FROM users WHERE id = $1", [seller_id]);
    if (userResult.rows.length > 0 && userResult.rows[0].is_verified) {
      finalStatus = 'approved';
    }

    const result = await pool.query(
      `INSERT INTO products
      (title, description, price, seller_id, category_id, product_type, images, 
       condition_code, item_specifics, condition_details, shipping_info, payment_info, status, shipping_fee, shipping_type,
       allow_buy_now, buy_it_now_price, allow_auction, starting_bid, auction_end, allow_offers)
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING *`,
      [
        title, 
        description, 
        price || 0, 
        seller_id, 
        category_id, 
        product_type || 'fixed', 
        JSON.stringify(images),
        condition_code,
        typeof item_specifics === 'string' ? item_specifics : JSON.stringify(item_specifics || {}),
        typeof condition_details === 'string' ? condition_details : JSON.stringify(condition_details || {}),
        typeof shipping_info === 'string' ? shipping_info : JSON.stringify(shipping_info || {}),
        typeof payment_info === 'string' ? payment_info : JSON.stringify(payment_info || {}),
        finalStatus,
        shipping_fee || 0,
        shipping_type || 'fixed',
        allow_buy_now || false,
        buy_it_now_price || null,
        allow_auction || false,
        starting_bid || 0,
        auction_end || null,
        allow_offers || false
      ]
    );

    res.json({
      message: (status === 'pending' || !status) ? "Listing submitted for review" : "Listing successfully created",
      product: result.rows[0]
    });

    // Notify Admins if pending
    if (finalStatus === 'pending') {
      const adminIds = await notificationService.getAdminIds();
      for (const adminId of adminIds) {
        await notificationService.createNotification({
          user_id: adminId,
          title: "New Product Pending Approval",
          message: `A new product "${title}" has been submitted and is waiting for review.`,
          type: 'info',
          link: '/admin?tab=products'
        });
      }
    }

  } catch (error) {
    console.error("Create Product Error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title, description, price, category_id, product_type,
      condition_code, item_specifics, condition_details, shipping_info, payment_info, status,
      shipping_fee, shipping_type,
      allow_buy_now, buy_it_now_price, allow_auction, starting_bid, auction_end, allow_offers
    } = req.body;

    // Listing Options Validation (Max 2 out of 3)
    const optionsCount = [allow_buy_now, allow_auction, allow_offers].filter(Boolean).length;
    if (optionsCount > 2) {
      return res.status(400).json({ error: "You can select a maximum of two listing options (Buy Now, Auction, or Offers)." });
    }

    // Handle new images if any
    let imagesUpdateQuery = "";
    let queryParams = [
      title, 
      description, 
      price, 
      category_id, 
      product_type, 
      condition_code, 
      typeof item_specifics === 'string' ? item_specifics : JSON.stringify(item_specifics || {}),
      typeof condition_details === 'string' ? condition_details : JSON.stringify(condition_details || {}),
      typeof shipping_info === 'string' ? shipping_info : JSON.stringify(shipping_info || {}),
      typeof payment_info === 'string' ? payment_info : JSON.stringify(payment_info || {}),
      status, 
      shipping_fee || 0,
      shipping_type || 'fixed',
      allow_buy_now || false,
      buy_it_now_price || null,
      allow_auction || false,
      starting_bid || 0,
      auction_end || null,
      allow_offers || false,
      id
    ];

    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(f => f.path);
      imagesUpdateQuery = ", images = $15";
      queryParams.push(JSON.stringify(newImages));
    }

    const result = await pool.query(
      `UPDATE products SET 
        title = $1, description = $2, price = $3, category_id = $4, product_type = $5, 
        condition_code = $6, item_specifics = $7, condition_details = $8, 
        shipping_info = $9, payment_info = $10, status = $11,
        shipping_fee = $12, shipping_type = $13,
        allow_buy_now = $14, buy_it_now_price = $15, allow_auction = $16,
        starting_bid = $17, auction_end = $18, allow_offers = $19
        ${imagesUpdateQuery}
      WHERE id = $${queryParams.length} RETURNING *`,
      queryParams
    );

    if (result.rows.length === 0) return res.status(404).json({ message: "Product not found" });

    res.json({ message: "Product updated", product: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) return res.status(400).json({ message: "Status is required" });

    const result = await pool.query(
      "UPDATE products SET status = $1 WHERE id = $2 RETURNING *",
      [status, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: "Product not found" });

    res.json({ message: `Product status updated to ${status}`, product: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Comprehensive cleanup to prevent FK errors
    await pool.query("DELETE FROM watchlist WHERE product_id = $1", [id]);
    await pool.query("DELETE FROM product_deals WHERE product_id = $1", [id]);
    await pool.query("DELETE FROM product_offers WHERE product_id = $1", [id]);
    
    // Delete messages in chats related to this product
    await pool.query("DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE product_id = $1)", [id]);
    await pool.query("DELETE FROM chats WHERE product_id = $1", [id]);
    
    // Finally delete the product
    await pool.query("DELETE FROM products WHERE id = $1", [id]);
    
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMyListings = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      "SELECT products.*, categories.name as category_name FROM products LEFT JOIN categories ON products.category_id = categories.id WHERE seller_id = $1 ORDER BY id DESC",
      [userId]
    );
    const products = result.rows.map(resObj => {
      if (resObj.images && typeof resObj.images === 'string') {
        try { resObj.images = JSON.parse(resObj.images); } catch(e) { resObj.images = []; }
      }
      return resObj;
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const { search, category, brand, minPrice, maxPrice, condition, format, sort, strap_type } = req.query;

    let query = `
      SELECT products.*, categories.name AS category_name,
             users.is_verified AS seller_verified, users.seller_badge
      FROM products
      LEFT JOIN categories ON products.category_id = categories.id
      LEFT JOIN users ON products.seller_id = users.id
      WHERE products.status = 'approved'
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (products.title ILIKE $${params.length} OR products.description ILIKE $${params.length})`;
    }

    if (category) {
      params.push(category);
      query += ` AND categories.name ILIKE $${params.length}`;
    }

    if (brand) {
      params.push(brand);
      query += ` AND products.item_specifics->>'brand' ILIKE $${params.length}`;
    }

    if (minPrice) {
      params.push(minPrice);
      query += ` AND products.price >= $${params.length}`;
    }

    if (maxPrice) {
      params.push(maxPrice);
      query += ` AND products.price <= $${params.length}`;
    }

    if (condition) {
      const conditions = condition.split(',').map(c => c.trim());
      const conditionPlaceholders = conditions.map(c => {
        params.push(c);
        return `$${params.length}`;
      });
      query += ` AND products.condition_code IN (${conditionPlaceholders.join(', ')})`;
    }

    if (format) {
      const formats = format.split(',').map(f => f.trim());
      const formatPlaceholders = formats.map(f => {
        params.push(f);
        return `$${params.length}`;
      });
      query += ` AND products.product_type IN (${formatPlaceholders.join(', ')})`;
    }

    if (strap_type) {
      params.push(strap_type);
      query += ` AND products.condition_details->>'strap_type' = $${params.length}`;
    }

    if (sort === "lowest_price") {
      query += ` ORDER BY products.price ASC`;
    } else if (sort === "highest_price") {
      query += ` ORDER BY products.price DESC`;
    } else if (sort === "ending_soon") {
      query += ` ORDER BY products.id ASC`; 
    } else {
      query += ` ORDER BY products.id DESC`;
    }

    const result = await pool.query(query, params);

    const products = result.rows.map(resObj => {
      if (resObj.images && typeof resObj.images === 'string') {
        try { resObj.images = JSON.parse(resObj.images); } catch(e) { resObj.images = []; }
      }
      if (resObj.item_specifics && typeof resObj.item_specifics === 'string') {
        try { resObj.item_specifics = JSON.parse(resObj.item_specifics); } catch(e) { resObj.item_specifics = {}; }
      }
      return resObj;
    });

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getBrands = async (req, res) => {
  try {
    // UPDATED: More robust extraction - removes empty, null, and handles trimming
    const result = await pool.query(
      `SELECT DISTINCT TRIM(item_specifics->>'brand') as brand 
       FROM products 
       WHERE status IN ('approved', 'under_offer') 
       AND item_specifics->>'brand' IS NOT NULL 
       AND TRIM(item_specifics->>'brand') != ''
       ORDER BY brand ASC`
    );
    res.json(result.rows.map(r => r.brand));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const { viewerId } = req.query;

    // Increment views (Unique per user if viewerId provided)
    if (viewerId) {
      const viewCheck = await pool.query(
        "SELECT id FROM product_views WHERE product_id = $1 AND user_id = $2",
        [id, viewerId]
      );

      if (viewCheck.rows.length === 0) {
        await pool.query("INSERT INTO product_views (product_id, user_id) VALUES ($1, $2)", [id, viewerId]);
        await pool.query("UPDATE products SET views = views + 1 WHERE id = $1", [id]);
      }
    } else {
      // For guests, we still increment views but not uniquely (or we could choose to skip)
      // Standard practice: increment for every visit if no ID
      await pool.query("UPDATE products SET views = views + 1 WHERE id = $1", [id]);
    }

    const query = `
      SELECT products.*, categories.name AS category_name,
             users.name AS seller_name, users.city AS seller_city, users.state AS seller_state,
             users.is_verified AS seller_verified, users.seller_badge, users.rating AS seller_rating,
             (SELECT COUNT(*) FROM watchlist WHERE product_id = products.id) as wishlist_count
      FROM products
      LEFT JOIN categories ON products.category_id = categories.id
      LEFT JOIN users ON products.seller_id = users.id
      WHERE products.id = $1
    `;
    const result = await pool.query(query, [id]);
    
    const resObj = result.rows[0];
    if (!resObj) return res.status(404).json({ message: "Product not found" });
    if (resObj.images && typeof resObj.images === 'string') {
      try { resObj.images = JSON.parse(resObj.images); } catch(e) { resObj.images = []; }
    }
    if (resObj.item_specifics && typeof resObj.item_specifics === 'string') {
      try { resObj.item_specifics = JSON.parse(resObj.item_specifics); } catch(e) { resObj.item_specifics = {}; }
    }
    if (resObj.condition_details && typeof resObj.condition_details === 'string') {
      try { resObj.condition_details = JSON.parse(resObj.condition_details); } catch(e) { resObj.condition_details = {}; }
    }
    if (resObj.shipping_info && typeof resObj.shipping_info === 'string') {
      try { resObj.shipping_info = JSON.parse(resObj.shipping_info); } catch(e) { resObj.shipping_info = {}; }
    }
    if (resObj.payment_info && typeof resObj.payment_info === 'string') {
      try { resObj.payment_info = JSON.parse(resObj.payment_info); } catch(e) { resObj.payment_info = {}; }
    }

    res.json(resObj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const categoriesResult = await pool.query("SELECT * FROM categories ORDER BY name ASC");
    const specsResult = await pool.query("SELECT * FROM category_specs ORDER BY id ASC");
    const conditionResult = await pool.query("SELECT * FROM condition_templates ORDER BY id ASC");

    const categoriesWithSpecs = categoriesResult.rows.map(cat => ({
      ...cat,
      specs: specsResult.rows.filter(spec => spec.category_id === cat.id),
      conditions: conditionResult.rows.filter(c => c.category_id === cat.id)
    }));

    res.json(categoriesWithSpecs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};