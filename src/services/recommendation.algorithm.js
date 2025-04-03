const { 
  getUserOrderHistory, 
  getAllRestaurantsWithMenu, 
  getTopOrderedFoods, 
  getTopRatedRestaurants,
  getUserInteractions,
  MAX_RECOMMENDATIONS
} = require('./recommendation.service');

/**
 * Calculate similarity between two users based on order history
 * @param {Array} user1Orders - First user's orders
 * @param {Array} user2Orders - Second user's orders
 * @returns {Number} - Similarity score between 0 and 1
 */
function calculateUserSimilarity(user1Orders, user2Orders) {
  if (!user1Orders.length || !user2Orders.length) return 0;
  
  // Extract food IDs from orders
  const user1Foods = new Set();
  user1Orders.forEach(order => {
    order.items.forEach(item => {
      if (item.food && item.food._id) {
        user1Foods.add(item.food._id.toString());
      }
    });
  });
  
  const user2Foods = new Set();
  user2Orders.forEach(order => {
    order.items.forEach(item => {
      if (item.food && item.food._id) {
        user2Foods.add(item.food._id.toString());
      }
    });
  });
  
  // Calculate Jaccard similarity
  const intersection = [...user1Foods].filter(food => user2Foods.has(food));
  const union = new Set([...user1Foods, ...user2Foods]);
  
  return intersection.length / union.size;
}

/**
 * Find similar users based on order history
 * @param {String} userId - User ID
 * @param {Array} allUsers - All users with their orders
 * @param {Number} limit - Number of similar users to return
 * @returns {Array} - Similar users with similarity scores
 */
async function findSimilarUsers(userId, limit = 5) {
  try {
    // Get current user's orders
    const userOrders = await getUserOrderHistory(userId);
    if (!userOrders.length) return [];
    
    // Get all users with their orders
    const allUsers = await getAllUsers();
    
    // Calculate similarity with each user
    const similarities = [];
    for (const user of allUsers) {
      if (user._id.toString() === userId.toString()) continue;
      
      const userOrderHistory = await getUserOrderHistory(user._id);
      const similarity = calculateUserSimilarity(userOrders, userOrderHistory);
      
      similarities.push({
        user: user._id,
        similarity
      });
    }
    
    // Sort by similarity and take top N
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  } catch (error) {
    console.error('Error finding similar users:', error);
    throw new Error('Failed to find similar users');
  }
}

/**
 * Get all users (utility function)
 * @returns {Promise<Array>} - All users
 */
async function getAllUsers() {
  const User = require('../models/user.model');
  return await User.find({ role: 'ROLE_CUSTOMER' });
}

/**
 * Collaborative filtering algorithm
 * @param {String} userId - User ID
 * @returns {Promise<Object>} - Recommendations for restaurants and foods
 */
async function collaborativeFiltering(userId) {
  try {
    // Find similar users
    const similarUsers = await findSimilarUsers(userId);
    if (!similarUsers.length) {
      return { restaurants: [], foods: [] };
    }
    
    // Get current user's orders to avoid recommending already ordered items
    const userOrders = await getUserOrderHistory(userId);
    const userOrderedRestaurants = new Set();
    const userOrderedFoods = new Set();
    
    userOrders.forEach(order => {
      userOrderedRestaurants.add(order.restaurant._id.toString());
      order.items.forEach(item => {
        if (item.food && item.food._id) {
          userOrderedFoods.add(item.food._id.toString());
        }
      });
    });
    
    // Collect recommendations from similar users
    const restaurantScores = new Map();
    const foodScores = new Map();
    
    for (const { user, similarity } of similarUsers) {
      const userOrderHistory = await getUserOrderHistory(user);
      
      userOrderHistory.forEach(order => {
        // Score restaurant
        const restaurantId = order.restaurant._id.toString();
        if (!userOrderedRestaurants.has(restaurantId)) {
          const currentScore = restaurantScores.get(restaurantId) || 0;
          restaurantScores.set(restaurantId, currentScore + similarity);
        }
        
        // Score foods
        order.items.forEach(item => {
          if (item.food && item.food._id) {
            const foodId = item.food._id.toString();
            if (!userOrderedFoods.has(foodId)) {
              const currentScore = foodScores.get(foodId) || 0;
              foodScores.set(foodId, currentScore + similarity);
            }
          }
        });
      });
    }
    
    // Convert to arrays and sort
    const restaurantRecommendations = [...restaurantScores.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECOMMENDATIONS);
    
    const foodRecommendations = [...foodScores.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECOMMENDATIONS);
    
    // Populate recommendations with full objects
    const Restaurant = require('../models/restaurant.model');
    const Food = require('../models/food.model');
    
    const restaurants = await Promise.all(
      restaurantRecommendations.map(async ({ id, score }) => {
        const restaurant = await Restaurant.findById(id).populate('foods');
        return { ...restaurant.toObject(), score: score * 100 };
      })
    );
    
    const foods = await Promise.all(
      foodRecommendations.map(async ({ id, score }) => {
        const food = await Food.findById(id).populate('restaurant');
        return { ...food.toObject(), score: score * 100 };
      })
    );
    
    return { restaurants, foods };
  } catch (error) {
    console.error('Error in collaborative filtering:', error);
    throw new Error('Failed to generate collaborative recommendations');
  }
}

