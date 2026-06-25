require('dotenv').config();
const { pool } = require('../config/db');
const { runSignalEvaluatorOnce } = require('../services/signalEvaluator');

runSignalEvaluatorOnce()
  .catch((error) => {
    console.error(`Signal evaluator once failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
