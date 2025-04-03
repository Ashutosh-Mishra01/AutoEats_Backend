const { app } = require("./index"); // Explicitly import index.js
const connectToDB = require("./config/db");

const PORT = process.env.PORT || 3000; // Use dynamic port for Vercel

// First connect to the database, then start the server
connectToDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log("✅ Server is running on port", PORT);
        });
    })
    .catch((err) => {
        console.error("❌ Failed to connect to database:", err);
        process.exit(1); // Exit the process if DB connection fails
    });