/**
 * Calculate content similarity between user preferences and items
 * @param {Object} userProfile - User profile with preferences
 * @param {Array} items - Items to calculate similarity for
 * @param {String} type - Type of item ('restaurant' or 'food')
 * @returns {Array} - Items with similarity scores
 */
function calculateContentSimilarity(userProfile, items, type) {
  // Extract relevant features based on type
  const getFeatures = (item) => {
    if (type === 'restaurant') {
      return {
        cuisineType: item.cuisineType || '',
      };
    } else { // food
      return {
        category: item.foodCategory ? item.foodCategory.toString() : '',
        isVegetarian: item.isVegetarian || false,
        isSeasonal: item.isSeasonal || false,
      };
    }
  };
  
  // Calculate similarity for each item
  return items.map(item => {
    const itemFeatures = getFeatures(item);
    let similarity = 0;
    let maxSimilarity = 0;
    
    // Compare features
    for (const [feature, userValue] of Object.entries(userProfile)) {
      if (feature in itemFeatures) {
        const itemValue = itemFeatures[feature];
        
        // Calculate feature similarity
        let featureSimilarity = 0;
        if (typeof userValue === 'boolean') {
          featureSimilarity = userValue === itemValue ? 1 : 0;
        } else if (typeof userValue === 'string') {
          featureSimilarity = userValue === itemValue ? 1 : 0;
        } else if (Array.isArray(userValue)) {
          featureSimilarity = userValue.includes(itemValue) ? 1 : 0;
        }
        
        similarity += featureSimilarity;
        maxSimilarity += 1;
      }
    }
    
    // Normalize similarity
    const normalizedSimilarity = maxSimilarity > 0 ? similarity / maxSimilarity : 0;
    return { ...item, score: normalizedSimilarity * 100 };
  });
}

/**
 * Build user preference profile based on order history and interactions
 * @param {String} userId - User ID
 * @returns {Promise<Object>} - User preference profile
 */
