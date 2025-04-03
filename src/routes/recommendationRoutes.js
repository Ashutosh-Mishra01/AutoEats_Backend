const express = require('express');
const router = express.Router();
const recommendationController = require('../controllers/recommendationController');
const authenticate = require('../midleware/authenticate');

// Get personalized recommendations
router.get('/', authenticate, recommendationController.getRecommendations);

// Track user interaction with recommended item
router.post('/track', authenticate, recommendationController.trackInteraction);

// Get retraining status
router.get('/retraining-status', authenticate, recommendationController.getRetrainingStatus);

// Manually trigger retraining (admin only)
router.post('/trigger-retraining', authenticate, (req, res, next) => {
  // Check if user is admin
  if (req.user && (req.user.role === 'ROLE_ADMIN' || req.user.role === 'ROLE_RESTAURANT_OWNER')) {
    next();
  } else {
    res.status(403).json({ error: 'Unauthorized' });
  }
}, recommendationController.triggerRetraining);

module.exports = router; 