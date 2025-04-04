const Cart = require("../models/cart.model");
const CartItem = require("../models/cartItem");
const Food = require("../models/food.model");

module.exports = {
  async createCart(user) {
    const cart = new Cart({ customer: user });
    const createdCart = await cart.save();
    return createdCart;
  },

  async findCartByUserId(userId) {
    try {
      const cart = await Cart.findOne({ customer: userId });
      
      if (!cart) {
        throw new Error("Cart not found for user - " + userId);
      }

      // Populate cart items with food and restaurant details
      await cart.populate([
        {
          path: "items",
          populate: {
            path: "food",
            populate: { path: "restaurant", select: "_id name" }
          }
        }
      ]);

      let totalPrice = 0;
      let totalItem = 0;

      // Calculate totals from populated items
      for (const item of cart.items) {
        if (item.food) {
          totalPrice += item.totalPrice || (item.food.price * item.quantity);
          totalItem += item.quantity;
        }
      }

      cart.totalPrice = totalPrice;
      cart.totalItem = totalItem;

      return cart;
    } catch (error) {
      throw new Error(`Error finding cart: ${error.message}`);
    }
  },

  async addItemToCart(req, userId) {
    try {
      const cart = await Cart.findOne({ customer: userId });
      if (!cart) {
        throw new Error("Cart not found for user");
      }

      const food = await Food.findById(req.menuItemId);
      if (!food) {
        throw new Error("Food item not found");
      }

      // Check for existing item with same food and ingredients
      const isPresent = await CartItem.findOne({
        cart: cart._id,
        food: food._id,
        ingredients: { $eq: req.ingredients || [] } // Compare ingredients array exactly
      });

      if (!isPresent) {
        // Create new cart item
        const cartItem = new CartItem({
          food: food._id,
          cart: cart._id,
          quantity: req.quantity || 1,
          ingredients: req.ingredients || [],
          totalPrice: food.price * (req.quantity || 1)
        });

        const createdCartItem = await cartItem.save();
        const populatedCartItem = await createdCartItem.populate([{
          path: "food",
          populate: { path: "restaurant", select: "_id name" }
        }]);

        cart.items.push(createdCartItem);
        await cart.save();
        
        return populatedCartItem;
      }

      // If exact same item exists (same food and ingredients), update quantity
      isPresent.quantity += (req.quantity || 1);
      isPresent.totalPrice = food.price * isPresent.quantity;
      
      await isPresent.save();
      const updatedItem = await isPresent.populate([{
        path: "food",
        populate: { path: "restaurant", select: "_id name" }
      }]);
      
      return updatedItem;
    } catch (error) {
      throw new Error(`Failed to add item to cart: ${error.message}`);
    }
  },

  async updateCartItemQuantity(cartItemId, quantity) {
    const cartItem = await CartItem.findById(cartItemId).populate([
      { path: "food", populate: { path: "restaurant", select: "_id" } },
    ]);
    if (!cartItem) {
      throw new Error(`Cart item not found with ID ${cartItemId}`);
    }

    cartItem.quantity = quantity;
    cartItem.totalPrice = quantity * cartItem.food.price;
    await cartItem.save();
    return cartItem;
  },

  async removeItemFromCart(cartItemId, user) {
    // Retrieve user ID from JWT token

    // Find the cart for the user
    const cart = await Cart.findOne({ customer: user._id });
    if (!cart) {
      throw new Error(`Cart not found for user ID ${user._id}`);
    }

    // Remove the item from the cart
    cart.items = cart.items.filter((item) => !item.equals(cartItemId));
    await cart.save();
    return cart;
  },

  async clearCart(user) {
    const cart = await Cart.findOne({ customer: user._id });
    if (!cart) {
      throw new Error(`Cart not found for user ID ${user._id}`);
    }

    cart.items = [];
    await cart.save();
    return cart;
  },

  async calculateCartTotals(cart) {
    try {
      let total = 0;

      for (let cartItem of cart.items) {
        total += cartItem.food.price * cartItem.quantity;
      }
      return total;
    } catch (error) {
      throw new Error(error.message);
    }
  },
};