async function buildUserProfile(userId) {
  try {
    // Get user order history
    const orders = await getUserOrderHistory(userId);
    
    // Get user interactions
    const interactions = await getUserInteractions(userId);
    
    // Initialize profile
    const profile = {
      cuisineTypes: new Map(),
      foodCategories: new Map(),
      isVegetarian: 0,
      nonVegetarianCount: 0,
      seasonalPreference: 0,
      nonSeasonalCount: 0
    };
    
    // Process orders
    let totalOrders = 0;
    let totalFoodItems = 0;
    
    orders.forEach(order => {
      totalOrders++;
      
      // Count cuisine type
      if (order.restaurant && order.restaurant.cuisineType) {
        const cuisineType = order.restaurant.cuisineType;
        profile.cuisineTypes.set(
          cuisineType, 
          (profile.cuisineTypes.get(cuisineType) || 0) + 1
        );
      }
      
      // Process food items
      order.items.forEach(item => {
        if (item.food) {
          totalFoodItems++;
          
          // Count food category
          if (item.food.foodCategory) {
            const category = item.food.foodCategory.toString();
            profile.foodCategories.set(
              category,
              (profile.foodCategories.get(category) || 0) + 1
            );
          }
          
          // Track vegetarian preference
          if (item.food.isVegetarian) {
            profile.isVegetarian++;
          } else {
            profile.nonVegetarianCount++;
          }
          
          // Track seasonal preference
          if (item.food.isSeasonal) {
            profile.seasonalPreference++;
          } else {
            profile.nonSeasonalCount++;
          }
        }
      });
    });
    
    // Process interactions - using for...of instead of forEach to allow await
    for (const interaction of interactions) {
      if (interaction.itemType === 'Restaurant' && interaction.interactionType === 'FAVORITE') {
        // Boost cuisine type if user favorited a restaurant
        const restaurant = await Restaurant.findById(interaction.item);
        if (restaurant && restaurant.cuisineType) {
          const cuisineType = restaurant.cuisineType;
          profile.cuisineTypes.set(
            cuisineType,
            (profile.cuisineTypes.get(cuisineType) || 0) + 2
          );
        }
      } else if (interaction.itemType === 'Food' && interaction.interactionType === 'FAVORITE') {
        // Boost food preferences if user favorited a food
        const food = await Food.findById(interaction.item);
        if (food) {
          if (food.foodCategory) {
            const category = food.foodCategory.toString();
            profile.foodCategories.set(
              category,
              (profile.foodCategories.get(category) || 0) + 2
            );
          }
          
          if (food.isVegetarian) {
            profile.isVegetarian += 2;
          } else {
            profile.nonVegetarianCount += 2;
          }
          
          if (food.isSeasonal) {
            profile.seasonalPreference += 2;
          } else {
            profile.nonSeasonalCount += 2;
          }
        }
      }
    }
    
    // Normalize and finalize profile
    const finalProfile = {
      cuisineType: [...profile.cuisineTypes.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cuisine]) => cuisine),
      
      foodCategories: [...profile.foodCategories.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([category]) => category),
      
      isVegetarian: profile.isVegetarian > profile.nonVegetarianCount,
      
      isSeasonal: profile.seasonalPreference > profile.nonSeasonalCount
    };
    
    return finalProfile;
  } catch (error) {
    console.error('Error building user profile:', error);
    throw new Error('Failed to build user profile');
  }
}

/**
 * Content-based filtering algorithm
 * @param {String} userId - User ID
 * @returns {Promise<Object>} - Recommendations for restaurants and foods
 */
async function contentBasedFiltering(userId) {
  try {
    // Build user profile
    const userProfile = await buildUserProfile(userId);
    
    // Get all restaurants and foods
    const restaurants = await getAllRestaurantsWithMenu();
    
    // Flatten foods from all restaurants
    const allFoods = [];
    restaurants.forEach(restaurant => {
      if (restaurant.foods && restaurant.foods.length) {
        restaurant.foods.forEach(food => {
          allFoods.push({
            ...food.toObject(),
            restaurant: {
              _id: restaurant._id,
              name: restaurant.name
            }
          });
        });
      }
    });
    
    // Calculate similarity scores
    const scoredRestaurants = calculateContentSimilarity(
      userProfile,
      restaurants.map(r => r.toObject()),
      'restaurant'
    );
    
    const scoredFoods = calculateContentSimilarity(
      userProfile,
      allFoods,
      'food'
    );
    
    // Sort by score and take top N
    const restaurantRecommendations = scoredRestaurants
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECOMMENDATIONS);
    
    const foodRecommendations = scoredFoods
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECOMMENDATIONS);
    
    return {
      restaurants: restaurantRecommendations,
      foods: foodRecommendations
    };
  } catch (error) {
    console.error('Error in content-based filtering:', error);
    throw new Error('Failed to generate content-based recommendations');
  }
}

/**
 * Calculate popularity score based on order counts
 * @param {Array} restaurants - Restaurants to score
 * @param {Array} foods - Foods to score
 * @returns {Object} - Objects with popularity scores
 */
