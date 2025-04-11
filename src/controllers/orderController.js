const orderService = require("../services/order.service.js");
const mongoose = require('mongoose');
const Address = require("../models/adress.model.js");
const User = require("../models/user.model.js");

module.exports = {
    createOrder: async (req, res) => {
        try {
            const order = req.body;
            const user = req.user;
            
            console.log("Received order data:", JSON.stringify(order));
            console.log("User ID:", user._id);
            
            // Validate required fields
            if (!order.restaurantId) {
                throw new Error('Restaurant ID is required');
            }
            
            if (!order.deliveryAddress) {
                throw new Error('Delivery address is required');
            }
            
            // Handle the address ID
            if (order.deliveryAddress._id) {
                // Convert string ID to ObjectId safely
                try {
                    const addressId = new mongoose.Types.ObjectId(order.deliveryAddress._id);
                    
                    // Verify the address exists and belongs to the user
                    const addressExists = user.addresses.some(addr => 
                        addr.toString() === addressId.toString()
                    );
                    
                    if (!addressExists) {
                        throw new Error('Address not found in user\'s saved addresses');
                    }
                    
                    // Update the order object with the converted ObjectId
                    order.deliveryAddress._id = addressId;
                } catch (error) {
                    throw new Error('Invalid address ID format');
                }
            }
            
            // Create the order
            const paymentResponse = await orderService.createOrder(order, user);
            res.status(200).json(paymentResponse);
            
        } catch (error) {
            console.error("Order creation error:", error);
            res.status(400).json({ 
                error: true,
                message: error.message || 'Failed to create order'
            });
        }
    },

    getAllUserOrders: async (req, res) => {
        try {
            const user = req.user;
            const userOrders = await orderService.getUserOrders(user._id);
            res.status(200).json(userOrders);
        } catch (error) {
            res.status(400).json({ 
                error: true,
                message: error.message || 'Failed to get user orders'
            });
        }
    }
};
