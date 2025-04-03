const orderService = require("../services/order.service.js");
const mongoose = require('mongoose');
const Address = require("../models/adress.model.js");
const User = require("../models/user.model.js");

module.exports = {
    createOrder: async (req, res) => {
        try {
            const order = req.body;
            const userId = req.user._id;
            
            if (!order) throw new Error('Please provide valid request body');
            
            // Log the incoming data
            console.log("Received order data:", JSON.stringify(order));
            console.log("User ID:", userId);
            
            // Handle the address
            if (order.deliveryAddress && order.deliveryAddress._id) {
                // Ensure address ID is a valid ObjectId
                const addressId = mongoose.Types.ObjectId.isValid(order.deliveryAddress._id) 
                    ? mongoose.Types.ObjectId(order.deliveryAddress._id) 
                    : null;
                
                if (!addressId) {
                    throw new Error(`Invalid address ID: ${order.deliveryAddress._id}`);
                }
                
                console.log("Using address ID:", addressId);
                
                // CRITICAL: Update the order object to use the ObjectId
                order.deliveryAddress._id = addressId;
                
                // Force-add the address to the user in MongoDB
                await User.findByIdAndUpdate(
                    userId,
                    { $addToSet: { addresses: addressId } }
                );
                
                console.log(`Added address ${addressId} to user ${userId}`);
            }
            
            // Get a fresh copy of the user with the updated addresses
            const freshUser = await User.findById(userId);
            if (!freshUser) {
                throw new Error(`User not found with ID ${userId}`);
            }
            
            console.log("User addresses:", freshUser.addresses.map(addr => addr.toString()));
            
            // Create the order with the fresh user
            const paymentResponse = await orderService.createOrder(order, freshUser);
            res.status(200).json(paymentResponse);
        } catch (error) {
            console.error("Order controller error:", error);
            const errorMessage = error.message || 'Unknown error';
            res.status(400).json({ error: errorMessage });
        }
    },

    getAllUserOrders: async (req, res) => {
        try {
            user=req.user
            const userOrders = await orderService.getUserOrders(user._id);
            res.status(200).json(userOrders);
        } catch (error) {
            if (error instanceof Error) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Internal server error' });
            }
        }
    }
};
