
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();

// Increase limit to allow image uploads (Base64)
app.use(bodyParser.json({ limit: '10mb' }));
app.use(cors());

// Serve the React Frontend (Important for Live Deployment)
app.use(express.static(path.join(__dirname, 'client/dist')));

// =============================================================
// 🔴 YOUR MONGODB CONNECTION
// =============================================================
const MONGO_URI = 'mongodb+srv://nexus:nexus321@cluster0.lbcatlh.mongodb.net/?appName=Cluster0';

// --- DATABASE SCHEMAS ---
const UserSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    pin: String,
    balance: { type: Number, default: 0.00 },
    isAdmin: { type: Boolean, default: false }
});
const User = mongoose.model('User', UserSchema);

const TransactionSchema = new mongoose.Schema({
    userEmail: String,
    type: String, // 'deposit' or 'withdraw'
    amount: Number,
    walletAddress: String,
    proofImage: String,
    status: { type: String, default: 'pending' },
    date: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

// --- ROUTES ---

// 1. Register
app.post('/api/register', async (req, res) => {
    try {
        const isFirstUser = (await User.countDocuments({})) === 0;
        const newUser = new User({ ...req.body, isAdmin: isFirstUser });
        await newUser.save();
        res.json({ success: true, message: "Account Initialized." });
    } catch (err) {
        res.json({ success: false, message: "Email already exists." });
    }
});

// 2. Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password, pin } = req.body;
        const user = await User.findOne({ email, password, pin });
        if (user) {
            res.json({ success: true, user });
        } else {
            res.json({ success: false, message: "Invalid Credentials." });
        }
    } catch (err) {
        res.json({ success: false, message: "System Error." });
    }
});

// 3. Get User Data
app.get('/api/user/:email', async (req, res) => {
    const user = await User.findOne({ email: req.params.email });
    if (user) res.json(user);
    else res.status(404).json({});
});

// 4. Create Transaction
app.post('/api/transaction', async (req, res) => {
    try {
        const newTx = new Transaction(req.body);
        await newTx.save();
        res.json({ success: true, message: "Request Submitted." });
    } catch (err) {
        res.json({ success: false, message: "Error submitting request." });
    }
});

// --- ADMIN ROUTES ---

// Get Pending Requests
app.get('/api/admin/pending', async (req, res) => {
    try {
        const pending = await Transaction.find({ status: 'pending' }).sort({ date: -1 });
        res.json(pending);
    } catch (err) {
        res.status(500).json([]);
    }
});

// Get All Users
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find({ isAdmin: false }).select('-password');
        res.json(users);
    } catch (err) {
        res.status(500).json([]);
    }
});

// Approve or Reject
app.post('/api/admin/decide', async (req, res) => {
    const { id, decision } = req.body;
    try {
        const tx = await Transaction.findById(id);
        if (!tx) return res.json({ success: false });

        if (decision === 'approved') {
            const user = await User.findOne({ email: tx.userEmail });
            if (tx.type === 'deposit') {
                user.balance += tx.amount;
            } else if (tx.type === 'withdraw') {
                if (user.balance < tx.amount) return res.json({ success: false, message: "Insufficient Funds" });
                user.balance -= tx.amount;
            }
            await user.save();
        }

        tx.status = decision;
        await tx.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// --- SERVE REACT APP (The Fix is Here) ---
// We changed '*' to /.*/ to fix the PathError
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist/index.html'));
});

// --- SERVER STARTUP ---
console.log("⏳ Initializing Nexus Core...");
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ DATABASE LIVE: Connection Established.');
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => console.log(`🚀 SYSTEM ONLINE on port ${PORT}`));
    })
    .catch(err => {
        console.error('❌ CRITICAL ERROR:', err.message);
    });