const express = require('express');
const router = express.Router();
const { sendSMS, sendBatchSMS, templates } = require('../utils/sms');

router.post('/send', async (req, res) => {
  try {
    const { to, message } = req.body;
    const result = await sendSMS(to, message);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/batch', async (req, res) => {
  try {
    const { recipients, message } = req.body;
    const results = await sendBatchSMS(recipients, message);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/templates', (req, res) => {
  res.json({ success: true, templates });
});

module.exports = router;
