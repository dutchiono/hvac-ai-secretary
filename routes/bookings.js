const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const nodemailer = require('nodemailer');

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// POST /api/bookings - Create new booking from customer form
router.post('/', async (req, res) => {
  const {
    name,
    phone,
    email,
    service,
    datetime,
    message
  } = req.body;

  try {
    // Validate required fields
    if (!name || !phone || !service) {
      return res.status(400).json({
        success: false,
        message: 'Name, phone, and service are required'
      });
    }

    // Send email notification
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: process.env.NOTIFICATION_EMAIL || process.env.GMAIL_USER,
      subject: `New Booking Request - ${service}`,
      html: `
        <h2>New Booking Request</h2>
        <p><strong>Customer:</strong> ${name}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Email:</strong> ${email || 'Not provided'}</p>
        <p><strong>Service:</strong> ${service}</p>
        <p><strong>Preferred Date/Time:</strong> ${datetime || 'Not specified'}</p>
        <p><strong>Message:</strong></p>
        <p>${message || 'No additional message'}</p>
        <hr>
        <p><em>Received at: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</em></p>
      `
    };

    await transporter.sendMail(mailOptions);

    // Store in database if pool is available
    let requestId = null;
    if (pool) {
      try {
        const result = await pool.query(
          `INSERT INTO bookings (customer_name, phone, email, service, preferred_datetime, message, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           RETURNING id`,
          [name, phone, email || null, service, datetime || null, message || null]
        );
        requestId = result.rows[0].id;
      } catch (dbError) {
        console.error('Database storage failed (email sent successfully):', dbError.message);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Booking request received! We will contact you shortly.',
      request_id: requestId
    });

  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process booking request',
      error: error.message
    });
  }
});

// GET /api/bookings/:id - Get specific booking details
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        sr.request_id,
        sr.status,
        sr.priority,
        sr.preferred_date,
        sr.preferred_time,
        sr.scheduled_date,
        sr.scheduled_time,
        sr.notes,
        sr.issue_description,
        c.name as customer_name,
        c.phone,
        c.email,
        c.address,
        c.city,
        c.state,
        c.zip,
        st.service_name,
        st.base_price,
        t.name as tech_name,
        t.phone as tech_phone
      FROM SERVICE_REQUESTS sr
      JOIN CUSTOMERS c ON sr.customer_id = c.customer_id
      LEFT JOIN SERVICE_TYPES st ON sr.service_type_id = st.service_type_id
      LEFT JOIN TECHNICIANS t ON sr.assigned_tech_id = t.tech_id
      WHERE sr.request_id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    res.json({ success: true, booking: result.rows[0] });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve booking' });
  }
});

module.exports = router;
