-- Database Schema Dump --

-- Table: orders
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL,
  product_id integer,
  buyer_id integer,
  seller_id integer,
  price numeric,
  status character varying(30) DEFAULT 'pending'::character varying,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  payment_status character varying(50) DEFAULT 'Pending'::character varying,
  payment_method character varying(50),
  tracking_number character varying(100),
  PRIMARY KEY (id)
);

-- Table: bids
CREATE TABLE IF NOT EXISTS bids (
  id SERIAL,
  product_id integer,
  user_id integer,
  bid_amount numeric,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- Table: user_addresses
CREATE TABLE IF NOT EXISTS user_addresses (
  id SERIAL,
  user_id integer,
  address text,
  city character varying(100),
  state character varying(100),
  pincode character varying(10),
  country character varying(50),
  PRIMARY KEY (id)
);

-- Table: product_images
CREATE TABLE IF NOT EXISTS product_images (
  id SERIAL,
  product_id integer,
  image_url text,
  PRIMARY KEY (id)
);

-- Table: auction_results
CREATE TABLE IF NOT EXISTS auction_results (
  id SERIAL,
  product_id integer,
  winner_id integer,
  winning_bid numeric,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- Table: categories
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL,
  name character varying(100),
  parent_id integer,
  PRIMARY KEY (id)
);

-- Table: payments
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL,
  order_id integer,
  amount numeric,
  payment_method character varying(50),
  payment_status character varying(20),
  transaction_id character varying(200),
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- Table: shipments
CREATE TABLE IF NOT EXISTS shipments (
  id SERIAL,
  order_id integer,
  courier_name character varying(100),
  tracking_number character varying(100),
  status character varying(20),
  shipped_at timestamp without time zone,
  PRIMARY KEY (id)
);

-- Table: watchlist
CREATE TABLE IF NOT EXISTS watchlist (
  id SERIAL,
  user_id integer,
  product_id integer,
  PRIMARY KEY (id)
);

-- Table: product_views
CREATE TABLE IF NOT EXISTS product_views (
  id SERIAL,
  product_id integer,
  user_id integer,
  viewed_at timestamp without time zone,
  PRIMARY KEY (id)
);

-- Table: seller_verification
CREATE TABLE IF NOT EXISTS seller_verification (
  id SERIAL,
  user_id integer,
  document_url text,
  status character varying(20),
  created_at timestamp without time zone,
  PRIMARY KEY (id)
);

-- Table: condition_templates
CREATE TABLE IF NOT EXISTS condition_templates (
  id SERIAL,
  category_id integer,
  field_name character varying(100) NOT NULL,
  field_label character varying(100) NOT NULL,
  field_type character varying(50) DEFAULT 'select'::character varying,
  options jsonb DEFAULT '["Excellent", "Good", "Fair", "Not Working"]'::jsonb,
  PRIMARY KEY (id)
);

-- Table: chats
CREATE TABLE IF NOT EXISTS chats (
  id SERIAL,
  product_id integer,
  buyer_id integer,
  seller_id integer,
  created_at timestamp without time zone DEFAULT now(),
  PRIMARY KEY (id)
);

-- Table: messages
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL,
  chat_id integer,
  sender_id integer,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  type character varying(50) DEFAULT 'text'::character varying,
  metadata jsonb,
  PRIMARY KEY (id)
);

-- Table: visitor_logs
CREATE TABLE IF NOT EXISTS visitor_logs (
  id SERIAL,
  ip_address character varying(45),
  user_agent text,
  visited_at timestamp without time zone DEFAULT now(),
  PRIMARY KEY (id)
);

-- Table: product_offers
CREATE TABLE IF NOT EXISTS product_offers (
  id SERIAL,
  product_id integer,
  buyer_id integer,
  seller_id integer,
  amount numeric NOT NULL,
  status character varying(50) DEFAULT 'pending'::character varying,
  counter_amount numeric,
  offer_count integer DEFAULT 1,
  message text,
  created_at timestamp without time zone DEFAULT now(),
  expires_at timestamp without time zone,
  PRIMARY KEY (id)
);

-- Table: category_specs
CREATE TABLE IF NOT EXISTS category_specs (
  id SERIAL,
  category_id integer,
  field_name character varying(100) NOT NULL,
  field_label character varying(100) NOT NULL,
  field_type character varying(50) DEFAULT 'text'::character varying,
  options jsonb,
  is_required boolean DEFAULT false,
  PRIMARY KEY (id)
);

-- Table: platform_settings
CREATE TABLE IF NOT EXISTS platform_settings (
  key character varying(100) NOT NULL,
  value text,
  updated_by integer,
  updated_at timestamp without time zone DEFAULT now(),
  PRIMARY KEY (key)
);

-- Table: watch_vault
CREATE TABLE IF NOT EXISTS watch_vault (
  id SERIAL,
  user_id integer,
  watch_name character varying(255) NOT NULL,
  brand character varying(100),
  year character varying(20),
  image_url character varying(255),
  created_at timestamp without time zone DEFAULT now(),
  PRIMARY KEY (id)
);

-- Table: reviews
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL,
  product_id integer,
  user_id integer,
  rating integer,
  comment text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  seller_id integer,
  order_id integer,
  PRIMARY KEY (id)
);

-- Table: security_logs
CREATE TABLE IF NOT EXISTS security_logs (
  id SERIAL,
  user_id integer,
  type character varying(50) NOT NULL,
  content text,
  metadata jsonb,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- Table: admin_audit_logs
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id SERIAL,
  admin_id integer,
  action character varying(255) NOT NULL,
  target_type character varying(50),
  target_id integer,
  details text,
  ip_address character varying(45),
  created_at timestamp without time zone DEFAULT now(),
  PRIMARY KEY (id)
);

