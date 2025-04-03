const jwtProvider = require("../config/jwtProvider");
const userService = require("../services/user.service");
const User = require("../models/user.model");

const authenticate = async(req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(404).send({message: "token not found"});
        }

        const userId = jwtProvider.getUserIdFromToken(token);
        const user = await User.findById(userId).populate("addresses");
        
        if (!user) {
            return res.status(404).send({message: "User not found"});
        }
        
        console.log(`Authenticated user ${userId} with ${user.addresses?.length || 0} addresses`);
        
        req.user = user;
        next();
    } catch (error) {
        console.error("Authentication error:", error);
        return res.status(500).send({error: error.message});
    }
};

module.exports = authenticate;