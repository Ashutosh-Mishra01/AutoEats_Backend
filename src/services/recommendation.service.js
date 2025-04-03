const User = require('../models/user.model');
const Order = require('../models/order.model');
const Restaurant = require('../models/restaurant.model');
const Food = require('../models/food.model');
const { 
  RecommendationModel, 
  UserInteraction, 
  Recommendation, 
  OrderCounter 
} = require('../models/recommendationModel');

// Constants
const RETRAINING_THRESHOLD = 10; // Number of new orders before retraining
const SIMILARITY_THRESHOLD = 0.1; // Threshold for similarity
const MAX_RECOMMENDATIONS = 5; // Number of recommendations to return

// ==================== DATA ACCESS FUNCTIONS ====================

/**
 * Get user's order history
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Array>} - User's order history
 */
async function getUserOrderHistory(userId) {
  try {
    const orders = await Order.find({ customer: userId })
      .populate({
        path: 'items',
        populate: { path: 'food' }
      })
      .populate('restaurant')
      .sort({ createdAt: -1 });
    
    return orders;
  } catch (error) {
    console.error('Error getting user order history:', error);
    throw new Error('Failed to get user order history');
  }
}

/**
 * Get all restaurants with their menus
 * @returns {Promise<Array>} - All restaurants with menus
 */
async function getAllRestaurantsWithMenu() {
  try {
    const restaurants = await Restaurant.find({ open: true })
      .populate({
        path: 'foods',
        match: { available: true }
      });
    
    return restaurants;
  } catch (error) {
    console.error('Error getting restaurants with menu:', error);
    throw new Error('Failed to get restaurants with menu');
  }
}

/**
 * Get top ordered foods across all users
 * @param {Number} limit - Number of top foods to return
 * @returns {Promise<Array>} - Top ordered foods
 */
async function getTopOrderedFoods(limit = 10) {
  try {
    // Aggregate to find most ordered foods
    const orderItems = await Order.aggregate([
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'orderitems',
          localField: 'items',
          foreignField: '_id',
          as: 'orderItem'
        }
      },
      { $unwind: '$orderItem' },
      {
        $lookup: {
          from: 'foods',
          localField: 'orderItem.food',
          foreignField: '_id',
          as: 'foodItem'
        }
      },
      { $unwind: '$foodItem' },
      {
        $match: {
          'foodItem.available': true
        }
      },
      {
        $group: {
          _id: '$orderItem.food',
          count: { $sum: 1 },
          foodItem: { $first: '$foodItem' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]);
    
    return orderItems.map(item => ({
      ...item.foodItem,
      orderCount: item.count
    }));
  } catch (error) {
    console.error('Error getting top ordered foods:', error);
    throw new Error('Failed to get top ordered foods');
  }
}

/**
 * Get top rated restaurants
 * @param {Number} limit - Number of top restaurants to return
 * @returns {Promise<Array>} - Top rated restaurants
 */
async function getTopRatedRestaurants(limit = 10) {
  try {
    const restaurants = await Restaurant.find({ open: true })
      .sort({ numRating: -1 })
      .limit(limit);
    
    return restaurants;
  } catch (error) {
    console.error('Error getting top rated restaurants:', error);
    throw new Error('Failed to get top rated restaurants');
  }
}

/**
 * Get user interactions
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Array>} - User interactions
 */
async function getUserInteractions(userId) {
  try {
    const interactions = await UserInteraction.find({ user: userId })
      .sort({ timestamp: -1 });
    
    return interactions;
  } catch (error) {
    console.error('Error getting user interactions:', error);
    throw new Error('Failed to get user interactions');
  }
}

/**
 * Add user interaction
 * @param {Object} interaction - Interaction data
 * @returns {Promise<Object>} - Created interaction
 */
async function addUserInteraction(interaction) {
  try {
    const newInteraction = new UserInteraction(interaction);
    return await newInteraction.save();
  } catch (error) {
    console.error('Error adding user interaction:', error);
    throw new Error('Failed to add user interaction');
  }
}

/**
 * Get or initialize order counter
 * @returns {Promise<Object>} - Order counter
 */
async function getOrderCounter() {
  try {
    let counter = await OrderCounter.findOne();
    if (!counter) {
      counter = new OrderCounter();
      await counter.save();
    }
    return counter;
  } catch (error) {
    console.error('Error getting order counter:', error);
    throw new Error('Failed to get order counter');
  }
}

/**
 * Increment order counter
 * @returns {Promise<Object>} - Updated counter
 */
async function incrementOrderCounter() {
  try {
    const counter = await getOrderCounter();
    counter.counter += 1;
    await counter.save();
    return counter;
  } catch (error) {
    console.error('Error incrementing order counter:', error);
    throw new Error('Failed to increment order counter');
  }
}

/**
 * Reset order counter
 * @returns {Promise<Object>} - Reset counter
 */
async function resetOrderCounter() {
  try {
    const counter = await getOrderCounter();
    counter.counter = 0;
    counter.lastResetAt = new Date();
    await counter.save();
    return counter;
  } catch (error) {
    console.error('Error resetting order counter:', error);
    throw new Error('Failed to reset order counter');
  }
}

/**
 * Get current recommendation model
 * @returns {Promise<Object>} - Current model
 */
async function getCurrentModel() {
  try {
    const model = await RecommendationModel.findOne({ active: true })
      .sort({ version: -1 });
    
    if (!model) {
      // Create initial model
      const initialModel = new RecommendationModel({
        version: 1,
        metrics: {
          accuracy: 0,
          precision: 0,
          recall: 0
        }
      });
      await initialModel.save();
      return initialModel;
    }
    
    return model;
  } catch (error) {
    console.error('Error getting current model:', error);
    throw new Error('Failed to get current model');
  }
}

module.exports = {
  getUserOrderHistory,
  getAllRestaurantsWithMenu,
  getTopOrderedFoods,
  getTopRatedRestaurants,
  getUserInteractions,
  addUserInteraction,
  getOrderCounter,
  incrementOrderCounter,
  resetOrderCounter,
  getCurrentModel,
  RETRAINING_THRESHOLD,
  MAX_RECOMMENDATIONS
}; 