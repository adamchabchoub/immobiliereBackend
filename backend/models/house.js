const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const houseSchema = new Schema({
    title: String,
    description: String,
    price: Number,
    location: String,
    bedrooms: Number,
    bathrooms: Number,
    size: Number,
    images: [String],
    amenities: [String], 
    category:  String,
    type: String,
    postedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

module.exports = mongoose.model('House', houseSchema);
