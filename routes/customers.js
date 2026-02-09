// Customers API Routes
const express = require('express');
const router = express.Router();
const { pool } = require('../server');

// Get customer by phone
router.get('/phone/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM customers WHERE phone = $1',
      [phone]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    
    res.json({
      success: true,
      customer: result.rows[0]
    });
    
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create customer
router.post('/create', async (req, res) => {
  try {
    const { firstName, lastName, phone, email, address } = req.body;
    
    const result = await pool.query(
      `INSERT INTO customers (first_name, last_name, phone, email, address) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [firstName, lastName, phone, email, address]
    );
    
    res.json({
      success: true,
      customer: result.rows[0]
    });
    
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update customer
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phone, email, address } = req.body;
    
    const result = await pool.query(
      `UPDATE customers 
       SET first_name = $1, last_name = $2, phone = $3, email = $4, address = $5, updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [firstName, lastName, phone, email, address, id]
    );
    
    res.json({
      success: true,
      customer: result.rows[0]
    });
    
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
