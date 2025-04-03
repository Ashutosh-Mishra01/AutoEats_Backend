const mongoose = require('mongoose');

const RecommendationModelSchema = new mongoose.Schema({
  version: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  metrics: {
    accuracy: Number,
    precision: Number,
    recall: Number,
  },
  totalOrdersProcessed: {
    type: Number,
    default: 0,
  },
  active: {
    type: Boolean,
    default: true,
  }
});

const UserInteractionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  item: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'itemType',
  },
  itemType: {
    type: String,
    enum: ['Restaurant', 'Food'],
    required: true,
  },
  interactionType: {
    type: String,
    enum: ['VIEW', 'CLICK', 'ORDER', 'FAVORITE'],
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  score: {
    type: Number,
    default: 0,
  }
});

const RecommendationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  item: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'itemType',
    required: true,
  },
  itemType: {
    type: String,
    enum: ['Restaurant', 'Food'],
    required: true,
  },
  score: {
    type: Number,
    required: true,
  },
  confidence: {
    type: Number,
    required: true,
  },
  reasons: [{
    type: String,
  }],
  modelVersion: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  shown: {
    type: Boolean,
    default: false,
  },
  clicked: {
    type: Boolean,
    default: false,
  },
  ordered: {
    type: Boolean,
    default: false,
  }
});

const OrderCounterSchema = new mongoose.Schema({
  counter: {
    type: Number,
    default: 0,
  },
  lastResetAt: {
    type: Date,
    default: Date.now,
  }
});

const RecommendationModel = mongoose.model('RecommendationModel', RecommendationModelSchema);
const UserInteraction = mongoose.model('UserInteraction', UserInteractionSchema);
const Recommendation = mongoose.model('Recommendation', RecommendationSchema);
const OrderCounter = mongoose.model('OrderCounter', OrderCounterSchema);

module.exports = {
  RecommendationModel,
  UserInteraction,
  Recommendation,
  OrderCounter
}; 