-- Signal Performance Data Foundation
-- Phase B migration: non-destructive, do not run automatically.
-- Existing signals remain valid; historical rows keep price_at_signal = NULL.

USE memecoin_scanner;

ALTER TABLE signals
  ADD COLUMN price_at_signal DECIMAL(30, 12) NULL AFTER score;

CREATE TABLE IF NOT EXISTS signal_evaluations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  signal_id BIGINT UNSIGNED NOT NULL,
  token_id BIGINT UNSIGNED NULL,
  token_address VARCHAR(64) NOT NULL,
  signal_type VARCHAR(16) NOT NULL,
  entry_price DECIMAL(30, 12) NULL,
  signal_score INT NOT NULL,
  rug_status_at_signal VARCHAR(32) NULL,
  liquidity_at_signal DECIMAL(20, 2) NULL,
  top_holder_percent_at_signal DECIMAL(8, 4) NULL,
  buy_sell_ratio_at_signal DECIMAL(12, 4) NULL,
  signal_created_at DATETIME NOT NULL,
  price_15m DECIMAL(30, 12) NULL,
  price_1h DECIMAL(30, 12) NULL,
  price_6h DECIMAL(30, 12) NULL,
  price_24h DECIMAL(30, 12) NULL,
  return_15m_percent DECIMAL(12, 4) NULL,
  return_1h_percent DECIMAL(12, 4) NULL,
  return_6h_percent DECIMAL(12, 4) NULL,
  return_24h_percent DECIMAL(12, 4) NULL,
  max_price DECIMAL(30, 12) NULL,
  min_price DECIMAL(30, 12) NULL,
  max_return_percent DECIMAL(12, 4) NULL,
  max_drawdown_percent DECIMAL(12, 4) NULL COMMENT 'Minimum observed return versus entry; not peak-to-trough drawdown.',
  max_price_at DATETIME NULL,
  min_price_at DATETIME NULL,
  tp_20_hit_at DATETIME NULL,
  sl_10_hit_at DATETIME NULL,
  first_exit_event VARCHAR(32) NULL,
  first_exit_event_at DATETIME NULL,
  outcome VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  evaluation_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  data_quality VARCHAR(32) NOT NULL DEFAULT 'PARTIAL',
  eligible_for_strategy TINYINT(1) NOT NULL DEFAULT 0,
  rejection_reasons JSON NULL,
  completed_at DATETIME NULL,
  last_checked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_signal_evaluations_signal_id (signal_id),
  KEY idx_signal_evaluations_status (evaluation_status),
  KEY idx_signal_evaluations_signal_created_at (signal_created_at),
  KEY idx_signal_evaluations_token_address (token_address),
  KEY idx_signal_evaluations_scheduler (evaluation_status, signal_created_at, last_checked_at),
  CONSTRAINT fk_signal_evaluations_signal_id FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS signal_price_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  signal_id BIGINT UNSIGNED NOT NULL,
  token_address VARCHAR(64) NOT NULL,
  price_usd DECIMAL(30, 12) NULL,
  captured_at DATETIME NOT NULL,
  captured_bucket DATETIME NOT NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'dexscreener_latest',
  provider_status VARCHAR(32) NOT NULL DEFAULT 'OK',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_signal_price_snapshots_bucket (signal_id, captured_bucket),
  KEY idx_signal_price_snapshots_signal_captured (signal_id, captured_at),
  KEY idx_signal_price_snapshots_token_address (token_address),
  CONSTRAINT fk_signal_price_snapshots_signal_id FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rollback SQL (review before running):
-- DROP TABLE IF EXISTS signal_price_snapshots;
-- DROP TABLE IF EXISTS signal_evaluations;
-- ALTER TABLE signals DROP COLUMN price_at_signal;
