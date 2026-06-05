const z = require("zod");

const schemas = {
  register: z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(6).max(100),
    phone: z.string().optional(),
  }),
  login: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
  createProduct: z.object({
    title: z.string().min(3).max(200),
    description: z.string().max(5000).optional(),
    price: z.string().or(z.number()).refine(v => parseFloat(v) > 0, "Price must be positive"),
    category_id: z.string().or(z.number()).optional(),
    condition_code: z.string().optional(),
    product_type: z.enum(["fixed", "auction", "hybrid"]).optional(),
  }),
  placeBid: z.object({
    product_id: z.number().int().positive(),
    user_id: z.number().int().positive(),
    bid_amount: z.number().positive(),
  }),
  createOffer: z.object({
    product_id: z.number().int().positive(),
    buyer_id: z.number().int().positive(),
    seller_id: z.number().int().positive(),
    amount: z.number().positive(),
    message: z.string().max(1000).optional(),
  }),
  sendMessage: z.object({
    chat_id: z.number().int().positive(),
    sender_id: z.number().int().positive(),
    message: z.string().min(1).max(10000),
    type: z.enum(["text", "image", "video", "offer", "system", "system_deal"]).optional(),
    metadata: z.record(z.any()).optional(),
  }),
  createOrder: z.object({
    product_id: z.number().int().positive(),
    buyer_id: z.number().int().positive(),
  }),
  createChat: z.object({
    product_id: z.number().int().positive(),
    buyer_id: z.number().int().positive(),
    seller_id: z.number().int().positive(),
  }),
};

exports.validate = (schemaName) => {
  const schema = schemas[schemaName];
  if (!schema) {
    return (req, res, next) => next();
  }
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field: e.path.join("."),
        message: e.message,
      }));
      return res.status(400).json({ error: "Validation failed", details: errors });
    }
    req.body = result.data;
    next();
  };
};

exports.schemas = schemas;
