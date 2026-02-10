// HVAC AI Secretary - Main Server
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('✓ Database connected:', res.rows[0].now);
  }
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Routes
const chatRoutes = require('./routes/chat');
const smsRoutes = require('./routes/sms');
const appointmentRoutes = require('./routes/appointments');
const customerRoutes = require('./routes/customers');

app.use('/api/chat', chatRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/customers', customerRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV 
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 HVAC AI Secretary running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV}`);
  console.log(`   Database: ${process.env.DB_NAME}`);
  console.log(`   Business: ${process.env.BUSINESS_NAME}\n`);
});

module.exports = { app, pool };