-- Table: notifications
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL,
  user_id integer,
  message text,
  is_read boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  type character varying(20) DEFAULT 'info'::character varying,
  title character varying(255),
  link character varying(255),
  PRIMARY KEY (id)
);

-- Table: ui_labels
CREATE TABLE IF NOT EXISTS ui_labels (
  key character varying(255) NOT NULL,
  value text NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (key)
);

-- Table: quick_replies
CREATE TABLE IF NOT EXISTS quick_replies (
  id SERIAL,
  text text NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- Table: users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL,
  name character varying(100),
  email character varying(100),
  password text,
  role character varying(20) DEFAULT 'user'::character varying,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  phone character varying(20),
  bio text,
  profile_image character varying(255),
  shipping_address jsonb DEFAULT '{}'::jsonb,
  payment_methods jsonb DEFAULT '[]'::jsonb,
  is_verified boolean DEFAULT false,
  seller_badge character varying(50),
  rating numeric DEFAULT 0,
  total_sold integer DEFAULT 0,
  total_bought integer DEFAULT 0,
  preferences jsonb DEFAULT '{"newsletter": false, "notifications": true}'::jsonb,
  joined_date timestamp without time zone DEFAULT now(),
  reset_password_token text,
  reset_password_expires timestamp without time zone,
  is_active boolean DEFAULT true,
  address text,
  city text,
  state text,
  pincode text,
  terms_accepted boolean DEFAULT false,
  PRIMARY KEY (id)
);

-- Table: banners
CREATE TABLE IF NOT EXISTS banners (
  id SERIAL,
  title character varying(255),
  subtitle text,
  image_url text NOT NULL,
  link_url character varying(255),
  type character varying(50) DEFAULT 'hero'::character varying,
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- Table: products
CREATE TABLE IF NOT EXISTS products (
  id SERIAL,
  title character varying(255),
  description text,
  price numeric,
  seller_id integer,
  category_id integer,
  product_type character varying(20),
  auction_end timestamp without time zone,
  image character varying(255),
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  item_specifics jsonb DEFAULT '{}'::jsonb,
  status character varying(50) DEFAULT 'approved'::character varying,
  images jsonb DEFAULT '[]'::jsonb,
  condition_code character varying(50),
  condition_details jsonb DEFAULT '{}'::jsonb,
  shipping_info jsonb DEFAULT '{}'::jsonb,
  payment_info jsonb DEFAULT '{}'::jsonb,
  allow_offers boolean DEFAULT false,
  buy_it_now_price numeric,
  views integer DEFAULT 0,
  shipping_fee numeric DEFAULT 0,
  shipping_type character varying(50) DEFAULT 'fixed'::character varying,
  PRIMARY KEY (id)
);

-- Table: product_deals
CREATE TABLE IF NOT EXISTS product_deals (
  id SERIAL,
  product_id integer,
  seller_id integer,
  buyer_id integer,
  offer_id integer,
  amount numeric NOT NULL,
  status character varying(50) DEFAULT 'accepted'::character varying,
  tracking_number character varying(100),
  expires_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  cancel_reason text,
  dispute_reason text,
  shipped_at timestamp without time zone,
  delivered_at timestamp without time zone,
  buyer_confirmed_at timestamp without time zone,
  seller_delivered_at timestamp without time zone,
  payment_status character varying DEFAULT 'PENDING'::character varying,
  payment_method character varying,
  payment_receipt text,
  courier_name character varying(255),
  PRIMARY KEY (id)
);

-- Table: reports
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL,
  reporter_id integer,
  reported_user_id integer,
  product_id integer,
  reason character varying(100) NOT NULL,
  description text,
  status character varying(20) DEFAULT 'pending'::character varying,
  admin_notes text,
  created_at timestamp without time zone DEFAULT now(),
  resolved_at timestamp without time zone,
  PRIMARY KEY (id)
);

-- Constraints --
ALTER TABLE condition_templates ADD CONSTRAINT condition_templates_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);
ALTER TABLE chats ADD CONSTRAINT chats_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE chats ADD CONSTRAINT chats_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES users(id);
ALTER TABLE chats ADD CONSTRAINT chats_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES users(id);
ALTER TABLE messages ADD CONSTRAINT messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES chats(id);
ALTER TABLE messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id);
ALTER TABLE product_offers ADD CONSTRAINT product_offers_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE product_offers ADD CONSTRAINT product_offers_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES users(id);
ALTER TABLE product_offers ADD CONSTRAINT product_offers_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES users(id);
ALTER TABLE category_specs ADD CONSTRAINT category_specs_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);
ALTER TABLE platform_settings ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE watch_vault ADD CONSTRAINT watch_vault_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE reviews ADD CONSTRAINT reviews_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES users(id);
ALTER TABLE reviews ADD CONSTRAINT reviews_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
ALTER TABLE security_logs ADD CONSTRAINT security_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES users(id);
ALTER TABLE product_deals ADD CONSTRAINT product_deals_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE product_deals ADD CONSTRAINT product_deals_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES users(id);
ALTER TABLE product_deals ADD CONSTRAINT product_deals_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES users(id);
ALTER TABLE product_deals ADD CONSTRAINT product_deals_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES product_offers(id);
ALTER TABLE reports ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES users(id);
ALTER TABLE reports ADD CONSTRAINT reports_reported_user_id_fkey FOREIGN KEY (reported_user_id) REFERENCES users(id);
ALTER TABLE reports ADD CONSTRAINT reports_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
