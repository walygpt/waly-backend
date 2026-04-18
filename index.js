require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// ==========================
// 🔥 MongoDB Connection
// ==========================
mongoose.connect("mongodb+srv://walyadmin:Waly%40123456@cluster0.qb2xhag.mongodb.net/waly")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ Mongo Error:", err));

// ==========================
// 🔥 MODELS
// ==========================

// 👤 User
const userSchema = new mongoose.Schema({
  userId: String,
  walletBalance: {
    type: Number,
    default: 0,
  },
});

const User = mongoose.model("User", userSchema);

// 💰 Payment
const paymentSchema = new mongoose.Schema({
  transactionId: String,
  userId: String,
  amount: Number,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Payment = mongoose.model("Payment", paymentSchema);

// ==========================
// 🔥 TEST ROUTE
// ==========================
app.get("/", (req, res) => {
  res.send("🔥 Waly backend is running");
});

// ==========================
// 💰 GET USER WALLET
// ==========================
app.get("/wallet/:userId", async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });

    if (!user) return res.send({ walletBalance: 0 });

    res.send({ walletBalance: user.walletBalance });

  } catch (err) {
    res.status(500).send("error");
  }
});

// ==========================
// 🔥 CREATE PAYMENT (UPDATED)
// ==========================
app.get("/pay", async (req, res) => {
  try {
    const amount = Number(req.query.amount);
    const userId = req.query.userId;

    if (!amount || amount < 50) {
      return res.send("Minimum amount is 50 EGP");
    }

    if (!userId) {
      return res.send("userId is required");
    }

    const amountCents = amount * 100;

    const API_KEY = process.env.PAYMOB_API_KEY;
    const INTEGRATION_ID = process.env.PAYMOB_INTEGRATION_ID_CARD;
    const IFRAME_ID = process.env.PAYMOB_IFRAME_ID;

    const merchantOrderId = `${userId}_${Date.now()}`;

    // Auth
    const auth = await axios.post("https://accept.paymob.com/api/auth/tokens", {
      api_key: API_KEY,
    });

    const token = auth.data.token;

    // Order
    const order = await axios.post(
      "https://accept.paymob.com/api/ecommerce/orders",
      {
        auth_token: token,
        delivery_needed: "false",
        amount_cents: amountCents,
        currency: "EGP",
        items: [],
        merchant_order_id: merchantOrderId,
      }
    );

    const orderId = order.data.id;

    // Payment Key
    const paymentKey = await axios.post(
      "https://accept.paymob.com/api/acceptance/payment_keys",
      {
        auth_token: token,
        amount_cents: amountCents,
        expiration: 3600,
        order_id: orderId,
        billing_data: {
          first_name: "User",
          last_name: "Waly",
          email: "test@test.com",
          phone_number: "+201000000000",
          apartment: "NA",
          floor: "NA",
          street: "NA",
          building: "NA",
          shipping_method: "NA",
          postal_code: "NA",
          city: "Cairo",
          country: "EG",
          state: "NA",
        },
        currency: "EGP",
        integration_id: Number(INTEGRATION_ID),
      }
    );

    const paymentToken = paymentKey.data.token;

    const iframeURL = `https://accept.paymob.com/api/acceptance/iframes/${IFRAME_ID}?payment_token=${paymentToken}`;

    res.redirect(iframeURL);

  } catch (err) {
    console.log(err.response?.data || err.message);
    res.send("Error creating payment");
  }
});

// ==========================
// 🔥 PAYMOB WEBHOOK
// ==========================
app.post("/paymob/webhook", async (req, res) => {
  try {
    console.log("📩 Webhook received");

    const data = req.body;

    const isSuccess = data?.obj?.success === true;

    if (!isSuccess) {
      console.log("❌ Payment not successful");
      return res.send("Not successful");
    }

    const amount = data.obj.amount_cents / 100;
    const merchantOrderId = data.obj.order?.merchant_order_id;
    const userId = merchantOrderId?.split("_")[0];
    const transactionId = data.obj.id;

    // 🔒 منع التكرار
    const existing = await Payment.findOne({ transactionId });
    if (existing) {
      console.log("⚠️ Duplicate payment");
      return res.send("Already processed");
    }

    // 💰 حفظ العملية
    await Payment.create({
      transactionId,
      userId,
      amount,
    });

    // 👤 تحديث الرصيد
    let user = await User.findOne({ userId });

    if (!user) {
      user = await User.create({
        userId,
        walletBalance: 0,
      });
    }

    user.walletBalance += amount;
    await user.save();

    console.log("💰 Wallet updated:", userId, user.walletBalance);

    res.send("OK");

  } catch (err) {
    console.error("🔥 Webhook Error:", err);
    res.status(500).send("error");
  }
});

// ==========================
// 🔥 FIX GET ERROR
// ==========================
app.get("/paymob/webhook", (req, res) => {
  res.send("Webhook is working ✅");
});

// ==========================
// 🚀 START SERVER
// ==========================
app.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});