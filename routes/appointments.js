// Appointments API Routes
const express = require('express');
const router = express.Router();
const { pool } = require('../server');
const { sendSMS } = require('../utils/sms');

// Create appointment
router.post('/create', async (req, res) => {
  try {
    const { customerId, serviceType, scheduledDate, notes, urgency } = req.body;
    
    const result = await pool.query(
      `INSERT INTO appointments 
       (customer_id, service_type, scheduled_date, notes, urgency, status) 
       VALUES ($1, $2, $3, $4, $5, 'pending') 
       RETURNING *`,
      [customerId, serviceType, scheduledDate, notes, urgency || 'normal']
    );
    
    const appointment = result.rows[0];
    
    // Get customer phone for SMS confirmation
    const customer = await pool.query(
      'SELECT phone, first_name FROM customers WHERE id = $1',
      [customerId]
    );
    
    if (customer.rows.length > 0) {
      const { phone, first_name } = customer.rows[0];
      
      // Send SMS confirmation
      await sendSMS(phone, 'appointmentConfirmation', {
        businessName: process.env.BUSINESS_NAME,
        customerName: first_name,
        serviceType: serviceType,
        date: new Date(scheduledDate).toLocaleDateString(),
        time: new Date(scheduledDate).toLocaleTimeString(),
        businessPhone: process.env.BUSINESS_PHONE
      });
    }
    
    res.json({
      success: true,
      appointment: appointment
    });
    
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get available time slots
router.get('/availability', async (req, res) => {
  try {
    const { date } = req.query;
    
    // Simple availability logic (you can enhance this)
    const slots = [
      '08:00', '09:00', '10:00', '11:00',
      '13:00', '14:00', '15:00', '16:00', '17:00'
    ];
    
    // Get booked slots for the date
    const booked = await pool.query(
      `SELECT DATE_PART('hour', scheduled_date) as hour 
       FROM appointments 
       WHERE DATE(scheduled_date) = $1 
       AND status NOT IN ('cancelled', 'completed')`,
      [date]
    );
    
    const bookedHours = booked.rows.map(row => `${String(row.hour).padStart(2, '0')}:00`);
    const available = slots.filter(slot => !bookedHours.includes(slot));
    
    res.json({
      success: true,
      date: date,
      availableSlots: available
    });
    
  } catch (error) {
    console.error('Availability check error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get appointments
router.get('/list', async (req, res) => {
  try {
    const { customerId, status, date } = req.query;
    
    let query = 'SELECT a.*, c.first_name, c.last_name, c.phone FROM appointments a JOIN customers c ON a.customer_id = c.id WHERE 1=1';
    const params = [];
    
    if (customerId) {
      params.push(customerId);
      query += ` AND a.customer_id = $${params.length}`;
    }
    
    if (status) {
      params.push(status);
      query += ` AND a.status = $${params.length}`;
    }
    
    if (date) {
      params.push(date);
      query += ` AND DATE(a.scheduled_date) = $${params.length}`;
    }
    
    query += ' ORDER BY a.scheduled_date ASC';
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      appointments: result.rows
    });
    
  } catch (error) {
    console.error('List appointments error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update appointment status
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const result = await pool.query(
      'UPDATE appointments SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );
    
    res.json({
      success: true,
      appointment: result.rows[0]
    });
    
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
