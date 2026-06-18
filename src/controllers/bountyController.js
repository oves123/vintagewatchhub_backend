const pool = require("../config/db");

// Get all active bounties (public)
exports.getAllBounties = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT b.*, u.name as buyer_name, u.profile_image as buyer_image
            FROM bounties b
            JOIN users u ON b.user_id = u.id
            WHERE b.status = 'ACTIVE'
            ORDER BY b.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching bounties:", err);
        res.status(500).json({ error: "Failed to fetch bounties" });
    }
};

// Get bounties for logged in user
exports.getUserBounties = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            "SELECT * FROM bounties WHERE user_id = $1 ORDER BY created_at DESC",
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching user bounties:", err);
        res.status(500).json({ error: "Failed to fetch your bounties" });
    }
};

// Create a new bounty
exports.createBounty = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { brand, model, reference_number, year_range, condition_req, budget } = req.body;
        const userId = req.user.id;
        
        if (!brand || !model || !budget) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "Brand, model, and budget are required" });
        }

        const result = await client.query(
            `INSERT INTO bounties (user_id, brand, model, reference_number, year_range, condition_req, budget) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [userId, brand, model, reference_number || null, year_range || null, condition_req || null, budget]
        );
        
        await client.query("COMMIT");
        res.status(201).json({ message: "Bounty created successfully", bounty: result.rows[0] });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error creating bounty:", err);
        res.status(500).json({ error: "Failed to create bounty" });
    } finally {
        client.release();
    }
};

// Find matching bounties for a seller's product
exports.findMatchesForProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const sellerId = req.user.id;
        
        // Ensure product belongs to seller
        const prodCheck = await pool.query("SELECT brand, model, price, status FROM products WHERE id = $1 AND seller_id = $2", [productId, sellerId]);
        if (prodCheck.rows.length === 0) {
            return res.status(404).json({ error: "Product not found or doesn't belong to you" });
        }
        
        const product = prodCheck.rows[0];
        
        // Find bounties that match the brand and model, and where budget >= price
        // (Case-insensitive matching for brand and model)
        const result = await pool.query(`
            SELECT b.*, u.name as buyer_name, u.profile_image as buyer_image
            FROM bounties b
            JOIN users u ON b.user_id = u.id
            WHERE b.status = 'ACTIVE' 
              AND b.brand ILIKE $1
              AND b.model ILIKE $2
              AND b.budget >= $3
            ORDER BY b.budget DESC
        `, [product.brand, product.model, product.price]);
        
        res.json(result.rows);
    } catch (err) {
        console.error("Error finding matches:", err);
        res.status(500).json({ error: "Failed to find matches" });
    }
};
