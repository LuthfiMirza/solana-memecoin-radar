CREATE DATABASE IF NOT EXISTS memecoin_scanner CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE memecoin_scanner;

CREATE TABLE IF NOT EXISTS tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token_address VARCHAR(64) NOT NULL,
  symbol VARCHAR(32) NULL,
  name VARCHAR(255) NULL,
  pair_address VARCHAR(128) NULL,
  dex_id VARCHAR(64) NULL,
  price_usd DECIMAL(30, 12) NULL,
  liquidity_usd DECIMAL(20, 2) NOT NULL DEFAULT 0,
  volume_24h_usd DECIMAL(20, 2) NOT NULL DEFAULT 0,
  market_cap_usd DECIMAL(20, 2) NOT NULL DEFAULT 0,
  top_holder_percent DECIMAL(8, 4) NULL,
  buy_sell_ratio DECIMAL(12, 4) NOT NULL DEFAULT 0,
  smart_wallet_count INT UNSIGNED NOT NULL DEFAULT 0,
  whale_entry_count INT UNSIGNED NOT NULL DEFAULT 0,
  rug_status VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
  rug_score DECIMAL(10, 4) NULL,
  score INT NOT NULL DEFAULT 0,
  `signal` ENUM('BUY','WATCH','AVOID') NOT NULL DEFAULT 'AVOID',
  ai_summary TEXT NULL,
  first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_scanned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  raw_json JSON NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tokens_token_address (token_address),
  KEY idx_tokens_signal_score (`signal`, score),
  KEY idx_tokens_last_scanned_at (last_scanned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS signals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token_id BIGINT UNSIGNED NOT NULL,
  token_address VARCHAR(64) NOT NULL,
  `signal` ENUM('BUY','WATCH','AVOID') NOT NULL,
  score INT NOT NULL,
  message TEXT NOT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_signals_token_address (token_address),
  KEY idx_signals_sent_at (sent_at),
  CONSTRAINT fk_signals_token_id FOREIGN KEY (token_id) REFERENCES tokens(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portfolio (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token_address VARCHAR(64) NOT NULL,
  symbol VARCHAR(32) NULL,
  entry_price DECIMAL(30, 12) NOT NULL,
  take_profit_percent DECIMAL(10, 2) NOT NULL,
  take_profit_price DECIMAL(30, 12) NOT NULL,
  stop_loss_price DECIMAL(30, 12) NOT NULL,
  ath_price DECIMAL(30, 12) NOT NULL,
  current_price DECIMAL(30, 12) NULL,
  pnl_percent DECIMAL(12, 4) NULL,
  `status` ENUM('ACTIVE','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  close_price DECIMAL(30, 12) NULL,
  close_reason VARCHAR(64) NULL,
  opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_portfolio_active_token (token_address, `status`),
  KEY idx_portfolio_status (`status`),
  KEY idx_portfolio_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS smart_wallets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  wallet_address VARCHAR(64) NOT NULL,
  label VARCHAR(128) NULL,
  win_rate DECIMAL(6, 2) NULL,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_smart_wallets_wallet_address (wallet_address),
  KEY idx_smart_wallets_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
