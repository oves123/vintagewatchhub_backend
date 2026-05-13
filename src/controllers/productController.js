const pool = require("../config/db");
const slugify = require("../utils/slugify");
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
      allow_offers,
      reserve_price,
      video_settings,
      media_order,
      shipping_scope
    } = req.body;

    let mappedVideoSettings = {};
    try {
      mappedVideoSettings = typeof video_settings === 'string' ? JSON.parse(video_settings) : (video_settings || {});
    } catch (e) {
      mappedVideoSettings = {};
    }

    const fileMap = {};
    if (req.files && req.files.length > 0) {
      req.files.forEach(f => {
        const normalizedPath = f.path.replace(/\\/g, '/');
        fileMap[f.originalname] = normalizedPath;
        if (mappedVideoSettings[f.originalname]) {
          mappedVideoSettings[normalizedPath] = mappedVideoSettings[f.originalname];
          delete mappedVideoSettings[f.originalname];
        }
      });
    }

    let images = [];
    if (media_order) {
      try {
        const orderArr = typeof media_order === 'string' ? JSON.parse(media_order) : media_order;
        images = orderArr.map(item => fileMap[item] || item);
      } catch (e) {
        images = Object.values(fileMap);
      }
    } else {
      images = Object.values(fileMap);
    }
    const hasVideo = images.some(img => img.match(/\.(mp4|mov|webm|quicktime|avi|mkv)$/i));

    const isTrue = (v) => v === true || v === 'true';
    const optionsCount = [isTrue(allow_buy_now), isTrue(allow_auction), isTrue(allow_offers)].filter(Boolean).length;
    if (optionsCount > 2) {
      return res.status(400).json({ error: "You can select a maximum of two listing options (Buy Now, Auction, or Offers)." });
    }

    if (status !== 'draft' && !hasVideo) {
      return res.status(400).json({ error: "At least one video is mandatory for listing." });
    }

    // Auto-approve for verified sellers
    let finalStatus = status || 'pending';
    const userResult = await pool.query("SELECT is_verified FROM users WHERE id = $1", [seller_id]);
    if (userResult.rows.length > 0 && userResult.rows[0].is_verified) {
      finalStatus = 'approved';
    }

    const baseSlug = slugify(title);
    const slug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

    const result = await pool.query(
      `INSERT INTO products
      (title, description, price, seller_id, category_id, product_type, images, 
       condition_code, item_specifics, condition_details, shipping_info, payment_info, status, shipping_fee, shipping_type,
       allow_buy_now, buy_it_now_price, allow_auction, starting_bid, auction_end, allow_offers, reserve_price, video_settings, shipping_scope, slug)
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
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
        isTrue(allow_buy_now),
        buy_it_now_price || null,
        isTrue(allow_auction),
        starting_bid || 0,
        auction_end || null,
        isTrue(allow_offers),
        reserve_price || 0,
        JSON.stringify(mappedVideoSettings),
        shipping_scope || 'LOCAL',
        slug
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
      allow_buy_now, buy_it_now_price, allow_auction, starting_bid, auction_end, allow_offers, reserve_price,
      existing_images, video_settings, media_order, shipping_scope
    } = req.body;

    // Listing Options Validation (Max 2 out of 3)
    const isTrue = (v) => v === true || v === 'true';
    const optionsCount = [isTrue(allow_buy_now), isTrue(allow_auction), isTrue(allow_offers)].filter(Boolean).length;
    if (optionsCount > 2) {
      return res.status(400).json({ error: "You can select a maximum of two listing options (Buy Now, Auction, or Offers)." });
    }

    // Ownership and existence check
    const currentProductResult = await pool.query("SELECT * FROM products WHERE id = $1", [id]);
    if (currentProductResult.rows.length === 0) return res.status(404).json({ message: "Product not found" });
    
    const product = currentProductResult.rows[0];
    const requesterId = req.user.id;
    const requesterRole = req.user.role;

    // Only allow seller or admin to update
    if (parseInt(product.seller_id) !== parseInt(requesterId) && requesterRole !== 'admin') {
      return res.status(403).json({ message: "Access denied. You can only update your own listings." });
    }

    // Status logic: If already approved, keep it approved unless explicitly changed
    let finalStatus = status;
    if (product.status === 'approved' && status === 'pending') {
      finalStatus = 'approved';
    }

    // Media Logic: Merge existing images with new uploads
    let finalImages = [];
    if (existing_images) {
      try {
        finalImages = typeof existing_images === 'string' ? JSON.parse(existing_images) : existing_images;
      } catch (e) {
        finalImages = [];
      }
    }

    let mappedVideoSettings = {};
    try {
      mappedVideoSettings = typeof video_settings === 'string' ? JSON.parse(video_settings) : (video_settings || {});
    } catch (e) {
      mappedVideoSettings = {};
    }

    const fileMap = {};
    if (req.files && req.files.length > 0) {
      req.files.forEach(f => {
        const normalizedPath = f.path.replace(/\\/g, '/');
        fileMap[f.originalname] = normalizedPath;
        // If settings were sent using the original filename, map them to the new path
        if (mappedVideoSettings[f.originalname]) {
          mappedVideoSettings[normalizedPath] = mappedVideoSettings[f.originalname];
          delete mappedVideoSettings[f.originalname];
        }
      });
    }

    if (media_order) {
      try {
        const orderArr = typeof media_order === 'string' ? JSON.parse(media_order) : media_order;
        finalImages = orderArr.map(item => fileMap[item] || item);
      } catch (e) {
        finalImages = [...finalImages, ...Object.values(fileMap)];
      }
    } else {
      finalImages = [...finalImages, ...Object.values(fileMap)];
    }

    const baseSlug = slugify(title);
    const slug = `${baseSlug}-${id.toString().slice(-4)}`;

    const result = await pool.query(
      `UPDATE products SET 
        title = $1, description = $2, price = $3, category_id = $4, product_type = $5, 
        condition_code = $6, item_specifics = $7, condition_details = $8, 
        shipping_info = $9, payment_info = $10, status = $11,
        shipping_fee = $12, shipping_type = $13,
        allow_buy_now = $14, buy_it_now_price = $15, allow_auction = $16,
        starting_bid = $17, auction_end = $18, allow_offers = $19, reserve_price = $20,
        images = $21, video_settings = $22, shipping_scope = $23, slug = $24
      WHERE id = $25 RETURNING *`,
      [
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
        finalStatus, 
        shipping_fee || 0,
        shipping_type || 'fixed',
        isTrue(allow_buy_now),
        buy_it_now_price || null,
        isTrue(allow_auction),
        starting_bid || 0,
        auction_end || null,
        isTrue(allow_offers),
        reserve_price || 0,
        JSON.stringify(finalImages),
        JSON.stringify(mappedVideoSettings),
        shipping_scope || 'LOCAL',
        slug,
        id
      ]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: "Product not found" });

    res.json({ message: "Product updated successfully", product: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = req.user.id;
    const requesterRole = req.user.role;

    // Check ownership
    const productRes = await pool.query("SELECT seller_id FROM products WHERE id = $1", [id]);
    if (productRes.rows.length === 0) return res.status(404).json({ message: "Product not found" });
    
    if (parseInt(productRes.rows[0].seller_id) !== parseInt(requesterId) && requesterRole !== 'admin') {
      return res.status(403).json({ message: "Access denied. You can only delete your own listings." });
    }
    
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
    const requesterId = req.user.id;

    if (parseInt(userId) !== parseInt(requesterId)) {
      return res.status(403).json({ message: "Access denied." });
    }
    const result = await pool.query(
      `SELECT products.*, categories.name as category_name,
              (SELECT COUNT(*) FROM watchlist WHERE product_id = products.id) as watchlist_count,
              (SELECT COUNT(*) FROM product_views WHERE product_id = products.id) as view_count
       FROM products 
       LEFT JOIN categories ON products.category_id = categories.id 
       WHERE seller_id = $1 
       ORDER BY id DESC`,
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
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const isNumeric = /^\d+$/.test(id);

    // Increment views (Unique per user/IP)
    let viewCheck;
    const isRealUser = viewerId && viewerId !== 'null' && viewerId !== 'undefined';
    
    if (isRealUser) {
      viewCheck = await pool.query(
        "SELECT id FROM product_views WHERE product_id = (SELECT id FROM products WHERE id::text = $1 OR slug = $1 LIMIT 1) AND (user_id = $2 OR ip_address = $3)",
        [id, viewerId, ip]
      );
    } else {
      viewCheck = await pool.query(
        "SELECT id FROM product_views WHERE product_id = (SELECT id FROM products WHERE id::text = $1 OR slug = $1 LIMIT 1) AND ip_address = $2",
        [id, ip]
      );
    }

    const query = `
      SELECT products.*, categories.name AS category_name,
             users.name AS seller_name, users.city AS seller_city, users.state AS seller_state,
             users.is_verified AS seller_verified, users.seller_badge, users.rating AS seller_rating,
             (SELECT COUNT(*) FROM watchlist WHERE product_id = products.id) as wishlist_count
      FROM products
      LEFT JOIN categories ON products.category_id = categories.id
      LEFT JOIN users ON products.seller_id = users.id
      WHERE products.${isNumeric ? 'id' : 'slug'} = $1
    `;

    const result = await pool.query(query, [isNumeric ? parseInt(id) : id]);

    if (result.rows.length === 0) return res.status(404).json({ message: "Product not found" });

    const resObj = result.rows[0];

    if (viewCheck.rows.length === 0) {
      await pool.query(
        "INSERT INTO product_views (product_id, user_id, ip_address) VALUES ($1, $2, $3)",
        [resObj.id, isRealUser ? viewerId : null, ip]
      );
      await pool.query("UPDATE products SET views = views + 1 WHERE id = $1", [resObj.id]);
    }

    // Parse JSON fields
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
    console.error("Get Product Error:", error);
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

exports.updateProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const requesterId = req.user.id;
    const requesterRole = req.user.role;

    // Check ownership
    const productRes = await pool.query("SELECT seller_id, status FROM products WHERE id = $1", [id]);
    if (productRes.rows.length === 0) return res.status(404).json({ message: "Product not found" });
    
    const product = productRes.rows[0];

    if (parseInt(product.seller_id) !== parseInt(requesterId) && requesterRole !== 'admin') {
      return res.status(403).json({ message: "Access denied." });
    }

    // Restriction: Sellers cannot approve their own products if they were rejected or pending
    // But they can probably mark as 'sold' or 'inactive'
    // For now, let's allow it but we might want to restrict 'approved' status if we want admin control.
    
    const result = await pool.query(
      "UPDATE products SET status = $1 WHERE id = $2 RETURNING *",
      [status, id]
    );

    res.json({ message: "Status updated", product: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.recordProductView = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user ? req.user.id : null;
    const ip_address = req.ip;

    await pool.query(
      "INSERT INTO product_views (product_id, user_id, ip_address) VALUES ($1, $2, $3)",
      [id, user_id, ip_address]
    );

    res.json({ message: "View recorded" });
  } catch (error) {
    console.error("View recording failed:", error.message);
    res.status(200).json({ message: "View record failed silently" });
  }
};