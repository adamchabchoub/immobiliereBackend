const mongoose = require('mongoose')

const Schema = mongoose.Schema

const userSchema = new Schema({
    username: String,
    firstname:String,
    lastname:String,
    email: String,
    password: String,
    userImage: String,
    contactnumber: String,
    address: String,
    isAdmin: { type: Boolean, default: false }
})

module.exports = mongoose.model('user',userSchema,'users')