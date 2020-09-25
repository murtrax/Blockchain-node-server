const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const nodeOneSchema = new Schema({
    userID: String,
    address: String,
    amount: String,
    cost: String,
    status: String, 
    type: String,
    opid: String, 
})

const nodeOne = mongoose.model("nodeOne", nodeOneSchema);

module.exports = nodeOne;