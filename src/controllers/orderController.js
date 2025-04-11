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
                // Find the address in user's saved addresses
                const userWithAddresses = await User.findById(user._id)
                    .populate('addresses')
                    .exec();
                
                if (!userWithAddresses || !userWithAddresses.addresses) {
                    throw new Error('User addresses not found');
                }
                
                const selectedAddress = userWithAddresses.addresses.find(addr => 
                    addr._id.toString() === order.deliveryAddress._id
                );
                
                if (!selectedAddress) {
                    throw new Error('Address not found in user\'s saved addresses');
                }
                
                // Use the full address object from the database
                order.deliveryAddress = selectedAddress;
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
