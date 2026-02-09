// Chat API Routes
const express = require('express');
const router = express.Router();
const { pool } = require('../server');
const { sendSMS } = require('../utils/sms');

// Start chat session
router.post('/start', async (req, res) => {
  try {
    const { customerName, customerPhone, customerEmail } = req.body;
    
    // Create or get customer
    let customer = await pool.query(
      'SELECT id FROM customers WHERE phone = $1',
      [customerPhone]
    );
    
    let customerId;
    if (customer.rows.length === 0) {
      const newCustomer = await pool.query(
        'INSERT INTO customers (first_name, last_name, phone, email) VALUES ($1, $2, $3, $4) RETURNING id',
        [customerName.split(' ')[0], customerName.split(' ').slice(1).join(' '), customerPhone, customerEmail]
      );
      customerId = newCustomer.rows[0].id;
    } else {
      customerId = customer.rows[0].id;
    }
    
    // Create chat session
    const session = await pool.query(
      'INSERT INTO chat_sessions (customer_id, started_at) VALUES ($1, NOW()) RETURNING id, started_at',
      [customerId]
    );
    
    res.json({
      success: true,
      sessionId: session.rows[0].id,
      customerId: customerId,
      message: `Hi ${customerName.split(' ')[0]}! 👋 How can I help you today?`
    });
    
  } catch (error) {
    console.error('Chat start error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send chat message
router.post('/message', async (req, res) => {
  try {
    const { sessionId, message, sender } = req.body;
    
    // Save message to database
    await pool.query(
      'INSERT INTO chat_sessions (id, messages) VALUES ($1, jsonb_build_array(jsonb_build_object(\'sender\', $2, \'message\', $3, \'timestamp\', NOW())))',
      [sessionId, sender, message]
    );
    
    // AI Response logic (simplified - you'll integrate with OpenAI/Claude here)
    let aiResponse = await generateAIResponse(message);
    
    // Save AI response
    await pool.query(
      'UPDATE chat_sessions SET messages = messages || jsonb_build_array(jsonb_build_object(\'sender\', \'ai\', \'message\', $1, \'timestamp\', NOW())) WHERE id = $2',
      [aiResponse, sessionId]
    );
    
    res.json({
      success: true,
      response: aiResponse
    });
    
  } catch (error) {
    console.error('Chat message error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Simple AI response generator (replace with actual AI integration)
async function generateAIResponse(message) {
  const lowerMsg = message.toLowerCase();
  
  // Emergency detection
  if (lowerMsg.includes('emergency') || lowerMsg.includes('urgent') || lowerMsg.includes('not working')) {
    return "I understand this is urgent. Let me get your information and we'll have a technician contact you within 15 minutes. What's your address?";
  }
  
  // Booking request
  if (lowerMsg.includes('appointment') || lowerMsg.includes('schedule') || lowerMsg.includes('book')) {
    return "I'd be happy to schedule an appointment for you. What type of service do you need? (AC repair, heating, maintenance, etc.)";
  }
  
  // Pricing question
  if (lowerMsg.includes('cost') || lowerMsg.includes('price') || lowerMsg.includes('how much')) {
    return "Service call fees start at $89. The total cost depends on the specific repair needed. Would you like to schedule a diagnostic appointment?";
  }
  
  // Default
  return "I can help you with:\n• Schedule an appointment\n• Emergency service\n• Pricing information\n• Service history\n\nWhat would you like to do?";
}

// Get chat history
router.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM chat_sessions WHERE id = $1',
      [sessionId]
    );
    
    res.json({
      success: true,
      session: result.rows[0]
    });
    
  } catch (error) {
    console.error('Chat history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
