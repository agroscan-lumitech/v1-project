CREATE TABLE IF NOT EXISTS users (
  user_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  profile MEDIUMBLOB,
  profile_type VARCHAR(50) DEFAULT 'image/jpeg',
  street VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  zip VARCHAR(20),
  country VARCHAR(100) DEFAULT 'India',
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_username (username),
  INDEX idx_phone (phone),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lands (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  land_name VARCHAR(150) NOT NULL,
  size DECIMAL(10,2),
  crop VARCHAR(100),
  soil_type VARCHAR(100),
  ph DECIMAL(4,2),
  moisture DECIMAL(5,2),
  temperature DECIMAL(5,2),
  light VARCHAR(100),
  other_info TEXT,
  street VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  zip VARCHAR(20),
  country VARCHAR(100) DEFAULT 'India',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  customer_name VARCHAR(150),
  customer_phone VARCHAR(20),
  product_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2),
  item_total DECIMAL(10,2),
  address TEXT,
  payment_method VARCHAR(50),
  coupon_code VARCHAR(50),
  status ENUM('pending','processing','shipped','delivered','cancelled') DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user_active (user_id, ended_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_chats (
  chat_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED,
  user_id INT UNSIGNED NOT NULL,
  sender ENUM('user','ai') NOT NULL,
  message TEXT NOT NULL,
  tokens_used INT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_session_id (session_id),
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS controls (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  function_name VARCHAR(100) NOT NULL UNIQUE,
  value TEXT,
  description VARCHAR(500),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_function_name (function_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS devusers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20),
  password VARCHAR(255) NOT NULL,
  uic VARCHAR(255) UNIQUE,
  role ENUM('superadmin','admin','developer','viewer') DEFAULT 'developer',
  is_active TINYINT(1) DEFAULT 1,
  profile MEDIUMBLOB,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_uic (uic),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dev_login_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dev_id INT UNSIGNED,
  dev_email VARCHAR(255),
  dev_name VARCHAR(150),
  method ENUM('email','uic') DEFAULT 'email',
  ip_address VARCHAR(64),
  user_agent VARCHAR(512),
  success TINYINT(1) DEFAULT 1,
  fail_reason VARCHAR(255),
  login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dev_id (dev_id),
  INDEX idx_time (login_time),
  INDEX idx_success (success),
  INDEX idx_ip (ip_address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dev_tokens (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dev_id INT UNSIGNED NOT NULL,
  token VARCHAR(512) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  UNIQUE KEY uq_token (token(255)),
  INDEX idx_dev_id (dev_id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS soil_tests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  land_id INT UNSIGNED,
  ph DECIMAL(4,2),
  moisture DECIMAL(5,2),
  temperature DECIMAL(5,2),
  nitrogen DECIMAL(6,2),
  phosphorus DECIMAL(6,2),
  potassium DECIMAL(6,2),
  desired_crop VARCHAR(100),
  rule_result TEXT,
  ai_result TEXT,
  tested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_land_id (land_id),
  INDEX idx_tested (tested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS feedback (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED,
  name VARCHAR(150),
  email VARCHAR(255),
  message TEXT NOT NULL,
  rating TINYINT CHECK (rating BETWEEN 1 AND 5),
  category VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_rating (rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO controls (function_name, value, description) VALUES
('cookie_expiry_days', '7', 'How many days auth cookie stays valid'),
('chat_enabled', 'true', 'Enable or disable AI chat'),
('recommend_enabled', 'true', 'Enable or disable soil recommendation'),
('shop_enabled', 'true', 'Enable or disable AgroShop'),
('maintenance_mode', 'false', 'If true, show maintenance page to users'),
('max_lands_per_user', '10', 'Maximum number of lands per user'),
('chat_history_limit', '50', 'Maximum number of chat messages to keep');