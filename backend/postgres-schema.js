const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    username VARCHAR(80) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    profile BYTEA,
    profile_type VARCHAR(50) DEFAULT 'image/jpeg',
    street VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    zip VARCHAR(20),
    country VARCHAR(100) DEFAULT 'India',
    is_active SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS lands (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    land_name VARCHAR(150) NOT NULL,
    size NUMERIC(10,2),
    crop VARCHAR(100),
    soil_type VARCHAR(100),
    ph NUMERIC(4,2),
    moisture NUMERIC(5,2),
    temperature NUMERIC(5,2),
    light VARCHAR(100),
    other_info TEXT,
    street VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    zip VARCHAR(20),
    country VARCHAR(100) DEFAULT 'India',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    customer_name VARCHAR(150),
    customer_phone VARCHAR(20),
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2),
    item_total NUMERIC(10,2),
    address TEXT,
    payment_method VARCHAR(50),
    coupon_code VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending','processing','shipped','delivered','cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS ai_chats (
    chat_id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES chat_sessions(session_id) ON DELETE SET NULL,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    sender VARCHAR(10) NOT NULL CHECK (sender IN ('user','ai')),
    message TEXT NOT NULL,
    tokens_used INTEGER,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS controls (
    id SERIAL PRIMARY KEY,
    function_name VARCHAR(100) NOT NULL UNIQUE,
    value TEXT,
    description VARCHAR(500),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS devusers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    password VARCHAR(255) NOT NULL,
    uic VARCHAR(255) UNIQUE,
    role VARCHAR(30) NOT NULL DEFAULT 'developer'
      CHECK (role IN ('superadmin','admin','developer','viewer')),
    is_active SMALLINT DEFAULT 1,
    profile BYTEA,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS dev_login_logs (
    id SERIAL PRIMARY KEY,
    dev_id INTEGER,
    dev_email VARCHAR(255),
    dev_name VARCHAR(150),
    method VARCHAR(20) NOT NULL DEFAULT 'email',
    ip_address VARCHAR(64),
    user_agent VARCHAR(512),
    success SMALLINT DEFAULT 1,
    fail_reason VARCHAR(255),
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS dev_tokens (
    id SERIAL PRIMARY KEY,
    dev_id INTEGER NOT NULL,
    token VARCHAR(512) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS soil_tests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    land_id INTEGER REFERENCES lands(id) ON DELETE SET NULL,
    ph NUMERIC(4,2),
    moisture NUMERIC(5,2),
    temperature NUMERIC(5,2),
    nitrogen NUMERIC(6,2),
    phosphorus NUMERIC(6,2),
    potassium NUMERIC(6,2),
    desired_crop VARCHAR(100),
    rule_result TEXT,
    ai_result TEXT,
    tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    name VARCHAR(150),
    email VARCHAR(255),
    message TEXT NOT NULL,
    rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
    category VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS idx_lands_user_created ON lands(user_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)",
  "CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_active ON chat_sessions(user_id, ended_at)",
  "CREATE INDEX IF NOT EXISTS idx_ai_chats_user_timestamp ON ai_chats(user_id, timestamp)",
  "CREATE INDEX IF NOT EXISTS idx_dev_tokens_expires ON dev_tokens(expires_at)",
  "CREATE INDEX IF NOT EXISTS idx_dev_login_logs_time ON dev_login_logs(login_time DESC)",
  "CREATE INDEX IF NOT EXISTS idx_soil_tests_user_tested ON soil_tests(user_id, tested_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC)",
  `INSERT INTO controls (function_name, value, description) VALUES
    ('cookie_expiry_days', '7', 'How many days auth cookie stays valid'),
    ('chat_enabled', 'true', 'Enable/disable AI chat feature'),
    ('recommend_enabled', 'true', 'Enable/disable soil recommendation'),
    ('shop_enabled', 'true', 'Enable/disable AgroShop'),
    ('maintenance_mode', 'false', 'If true, show maintenance page to users'),
    ('max_lands_per_user', '10', 'Max number of lands a user can add'),
    ('chat_history_limit', '50', 'Number of chat messages to keep in history')
    ON CONFLICT (function_name) DO NOTHING`
];

export async function initializePostgresSchema(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const statement of SCHEMA_STATEMENTS) {
      await client.query(statement);
    }
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}
