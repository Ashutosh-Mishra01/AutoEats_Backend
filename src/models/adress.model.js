const mongoose = require('mongoose');

// Define the Address schema
const AddressSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: false
  },
  streetAddress: {
    type: String,
    required: true
  },
  city: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  postalCode: {
    type: String,
    required: true
  },
  country: {
    type: String,
    default: "India"
  },
}, {
  // Disable timestamps
  timestamps: false,
  // Disable autoIndex
  autoIndex: false
});

// Explicitly disable indices to prevent uniqueness conflicts
AddressSchema.set('autoIndex', false);

// Define and export the Address model
const Address = mongoose.model('Address', AddressSchema);
module.exports = Address;
