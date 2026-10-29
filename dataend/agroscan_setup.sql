-- ============================================================
-- AgroScan Database — Complete Setup Script
-- ============================================================
-- Run this file once in MySQL to create the entire database.
-- Command: mysql -u root -p < agroscan_setup.sql
-- Or paste inside phpMyAdmin / MySQL Workbench
-- ============================================================

-- Create and use database
CREATE DATABASE IF NOT EXISTS agroscan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE agroscan;

-- ============================================================
-- TABLE 1: users
-- Regular app users (farmers, students)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  user_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150)  NOT NULL,
  username      VARCHAR(80)   NOT NULL UNIQUE,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  phone         VARCHAR(20)   NOT NULL UNIQUE,
  password      VARCHAR(255)  NOT NULL,   -- bcrypt hashed
  profile       MEDIUMBLOB,               -- profile picture binary (max 16MB)
  profile_type  VARCHAR(50)  DEFAULT 'image/jpeg',
  street        VARCHAR(255),
  city          VARCHAR(100),
  state         VARCHAR(100),
  zip           VARCHAR(20),
  country       VARCHAR(100)  DEFAULT 'India',
  is_active     TINYINT(1)   DEFAULT 1,
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email    (email),
  INDEX idx_username (username),
  INDEX idx_phone    (phone),
  INDEX idx_active   (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 2: lands
-- Agricultural lands/plots owned by users
-- ============================================================
CREATE TABLE IF NOT EXISTS lands (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  land_name   VARCHAR(150) NOT NULL,
  size        DECIMAL(10,2),           -- in acres
  crop        VARCHAR(100),
  soil_type   VARCHAR(100),
  ph          DECIMAL(4,2),            -- e.g. 6.50
  moisture    DECIMAL(5,2),            -- percentage
  temperature DECIMAL(5,2),            -- Celsius
  light       VARCHAR(100),
  other_info  TEXT,
  street      VARCHAR(255),
  city        VARCHAR(100),
  state       VARCHAR(100),
  zip         VARCHAR(20),
  country     VARCHAR(100) DEFAULT 'India',
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user_id   (user_id),
  INDEX idx_created   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 3: orders
-- Product orders placed by users (from AgroShop)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL,
  customer_name   VARCHAR(150),
  customer_phone  VARCHAR(20),
  product_name    VARCHAR(255) NOT NULL,
  quantity        INT          NOT NULL DEFAULT 1,
  unit_price      DECIMAL(10,2),
  item_total      DECIMAL(10,2),
  address         TEXT,
  payment_method  VARCHAR(50),
  coupon_code     VARCHAR(50),
  status          ENUM('pending','processing','shipped','delivered','cancelled') DEFAULT 'pending',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user_id  (user_id),
  INDEX idx_status   (status),
  INDEX idx_created  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 4: chat_sessions
-- Chat session tracking (one session = one conversation thread)
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  started_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at    DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user_active (user_id, ended_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 5: ai_chats
-- Individual chat messages (user + AI)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_chats (
  chat_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id  INT UNSIGNED,
  user_id     INT UNSIGNED NOT NULL,
  sender      ENUM('user','ai') NOT NULL,
  message     TEXT NOT NULL,
  tokens_used INT,
  timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user_id    (user_id),
  INDEX idx_session_id (session_id),
  INDEX idx_timestamp  (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 6: controls
-- Feature flags and system configuration toggles
-- ============================================================
CREATE TABLE IF NOT EXISTS controls (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  function_name VARCHAR(100) NOT NULL UNIQUE,
  value         TEXT,
  description   VARCHAR(500),
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_function_name (function_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default controls
INSERT IGNORE INTO controls (function_name, value, description) VALUES
  ('cookie_expiry_days',  '7',      'How many days auth cookie stays valid'),
  ('chat_enabled',        'true',   'Enable/disable AI chat feature'),
  ('recommend_enabled',   'true',   'Enable/disable soil recommendation'),
  ('shop_enabled',        'true',   'Enable/disable AgroShop'),
  ('maintenance_mode',    'false',  'If true, show maintenance page to users'),
  ('max_lands_per_user',  '10',     'Max number of lands a user can add'),
  ('chat_history_limit',  '50',     'Number of chat messages to keep in history');

-- ============================================================
-- TABLE 7: devusers
-- Developer/admin panel users (separate from regular users)
-- ============================================================
CREATE TABLE IF NOT EXISTS devusers (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  phone       VARCHAR(20),
  password    VARCHAR(255) NOT NULL,  -- bcrypt hashed
  uic         VARCHAR(255) UNIQUE,    -- Unique Integration Code for QR login
  role        ENUM('superadmin','admin','developer','viewer') DEFAULT 'developer',
  is_active   TINYINT(1) DEFAULT 1,
  profile     MEDIUMBLOB,             -- dev profile picture
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email    (email),
  INDEX idx_uic      (uic),
  INDEX idx_active   (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 8: dev_login_logs
-- Every dev login attempt — success and failure — with IP + timestamp
-- ============================================================
CREATE TABLE IF NOT EXISTS dev_login_logs (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dev_id      INT UNSIGNED,
  dev_email   VARCHAR(255),
  dev_name    VARCHAR(150),
  method      ENUM('email','uic') DEFAULT 'email',
  ip_address  VARCHAR(64),
  user_agent  VARCHAR(512),
  success     TINYINT(1) DEFAULT 1,
  fail_reason VARCHAR(255),
  login_time  DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dev_id    (dev_id),
  INDEX idx_time      (login_time),
  INDEX idx_success   (success),
  INDEX idx_ip        (ip_address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 9: dev_tokens
-- Session auth tokens for developer panel (24hr expiry)
-- ============================================================
CREATE TABLE IF NOT EXISTS dev_tokens (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dev_id      INT UNSIGNED NOT NULL,
  token       VARCHAR(512) NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME,
  UNIQUE KEY uq_token (token(255)),
  INDEX idx_dev_id  (dev_id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 10: soil_tests
-- Historical soil test records per land
-- ============================================================
CREATE TABLE IF NOT EXISTS soil_tests (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  land_id      INT UNSIGNED,
  ph           DECIMAL(4,2),
  moisture     DECIMAL(5,2),
  temperature  DECIMAL(5,2),
  nitrogen     DECIMAL(6,2),
  phosphorus   DECIMAL(6,2),
  potassium    DECIMAL(6,2),
  desired_crop VARCHAR(100),
  rule_result  TEXT,       -- JSON of rule engine output
  ai_result    TEXT,       -- AI recommendation text
  tested_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_land_id (land_id),
  INDEX idx_tested  (tested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 11: feedback
-- User feedback and ratings
-- ============================================================
CREATE TABLE IF NOT EXISTS feedback (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED,
  name        VARCHAR(150),
  email       VARCHAR(255),
  message     TEXT NOT NULL,
  rating      TINYINT CHECK (rating BETWEEN 1 AND 5),
  category    VARCHAR(100),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_rating  (rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- STORED PROCEDURE: CleanExpiredTokens
-- Run as a cron/event to clear expired dev tokens
-- ============================================================
DELIMITER $$
CREATE PROCEDURE IF NOT EXISTS CleanExpiredTokens()
BEGIN
  DELETE FROM dev_tokens WHERE expires_at < NOW();
END$$
DELIMITER ;

-- Optional: MySQL Event to auto-clean tokens daily
-- Uncomment if your MySQL server has event_scheduler=ON
-- CREATE EVENT IF NOT EXISTS evt_clean_tokens
--   ON SCHEDULE EVERY 1 DAY
--   DO CALL CleanExpiredTokens();

-- ============================================================
-- VERIFICATION — Run these to confirm everything was created
-- ============================================================
-- SHOW TABLES;
-- DESCRIBE users;
-- DESCRIBE devusers;
-- DESCRIBE dev_login_logs;
-- DESCRIBE dev_tokens;
-- SELECT * FROM controls;

-- ============================================================
-- QUICK INSERT: Create first dev admin (password: Admin@1234)
-- Replace hash with your own bcrypt hash!
-- Generate: node -e "const b=require('bcrypt');b.hash('Admin@1234',10).then(console.log)"
-- ============================================================
-- INSERT IGNORE INTO devusers (name, email, password, role, uic) VALUES
--   ('Abhinav Ranjan', 'abhinav@agroscan.com', '$2b$10$REPLACE_WITH_REAL_BCRYPT_HASH', 'superadmin', 'AGRO-UIC-001');

SELECT 'AgroScan database setup complete!' AS status;
SELECT COUNT(*) AS tables_created FROM information_schema.tables WHERE table_schema = 'agroscan';
