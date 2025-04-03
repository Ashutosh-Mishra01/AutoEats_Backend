const { 
  getUserOrderHistory, 
  addUserInteraction, 
  incrementOrderCounter, 
  getOrderCounter, 
  resetOrderCounter,
  RETRAINING_THRESHOLD,
  MAX_RECOMMENDATIONS
} = require('../services/recommendation.service');

const { 
  hybridRecommendations 
} = require('../services/recommendation.algorithm');

const { Recommendation } = require('../models/recommendationModel');
const Restaurant = require('../models/restaurant.model');
const Food = require('../models/food.model');

module.exports = {
  /**
   * Get personalized recommendations for a user
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Object} - Recommendations for restaurants and food items
   */
  getRecommendations: async (req, res) => {
    try {
      const user = req.user;
      
      // Check for existing fresh recommendations first
      const existingRecommendations = await Recommendation.find({
        user: user._id,
        createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      }).sort({ score: -1 });
      
      if (existingRecommendations.length >= MAX_RECOMMENDATIONS * 2) {
        // Group by item type
        const restaurants = [];
        const foods = [];
        
        for (const rec of existingRecommendations) {
          if (rec.itemType === 'Restaurant') {
            if (restaurants.length < MAX_RECOMMENDATIONS) {
              const restaurant = await Restaurant.findById(rec.item).populate('foods');
              if (restaurant && restaurant.open) {
                restaurants.push({
                  ...restaurant.toObject(),
                  score: rec.score,
                  confidence: rec.confidence,
                  reasons: rec.reasons
                });
              }
            }
          } else if (rec.itemType === 'Food') {
            if (foods.length < MAX_RECOMMENDATIONS) {
              const food = await Food.findById(rec.item);
              if (food && food.available) {
                foods.push({
                  ...food.toObject(),
                  score: rec.score,
                  confidence: rec.confidence,
                  reasons: rec.reasons
                });
              }
            }
          }
          
          // Mark as shown
          rec.shown = true;
          await rec.save();
        }
        
        if (restaurants.length >= MAX_RECOMMENDATIONS && foods.length >= MAX_RECOMMENDATIONS) {
          return res.status(200).json({
            restaurants,
            foods,
            isFromCache: true
          });
        }
      }
      
      // Generate fresh recommendations
      const recommendations = await hybridRecommendations(user._id);
      
      // Store recommendations in database
      await storeRecommendations(user._id, recommendations);
      
      res.status(200).json({
        ...recommendations,
        isFromCache: false
      });
    } catch (error) {
      console.error('Error getting recommendations:', error);
      res.status(500).json({ error: 'Failed to get recommendations' });
    }
  },
  
  /**
   * Track user interaction with recommendation
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Object} - Success message
   */
  trackInteraction: async (req, res) => {
    try {
      const { itemId, itemType, interactionType } = req.body;
      const user = req.user;
      
      if (!itemId || !itemType || !interactionType) {
        return res.status(400).json({ error: 'Invalid request parameters' });
      }
      
      // Add interaction
      await addUserInteraction({
        user: user._id,
        item: itemId,
        itemType,
        interactionType,
        timestamp: new Date()
      });
      
      // Update recommendation if exists
      if (interactionType === 'CLICK' || interactionType === 'ORDER') {
        const recommendation = await Recommendation.findOne({
          user: user._id,
          item: itemId,
          itemType
        });
        
        if (recommendation) {
          if (interactionType === 'CLICK') {
            recommendation.clicked = true;
          } else if (interactionType === 'ORDER') {
            recommendation.ordered = true;
          }
          await recommendation.save();
        }
      }
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error tracking interaction:', error);
      res.status(500).json({ error: 'Failed to track interaction' });
    }
  },
  
  /**
   * Get recommendation retraining status
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Object} - Retraining status
   */
  getRetrainingStatus: async (req, res) => {
    try {
      const counter = await getOrderCounter();
      
      res.status(200).json({
        currentCounter: counter.counter,
        threshold: RETRAINING_THRESHOLD,
        lastResetAt: counter.lastResetAt,
        progress: (counter.counter / RETRAINING_THRESHOLD) * 100
      });
    } catch (error) {
      console.error('Error getting retraining status:', error);
      res.status(500).json({ error: 'Failed to get retraining status' });
    }
  },
  
  /**
   * Manually trigger retraining
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Object} - Success message
   */
  triggerRetraining: async (req, res) => {
    try {
      // Reset counter
      await resetOrderCounter();
      
      // Invalidate existing recommendations
      await Recommendation.deleteMany({});
      
      res.status(200).json({ success: true, message: 'Retraining triggered successfully' });
    } catch (error) {
      console.error('Error triggering retraining:', error);
      res.status(500).json({ error: 'Failed to trigger retraining' });
    }
  }
};

/**
 * Store recommendations in database
 * @param {String} userId - User ID
 * @param {Object} recommendations - Recommendations for restaurants and foods
 */
async function storeRecommendations(userId, recommendations) {
  try {
    const currentModelVersion = 1; // Replace with actual version retrieval
    
    // Store restaurant recommendations
    for (const restaurant of recommendations.restaurants) {
      await Recommendation.create({
        user: userId,
        item: restaurant._id,
        itemType: 'Restaurant',
        score: restaurant.score,
        confidence: restaurant.confidence,
        reasons: restaurant.reasons,
        modelVersion: currentModelVersion
      });
    }
    
    // Store food recommendations
    for (const food of recommendations.foods) {
      await Recommendation.create({
        user: userId,
        item: food._id,
        itemType: 'Food',
        score: food.score,
        confidence: food.confidence,
        reasons: food.reasons,
        modelVersion: currentModelVersion
      });
    }
  } catch (error) {
    console.error('Error storing recommendations:', error);
    throw new Error('Failed to store recommendations');
  }
} 