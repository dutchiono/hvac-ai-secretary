// Chat API Routes
const express = require('express');
const router = express.Router();
const { pool } = require('../server');
const { sendSMS } = require('../utils/sms');
const OpenAI = require('openai');
const axios = require('axios');

let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// System prompt with real M. Jacob Company information
const SYSTEM_PROMPT = `You are the AI assistant for M. Jacob Company, a local, family-owned heating and air conditioning business serving the greater Pittsburgh area.

COMPANY INFORMATION:
- Business Name: M. Jacob Company
- Owner: Mark Jacob
- Phone: 412-512-0425
- Service Area: Pittsburgh and surrounding areas
- Business Type: Local, family-owned HVAC company
- Reputation: Professional, knowledgeable, and efficient

SERVICES OFFERED:
1. Heater Repair - Expert furnace and heating system diagnostics and repairs
2. A/C Repair - Air conditioning system troubleshooting and repair
3. System Installation - Complete HVAC system installation for new and replacement units
4. Fan Motor Replacement - Blower motor and fan component replacement
5. Preventative Maintenance Plan - Scheduled maintenance to keep systems running efficiently
6. Hot Water Tank Change Out and Repair - Water heater installation, replacement, and repair

CUSTOMER SERVICE APPROACH:
- Friendly, helpful, and professional tone
- Quick response times, especially for emergencies
- Family-oriented service with personal attention
- Years of trusted service with local customers
- Free quotes available

YOUR ROLE:
- Answer questions about HVAC services, pricing, and scheduling
- Help customers book appointments
- Provide general HVAC advice and troubleshooting tips
- Recognize emergency situations (no heat in winter, no AC in summer, gas smell, etc.)
- Collect customer information when needed
- Always end conversations by offering to schedule service or provide contact information

EMERGENCY INDICATORS:
- No heat in winter
- No AC during hot weather
- Gas smell or carbon monoxide concerns
- Water leaks from HVAC systems
- Strange noises or burning smells
- System completely not working

For emergencies, prioritize getting customer contact information and address for immediate dispatch.

Keep responses conversational, warm, and helpful - like talking to a trusted local business owner.`;

// Function definitions for OpenAI
const FUNCTIONS = [
  {
    name: "check_availability",
    description: "Check available appointment time slots in the calendar. Use this when customers ask about scheduling, available times, or booking appointments.",
    parameters: {
      type: "object",
      properties: {
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format (e.g., 2026-02-10)"
        },
        endDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format (e.g., 2026-02-17)"
        }
      },
      required: ["startDate", "endDate"]
    }
  }
];

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
      message: `Hi ${customerName.split(' ')[0]}! 👋 I'm the AI assistant for M. Jacob Company. How can I help you today?`
    });

  } catch (error) {
    console.error('Chat start error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to query availability
async function queryAvailability(startDate, endDate) {
  try {
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
    const response = await axios.get(`${baseUrl}/api/availability`, {
      params: { startDate, endDate }
    });
    return response.data;
  } catch (error) {
    console.error('Error querying availability:', error);
    throw error;
  }
}

// Send chat message
router.post('/message', async (req, res) => {
  try {
    if (!openai) {
      return res.json({ success: true, response: 'Chat is not configured yet. Please set up the OPENAI_API_KEY environment variable.' });
    }
    const { sessionId, message, sender } = req.body;

    // Save message to database
    await pool.query(
      'INSERT INTO chat_sessions (id, messages) VALUES ($1, jsonb_build_array(jsonb_build_object(\'sender\', $2, \'message\', $3, \'timestamp\', NOW())))',
      [sessionId, sender, message]
    );

    // Get conversation history
    const history = await pool.query(
      'SELECT messages FROM chat_sessions WHERE id = $1',
      [sessionId]
    );

    // Build messages array for OpenAI
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT }
    ];

    // Add conversation history
    if (history.rows[0]?.messages) {
      history.rows[0].messages.forEach(msg => {
        messages.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.message
        });
      });
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    // Generate AI response using OpenAI with function calling
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: messages,
      functions: FUNCTIONS,
      function_call: 'auto',
      temperature: 0.7,
      max_tokens: 500
    });

    const responseMessage = completion.choices[0].message;
    let aiResponse = '';

    // Check if AI wants to call a function
    if (responseMessage.function_call) {
      const functionName = responseMessage.function_call.name;
      const functionArgs = JSON.parse(responseMessage.function_call.arguments);

      if (functionName === 'check_availability') {
        // Query the availability API
        const availabilityData = await queryAvailability(
          functionArgs.startDate,
          functionArgs.endDate
        );

        // Add function response to messages
        messages.push(responseMessage);
        messages.push({
          role: 'function',
          name: functionName,
          content: JSON.stringify(availabilityData)
        });

        // Get final response from AI with availability data
        const secondCompletion = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: messages,
          temperature: 0.7,
          max_tokens: 500
        });

        aiResponse = secondCompletion.choices[0].message.content;
      }
    } else {
      aiResponse = responseMessage.content;
    }

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

module.exports = router;