async function calculatePopularityScores() {
  try {
    // Get top restaurants and foods
    const topRestaurants = await getTopRatedRestaurants(MAX_RECOMMENDATIONS);
    const topFoods = await getTopOrderedFoods(MAX_RECOMMENDATIONS);
    
    // Normalize scores to 0-100
    const normalizeScores = (items) => {
      const maxValue = Math.max(...items.map(item => item.count || item.numRating || 1));
      return items.map(item => ({
        ...item,
        score: ((item.count || item.numRating || 1) / maxValue) * 100
      }));
    };
    
    return {
      restaurants: normalizeScores(topRestaurants),
      foods: normalizeScores(topFoods)
    };
  } catch (error) {
    console.error('Error calculating popularity scores:', error);
    throw new Error('Failed to calculate popularity scores');
  }
}

/**
 * Hybrid recommendation algorithm combining collaborative, content-based, and popularity
 * @param {String} userId - User ID
 * @returns {Promise<Object>} - Final recommendations with explanation
 */
async function hybridRecommendations(userId) {
  try {
    // Get recommendations from each algorithm
    const collaborative = await collaborativeFiltering(userId);
    const contentBased = await contentBasedFiltering(userId);
    const popularity = await calculatePopularityScores();
    
    // Weights for each algorithm (can be adjusted)
    const weights = {
      collaborative: 0.5,
      contentBased: 0.3,
      popularity: 0.2
    };
    
    // Combine and normalize scores
    const combineScores = (collaborative, contentBased, popularity, type) => {
      const allItems = new Map();
      
      // Add collaborative items
      collaborative[type].forEach(item => {
        allItems.set(item._id.toString(), {
          item,
          collaborativeScore: item.score || 0,
          contentScore: 0,
          popularityScore: 0
        });
      });
      
      // Add content-based items
      contentBased[type].forEach(item => {
        const id = item._id.toString();
        if (allItems.has(id)) {
          allItems.get(id).contentScore = item.score || 0;
        } else {
          allItems.set(id, {
            item,
            collaborativeScore: 0,
            contentScore: item.score || 0,
            popularityScore: 0
          });
        }
      });
      
      // Add popularity items
      popularity[type].forEach(item => {
        const id = item._id.toString();
        if (allItems.has(id)) {
          allItems.get(id).popularityScore = item.score || 0;
        } else {
          allItems.set(id, {
            item,
            collaborativeScore: 0,
            contentScore: 0,
            popularityScore: item.score || 0
          });
        }
      });
      
      // Calculate weighted scores
      return [...allItems.values()].map(({ item, collaborativeScore, contentScore, popularityScore }) => {
        const weightedScore = 
          (collaborativeScore * weights.collaborative) + 
          (contentScore * weights.contentBased) + 
          (popularityScore * weights.popularity);
        
        // Generate explanation
        const reasons = [];
        if (collaborativeScore > 0) {
          reasons.push('Based on your past orders');
        }
        if (contentScore > 0) {
          reasons.push('Matches your preferences');
        }
        if (popularityScore > 0) {
          reasons.push('Popular with other users');
        }
        
        // Calculate confidence based on number of signals
        const signalCount = 
          (collaborativeScore > 0 ? 1 : 0) + 
          (contentScore > 0 ? 1 : 0) + 
          (popularityScore > 0 ? 1 : 0);
        const confidence = (signalCount / 3) * 100;
        
        return {
          ...item,
          score: weightedScore,
          confidence,
          reasons
        };
      });
    };
    
    // Combine scores for both types
    const restaurantRecommendations = combineScores(collaborative, contentBased, popularity, 'restaurants');
    const foodRecommendations = combineScores(collaborative, contentBased, popularity, 'foods');
    
    // Sort by score and take top N
    const finalRestaurants = restaurantRecommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECOMMENDATIONS);
    
    const finalFoods = foodRecommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECOMMENDATIONS);
    
    return {
      restaurants: finalRestaurants,
      foods: finalFoods
    };
  } catch (error) {
    console.error('Error in hybrid recommendations:', error);
    throw new Error('Failed to generate hybrid recommendations');
  }
}

module.exports = {
  collaborativeFiltering,
  contentBasedFiltering,
  calculatePopularityScores,
  hybridRecommendations
}; 