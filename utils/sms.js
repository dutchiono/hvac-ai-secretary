// SMS Utility Functions
const twilio = require('twilio');

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.warn('Twilio credentials not configured - SMS disabled');
      return null;
    }
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

// SMS Templates
const templates = {
  appointmentConfirmation: (data) => 
    `Thanks for calling ${data.businessName}! Your ${data.serviceType} is scheduled for ${data.date} at ${data.time}. Reply CONFIRM or call ${data.businessPhone} to modify.`,
  
  appointmentReminder: (data) =>
    `Reminder: ${data.businessName} appointment tomorrow at ${data.time} for ${data.serviceType}. Reply CONFIRM or RESCHEDULE.`,
  
  techEnRoute: (data) =>
    `Good news! ${data.techName} is on the way to your location. ETA: ${data.eta} minutes. Track: ${data.trackingLink}`,
  
  serviceComplete: (data) =>
    `Your ${data.serviceType} is complete! Total: $${data.amount}. Pay now: ${data.paymentLink} or we can bill you.`,
  
  paymentReminder: (data) =>
    `Friendly reminder: Invoice #${data.invoiceNumber} for $${data.amount} is due ${data.dueDate}. Pay online: ${data.paymentLink}`,
  
  reviewRequest: (data) =>
    `Thanks for choosing ${data.businessName}! How did we do? Leave a review: ${data.reviewLink}`,
  
  emergencyResponse: (data) =>
    `We received your emergency request. ${data.techName} will contact you within 15 minutes at ${data.customerPhone}. Help is on the way!`,
  
  followUpMaintenance: (data) =>
    `Hi ${data.customerName}! It's been ${data.monthsSince} months since your last ${data.serviceType}. Reply YES to book maintenance or call ${data.businessPhone}.`
};

// Send SMS
async function sendSMS(to, templateName, data) {
  try {
    const message = templates[templateName](data);
    
    const twilioClient = getClient();
    if (!twilioClient) return { success: false, error: 'Twilio not configured' };
    const result = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to
    });
    
    console.log(`SMS sent to ${to}: ${result.sid}`);
    
    // Log to database
    const { pool } = require('../server');
    await pool.query(
      'INSERT INTO sms_logs (phone_number, message, template_name, status, twilio_sid) VALUES ($1, $2, $3, $4, $5)',
      [to, message, templateName, 'sent', result.sid]
    );
    
    return { success: true, sid: result.sid };
    
  } catch (error) {
    console.error('SMS send error:', error);
    return { success: false, error: error.message };
  }
}

// Batch send SMS
async function sendBatchSMS(recipients, templateName, data) {
  const results = [];
  
  for (const recipient of recipients) {
    const result = await sendSMS(recipient.phone, templateName, {
      ...data,
      ...recipient
    });
    results.push({ phone: recipient.phone, ...result });
  }
  
  return results;
}

module.exports = {
  sendSMS,
  sendBatchSMS,
  templates
};
