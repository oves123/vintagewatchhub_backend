-- Missing tables migration file

-- 1. Rate Limit Log
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id SERIAL PRIMARY KEY,
  identifier VARCHAR(255) NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Visitor Logs
CREATE TABLE IF NOT EXISTS visitor_logs (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(255) NOT NULL,
  user_agent TEXT,
  visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Typing Indicators
CREATE TABLE IF NOT EXISTS typing_indicators (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chat_id, user_id)
);

-- 4. Product Deals
CREATE TABLE IF NOT EXISTS product_deals (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL,
  buyer_id INTEGER,
  seller_id INTEGER NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  shipping_fee NUMERIC(10, 2),
  shipping_type VARCHAR(50),
  status VARCHAR(50) NOT NULL,
  expires_at TIMESTAMP,
  commission_rate NUMERIC(5, 2),
  commission_amount NUMERIC(10, 2),
  platform_gst_amount NUMERIC(10, 2),
  total_platform_fee NUMERIC(10, 2),
  seller_payout NUMERIC(10, 2),
  seller_gst_applicable BOOLEAN,
  seller_gst_number VARCHAR(100),
  payment_status VARCHAR(50),
  tcs_rate NUMERIC(5, 2),
  tcs_amount NUMERIC(10, 2),
  buyer_commission_rate NUMERIC(5, 2),
  buyer_commission_amount NUMERIC(10, 2),
  seller_commission_rate NUMERIC(5, 2),
  seller_commission_amount NUMERIC(10, 2),
  escrow_status VARCHAR(50),
  payment_receipt VARCHAR(255),
  payment_method VARCHAR(50),
  tracking_number VARCHAR(255),
  courier_name VARCHAR(255),
  packing_video VARCHAR(255),
  is_insured BOOLEAN DEFAULT FALSE,
  shipped_at TIMESTAMP,
  seller_delivered_at TIMESTAMP,
  buyer_confirmed_at TIMESTAMP,
  unboxing_video VARCHAR(255),
  payout_status VARCHAR(50),
  payout_released_at TIMESTAMP,
  cancel_reason TEXT,
  dispute_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Admin Audit Logs
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER,
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(255),
  entity_id VARCHAR(255),
  details TEXT,
  ip_address VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER,
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(255),
  entity_id VARCHAR(255),
  details TEXT,
  ip_address VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Price Alerts
CREATE TABLE IF NOT EXISTS price_alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  target_price NUMERIC(10, 2) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  triggered BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Payout Batches
CREATE TABLE IF NOT EXISTS payout_batches (
  id SERIAL PRIMARY KEY,
  batch_name VARCHAR(255),
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Escrow Payments (as seen in payoutBatchController)
CREATE TABLE IF NOT EXISTS escrow_payments (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER,
  seller_id INTEGER,
  amount NUMERIC(10, 2),
  status VARCHAR(50),
  released_by INTEGER,
  released_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
