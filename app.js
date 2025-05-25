require('dotenv').config(); // Load environment variables at the top

const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();

// Middleware
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // true if using HTTPS
}));

// ✅ MongoDB Atlas Connection using env variable
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("Connected to MongoDB"))
.catch(err => console.error("MongoDB connection error:", err));

// Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const itemSchema = new mongoose.Schema({
  name: String,
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Item = mongoose.model('Item', itemSchema);

// Middleware to require login
const requireLogin = (req, res, next) => {
  if (!req.session.userId) return res.redirect('/login');
  next();
};

// Utility function
function formatDate() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const today = new Date();
  const dayName = days[today.getDay()];
  const date = today.getDate();
  const monthName = months[today.getMonth()];
  let suffix = 'th';
  if (date % 10 === 1 && date !== 11) suffix = 'st';
  else if (date % 10 === 2 && date !== 12) suffix = 'nd';
  else if (date % 10 === 3 && date !== 13) suffix = 'rd';
  return `${dayName}, ${date}${suffix} ${monthName}`;
}

// Routes

// Home Route
app.get("/", requireLogin, async (req, res) => {
  try {
    const items = await Item.find({ 
      isDeleted: false, 
      userId: req.session.userId 
    }).sort({ createdAt: -1 });
    res.render("list", {
      listTitle: formatDate(),
      newListItems: items,
      username: req.session.username
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching items");
  }
});

// Authentication
app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('login', { error: null });
});

app.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('register', { error: null });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.render('login', { error: 'Invalid username or password' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.render('login', { error: 'Invalid username or password' });

    req.session.userId = user._id;
    req.session.username = user.username;
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send("Login error");
  }
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.render('register', { error: 'Username already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    req.session.userId = newUser._id;
    req.session.username = newUser.username;
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send("Registration error");
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Item Management
app.post('/add-item', requireLogin, async (req, res) => {
  const itemName = req.body.newItem;
  if (itemName && itemName.trim() !== "") {
    try {
      const item = new Item({ 
        name: itemName, 
        userId: req.session.userId 
      });
      await item.save();
      res.redirect('/');
    } catch (err) {
      console.error(err);
      res.status(500).send("Error adding item");
    }
  } else {
    res.redirect('/');
  }
});

app.post('/delete-item', requireLogin, async (req, res) => {
  try {
    await Item.findByIdAndUpdate(req.body.deleteItem, {
      isDeleted: true,
      deletedAt: new Date()
    });
    res.redirect('/');
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).send("Error marking item as deleted");
  }
});

// Server Start
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
