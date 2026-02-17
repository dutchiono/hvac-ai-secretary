const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// POST /api/tech/login - Simple tech login (basic auth by phone/name)
router.post('/login', async (req, res) => {
  const { phone, name } = req.body;

  if (!phone && !name) {
    return res.status(400).json({ 
      success: false, 
      message: 'Phone number or name required' 
    });
  }

  try {
    let query = 'SELECT tech_id, name, phone, email, specialization, status FROM TECHNICIANS WHERE ';
    let params = [];

    if (phone) {
      query += 'phone = $1';
      params.push(phone);
    } else {
      query += 'LOWER(name) = LOWER($1)';
      params.push(name);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Technician not found' 
      });
    }

    const tech = result.rows[0];

    res.json({ 
      success: true, 
      message: 'Login successful',
      tech: {
        tech_id: tech.tech_id,
        name: tech.name,
        phone: tech.phone,
        email: tech.email,
        specialization: tech.specialization,
        status: tech.status
      }
    });
  } catch (error) {
    console.error('Tech login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// GET /api/tech/:id/jobs - Get jobs assigned to specific tech
router.get('/:id/jobs', async (req, res) => {
  const techId = req.params.id;
  const { date, status } = req.query;

  try {
    let query = `
      SELECT 
        sr.request_id,
        sr.status,
        sr.priority,
        sr.scheduled_date,
        sr.scheduled_time,
        sr.notes,
        sr.issue_description,
        sr.actual_start_time,
        sr.actual_end_time,
        c.customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        c.address,
        c.city,
        c.state,
        c.zip,
        c.special_instructions,
        st.service_name,
        st.base_price,
        st.estimated_duration_minutes,
        e.equipment_type,
        e.brand,
        e.model_number,
        e.age_years,
        e.last_service_date
      FROM SERVICE_REQUESTS sr
      JOIN CUSTOMERS c ON sr.customer_id = c.customer_id
      LEFT JOIN SERVICE_TYPES st ON sr.service_type_id = st.service_type_id
      LEFT JOIN EQUIPMENT e ON c.customer_id = e.customer_id
      WHERE sr.assigned_tech_id = $1
    `;

    const params = [techId];
    let paramCount = 2;

    if (date) {
      query += ` AND sr.scheduled_date = $${paramCount}`;
      params.push(date);
      paramCount++;
    } else {
      // Default to today if no date specified
      query += ` AND sr.scheduled_date = CURRENT_DATE`;
    }

    if (status) {
      query += ` AND sr.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    } else {
      // Default to active jobs only
      query += ` AND sr.status IN ('scheduled', 'in_progress')`;
    }

    query += ` ORDER BY sr.scheduled_time ASC, sr.priority DESC`;

    const result = await pool.query(query, params);

    res.json({ 
      success: true, 
      jobs: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get tech jobs error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve jobs' });
  }
});

// PUT /api/tech/jobs/:id/start - Mark job as started
router.put('/jobs/:id/start', async (req, res) => {
  const requestId = req.params.id;

  try {
    const result = await pool.query(
      `UPDATE SERVICE_REQUESTS 
       SET status = 'in_progress',
           actual_start_time = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE request_id = $1 AND status = 'scheduled'
       RETURNING *`,
      [requestId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Job not found or already started' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Job started',
      job: result.rows[0]
    });
  } catch (error) {
    console.error('Start job error:', error);
    res.status(500).json({ success: false, message: 'Failed to start job' });
  }
});

// PUT /api/tech/jobs/:id/complete - Mark job as completed
router.put('/jobs/:id/complete', async (req, res) => {
  const requestId = req.params.id;
  const { work_performed, parts_used, tech_notes } = req.body;

  try {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Update service request
      const result = await client.query(
        `UPDATE SERVICE_REQUESTS 
         SET status = 'completed',
             actual_end_time = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE request_id = $1 AND status = 'in_progress'
         RETURNING *`,
        [requestId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ 
          success: false, 
          message: 'Job not found or not in progress' 
        });
      }

      const serviceRequest = result.rows[0];

      // Create service record
      await client.query(
        `INSERT INTO SERVICE_RECORDS 
         (request_id, customer_id, tech_id, service_date, work_performed, parts_used, tech_notes)
         VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6)`,
        [
          requestId,
          serviceRequest.customer_id,
          serviceRequest.assigned_tech_id,
          work_performed || 'Service completed',
          parts_used || '',
          tech_notes || ''
        ]
      );

      await client.query('COMMIT');

      res.json({ 
        success: true, 
        message: 'Job completed successfully',
        job: result.rows[0]
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Complete job error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete job' });
  }
});

// PUT /api/tech/jobs/:id/notes - Add notes to a job
router.put('/jobs/:id/notes', async (req, res) => {
  const requestId = req.params.id;
  const { notes } = req.body;

  if (!notes) {
    return res.status(400).json({ 
      success: false, 
      message: 'Notes are required' 
    });
  }

  try {
    const result = await pool.query(
      `UPDATE SERVICE_REQUESTS 
       SET notes = CASE 
         WHEN notes IS NULL OR notes = '' THEN $1
         ELSE notes || E'\\n\\n--- ' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI') || ' ---\\n' || $1
       END,
       updated_at = CURRENT_TIMESTAMP
       WHERE request_id = $2
       RETURNING *`,
      [notes, requestId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    res.json({ 
      success: true, 
      message: 'Notes added successfully',
      job: result.rows[0]
    });
  } catch (error) {
    console.error('Add notes error:', error);
    res.status(500).json({ success: false, message: 'Failed to add notes' });
  }
});

// GET /api/tech/:id/schedule - Get tech's schedule for the week
router.get('/:id/schedule', async (req, res) => {
  const techId = req.params.id;

  try {
    const result = await pool.query(
      `SELECT 
        sr.request_id,
        sr.status,
        sr.scheduled_date,
        sr.scheduled_time,
        c.name as customer_name,
        c.address,
        c.city,
        st.service_name,
        st.estimated_duration_minutes
      FROM SERVICE_REQUESTS sr
      JOIN CUSTOMERS c ON sr.customer_id = c.customer_id
      LEFT JOIN SERVICE_TYPES st ON sr.service_type_id = st.service_type_id
      WHERE sr.assigned_tech_id = $1
        AND sr.scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
        AND sr.status IN ('scheduled', 'in_progress')
      ORDER BY sr.scheduled_date, sr.scheduled_time`,
      [techId]
    );

    res.json({ 
      success: true, 
      schedule: result.rows 
    });
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve schedule' });
  }
});

module.exports = router;
