async findRestaurantByUserId(req, res) {
  try {
    const userId = req.user._id;
    const restaurant = await restaurantService.getRestaurantsByUserId(userId);
    // Return 200 with null data if no restaurant found
    res.status(200).json(restaurant);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
} 