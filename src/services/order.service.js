const mongoose = require('mongoose');
const Address = require("../models/adress.model");
const Order = require("../models/order.model");
const OrderItem = require("../models/orderItem.model");
const Restaurant = require("../models/restaurant.model");
const User = require("../models/user.model");
const cartService = require("./cart.service");
const paymentService = require("./payment.service");
const { 
  incrementOrderCounter, 
  getOrderCounter, 
  resetOrderCounter,
  addUserInteraction,
  RETRAINING_THRESHOLD 
} = require("./recommendation.service");

module.exports = {
  async createOrder(order, user) {
    try {
      console.log("Creating order with raw data:", JSON.stringify(order));
      
      // 1. Process the delivery address
      let addressId;
      
      if (order.deliveryAddress && order.deliveryAddress._id) {
        // Use the existing address directly since it's already validated and populated
        addressId = order.deliveryAddress._id;
        console.log("Using existing address:", order.deliveryAddress);
      } else if (order.deliveryAddress) {
        // This is a new address to be created
        const newAddress = new Address({
          fullName: order.deliveryAddress.fullName || user.fullName,
          streetAddress: order.deliveryAddress.streetAddress,
          city: order.deliveryAddress.city,
          state: order.deliveryAddress.state,
          postalCode: order.deliveryAddress.postalCode,
          country: order.deliveryAddress.country || "India",
        });
        
        // Save the new address
        const savedAddress = await newAddress.save();
        
        // Add to user's addresses if not already present
        if (!user.addresses) {
          user.addresses = [];
        }
        user.addresses.push(savedAddress._id);
        await user.save();
        
        addressId = savedAddress._id;
        console.log("Created new address:", savedAddress);
      } else {
        throw new Error("No delivery address provided");
      }
      
      // 2. Find restaurant
      const restaurant = await Restaurant.findById(order.restaurantId);
      if (!restaurant) {
        throw new Error(`Restaurant not found with ID ${order.restaurantId}`);
      }
      
      // 3. Get user's cart
      const cart = await cartService.findCartByUserId(user._id);
      if (!cart || !cart.items || cart.items.length === 0) {
        throw new Error("Cart is empty");
      }
      
      // 4. Create order items
      const orderItems = [];
      for (const cartItem of cart.items) {
        if (!cartItem.food) {
          throw new Error("Invalid cart item - food not found");
        }
        
        const orderItem = new OrderItem({
          food: cartItem.food._id,
          quantity: cartItem.quantity,
          totalPrice: cartItem.food.price * cartItem.quantity,
          ingredients: cartItem.ingredients || []
        });
        
        const savedOrderItem = await orderItem.save();
        orderItems.push(savedOrderItem._id);
      }
      
      // 5. Calculate total price
      const totalPrice = await cartService.calculateCartTotals(cart);
      
      // 6. Create the order with all data assembled
      const orderData = {
        customer: user._id,
        deliveryAddress: addressId,
        createdAt: new Date(),
        orderStatus: "PENDING",
        totalAmount: totalPrice,
        restaurant: restaurant._id,
        items: orderItems,
      };
      
      console.log("Final order data:", JSON.stringify(orderData));
      
      // 7. Save the order
      const newOrder = new Order(orderData);
      const savedOrder = await newOrder.save();
      console.log("Saved order:", savedOrder._id.toString());
      
      // 8. Update restaurant orders
      restaurant.orders.push(savedOrder._id);
      await restaurant.save();
      
      // 9. Generate payment link
      const paymentResponse = await paymentService.generatePaymentLink(savedOrder);
      console.log("Payment response:", paymentResponse);
      
      // 10. Clear the cart
      await cartService.clearCart(user);
      
      // 11. Update recommendation system
      await this.updateRecommendationSystem(savedOrder, user._id, restaurant._id, cart);
      
      return paymentResponse;
    } catch (error) {
      console.error("Order creation error:", error);
      throw new Error(`Failed to create order: ${error.message}`);
    }
  },

  async updateRecommendationSystem(order, userId, restaurantId, cart) {
    try {
      // Track restaurant interaction
      await addUserInteraction({
        user: userId,
        item: restaurantId,
        itemType: 'Restaurant',
        interactionType: 'ORDER',
      });

      // Track food interactions
      for (const cartItem of cart.items) {
        if (cartItem.food && cartItem.food._id) {
          await addUserInteraction({
            user: userId,
            item: cartItem.food._id,
            itemType: 'Food',
            interactionType: 'ORDER',
          });
        }
      }

      // Increment order counter for retraining
      const counter = await incrementOrderCounter();
      console.log(`Order counter: ${counter.counter}/${RETRAINING_THRESHOLD}`);

      // Check if retraining is needed
      if (counter.counter >= RETRAINING_THRESHOLD) {
        console.log("Recommendation retraining threshold reached - resetting counter");
        await resetOrderCounter();
      }
    } catch (error) {
      console.error("Error updating recommendation system:", error);
      // Don't throw error here to avoid disrupting order flow
    }
  },

  async cancelOrder(orderId) {
    try {
      await Order.findByIdAndDelete(orderId);
    } catch (error) {
      throw new Error(
        `Failed to cancel order with ID ${orderId}: ${error.message}`
      );
    }
  },

  async findOrderById(orderId) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error(`Order not found with ID ${orderId}`);
      }
      return order;
    } catch (error) {
      throw new Error(
        `Failed to find order with ID ${orderId}: ${error.message}`
      );
    }
  },

  async getUserOrders(userId) {
    try {
      const orders = await Order.find({ customer: userId }).populate({
        path: "items",populate:{path:"food"}
      });
      return orders;
    } catch (error) {
      throw new Error(`Failed to get user orders: ${error.message}`);
    }
  },

  async getOrdersOfRestaurant(restaurantId, orderStatus) {
    try {
      let orders = await Order.find({ restaurant: restaurantId }).populate([{
        path: "items",populate:{path:"food"}
      },'customer']);
      if (orderStatus) {
        orders = orders.filter((order) => order.orderStatus === orderStatus);
      }
      return orders;
    } catch (error) {
      throw new Error(
        `Failed to get orders of restaurant with ID ${restaurantId}: ${error.message}`
      );
    }
  },

  async updateOrder(orderId, orderStatus) {
    try {
      const validStatuses = [
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "COMPLETED",
        "PENDING",
      ];
      if (!validStatuses.includes(orderStatus)) {
        throw new Error("Please select a valid order status");
      }

      const order = await Order.findById(orderId).populate({
        path: "items",populate:{path:"food"}
      });
      if (!order) {
        throw new Error(`Order not found with ID ${orderId}`);
      }

      order.orderStatus = orderStatus;
      await order.save();

      // Send notification
      // await NotificationService.sendOrderStatusNotification(order);

      return order;
    } catch (error) {
      throw new Error(
        `Failed to update order with ID ${orderId}: ${error.message}`
      );
    }
  },
};
