// NOTE: Create a .env file in the project root with the following variables for Gmail OTP to work:
// EMAIL_USER=your-gmail-address@gmail.com
// EMAIL_PASS=your-app-password
//
// You may need to generate an App Password in your Google Account if 2FA is enabled.
const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

//database connection
const db = mysql.createConnection({
  host: 'bkairnmvqsaphl2rmoy3-mysql.services.clever-cloud.com',
  user: 'uj81pdkbwc7bv4zw',
  password: 'ffsgdxUyFoZRs3vsNf5E',
  database: 'bkairnmvqsaphl2rmoy3',
  port: 3306
});

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dor6sp4ov',
  api_key: process.env.CLOUDINARY_API_KEY || '546864234475329',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'vCezudNb-V7GoXFSy8ie2Hms4Gc'
});




// Create tables
const createTables = () => {
  // Users table
  db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      phone VARCHAR(20),
      location VARCHAR(100),
      profile_image VARCHAR(255),
      is_verified BOOLEAN DEFAULT FALSE,
      otp VARCHAR(6),
      otp_expires DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Posts table
  db.execute(`
    CREATE TABLE IF NOT EXISTS posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      crop_name VARCHAR(100) NOT NULL,
      area DECIMAL(10,2) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      location VARCHAR(100),
      price DECIMAL(10,2),
      quantity VARCHAR(50),
      description TEXT,
      image VARCHAR(255),
      likes_count INT DEFAULT 0,
      sold BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Likes table
  db.execute(`
    CREATE TABLE IF NOT EXISTS likes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      post_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      UNIQUE KEY unique_like (user_id, post_id)
    )
  `);

  // Comments table
  db.execute(`
    CREATE TABLE IF NOT EXISTS comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      post_id INT NOT NULL,
      comment TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    )
  `);

  // Wishlist table
  db.execute(`
    CREATE TABLE IF NOT EXISTS wishlist (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      post_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      UNIQUE KEY unique_wishlist (user_id, post_id)
    )
  `);

  // Messages table
  db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sender_id INT NOT NULL,
      receiver_id INT NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);


  // Reports table
  db.execute(`
    CREATE TABLE IF NOT EXISTS reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reporter_id INT NOT NULL,
      reported_user_id INT,
      post_id INT,
      type ENUM('fraud', 'spam', 'inappropriate') NOT NULL,
      description TEXT NOT NULL,
      status ENUM('pending', 'reviewed', 'resolved') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL
    )
  `);

  // Farming Tips table
  db.execute(`
    CREATE TABLE IF NOT EXISTS farming_tips (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tip TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Machinery Requests table
  db.execute(`
    CREATE TABLE IF NOT EXISTS machinery_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      purpose TEXT NOT NULL,
      phone VARCHAR(20),
      image VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Machinery Posts table
  db.execute(`
    CREATE TABLE IF NOT EXISTS machinery_posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      purpose TEXT NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      status ENUM('available', 'out_of_stock') DEFAULT 'available',
      image VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
};

createTables();

// Cloudinary upload utility function
const uploadToCloudinary = async (file) => {
  try {
    if (!file) return null;
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.');
    }
    
    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('File size too large. Maximum size is 5MB.');
    }
    
    // Convert buffer to base64
    const b64 = Buffer.from(file.buffer).toString('base64');
    const dataURI = `data:${file.mimetype};base64,${b64}`;
    
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'farmconnect',
      resource_type: 'auto',
      transformation: [
        { width: 800, height: 600, crop: 'limit' }, // Resize large images
        { quality: 'auto', fetch_format: 'auto' } // Optimize quality and format
      ]
    });
    
    console.log('Image uploaded to Cloudinary:', result.secure_url);
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    if (error.message.includes('Invalid file type') || error.message.includes('File size too large')) {
      throw error;
    }
    throw new Error('Failed to upload image to Cloudinary. Please try again.');
  }
};

// Optionally, you can add a scheduled cleanup for unverified users after X hours/days to keep the database clean.
// This is not required for basic OTP flow, but can be implemented with a scheduled job or manual script.


// Add status and reply columns to reports table if not present
// Add missing columns safely
function addColumnIfNotExists(table, column, type) {
  db.query(
    `SHOW COLUMNS FROM \`${table}\` LIKE ?`,
    [column],
    (err, results) => {
      if (err) return console.error(`Error checking column ${column} in ${table}:`, err);
      if (results.length === 0) {
        db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`, (err) => {
          if (err) console.error(`Failed to add column ${column} to ${table}:`, err);
          else console.log(`Added column ${column} to ${table}`);
        });
      }
    }
  );
}

// Fix reports table
addColumnIfNotExists('reports', 'reply', 'TEXT');

// Fix posts table
addColumnIfNotExists('posts', 'sold', 'BOOLEAN DEFAULT FALSE');

// Fix messages table
addColumnIfNotExists('messages', 'media_url', 'VARCHAR(255)');
addColumnIfNotExists('messages', 'media_type', 'VARCHAR(100)');


// Add sold column to posts table if not present
// const alterPostsTable = `ALTER TABLE posts ADD COLUMN IF NOT EXISTS sold BOOLEAN DEFAULT FALSE`;
// db.execute(alterPostsTable, (err) => {
//     if (err) console.error('Failed to alter posts table:', err);
// });

// Add media columns to messages table if not present
// const alterMessagesTable = `ALTER TABLE messages 
//     ADD COLUMN IF NOT EXISTS media_url VARCHAR(255),
//     ADD COLUMN IF NOT EXISTS media_type VARCHAR(100)`;
// db.execute(alterMessagesTable, (err) => {
//     if (err) console.error('Failed to alter messages table:', err);
// });

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Endpoint to update sold status (owner only)
app.put('/api/posts/:id/sold', authenticateToken, (req, res) => {
    const postId = req.params.id;
    const { sold } = req.body;
    db.execute('UPDATE posts SET sold = ? WHERE id = ? AND user_id = ?', [sold, postId, req.user.userId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Failed to update sold status' });
        if (result.affectedRows === 0) return res.status(403).json({ error: 'Not authorized or post not found' });
        res.json({ message: 'Status updated' });
    });
});

// File upload configuration - using memory storage for Cloudinary
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'connects2farm@gmail.com',
    pass: process.env.EMAIL_PASS || 'gmarjwafytubujcw'
  }
});

// Routes

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    cloudinary: {
      configured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
    }
  });
});

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, phone, location } = req.body;
    
    // Check if user exists
    db.execute('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (results.length > 0) return res.status(400).json({ error: 'User already exists' });

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Generate OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Insert user
      db.execute(
        'INSERT INTO users (name, email, password, phone, location, otp, otp_expires) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [name, email, hashedPassword, phone, location, otp, otpExpires],
        (err, result) => {
          if (err) return res.status(500).json({ error: 'Failed to create user' });

          // Send OTP email using nodemailer
          const mailOptions = {
            from: process.env.EMAIL_USER || 'your-email@gmail.com',
            to: email,
            subject: 'FarmConnect Email Verification OTP',
            text: `Your FarmConnect OTP is: ${otp}. It is valid for 10 minutes.`
          };
          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
              console.error('Error sending OTP email:', error);
              return res.status(500).json({ error: 'Failed to send OTP email' });
            }
            res.json({ message: 'User registered. Please verify your email with OTP.', userId: result.insertId });
          });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Resend OTP
app.post('/api/resend-otp', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'User ID required' });

  // Generate new OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Update user with new OTP
  db.execute(
    'UPDATE users SET otp = ?, otp_expires = ? WHERE id = ?',
    [otp, otpExpires, userId],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      // Get user email
      db.execute('SELECT email FROM users WHERE id = ?', [userId], (err, results) => {
        if (err || results.length === 0) return res.status(500).json({ error: 'Failed to get user email' });
        const email = results[0].email;
        // Send OTP email using nodemailer
        const mailOptions = {
          from: process.env.EMAIL_USER || 'your-email@gmail.com',
          to: email,
          subject: 'FarmConnect Email Verification OTP (Resend)',
          text: `Your new FarmConnect OTP is: ${otp}. It is valid for 10 minutes.`
        };
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error('Error resending OTP email:', error);
            return res.status(500).json({ error: 'Failed to resend OTP email' });
          }
          res.json({ message: 'OTP resent successfully' });
        });
      });
    }
  );
});

// Verify OTP
app.post('/api/verify-otp', (req, res) => {
  const { userId, otp } = req.body;

  db.execute(
    'SELECT * FROM users WHERE id = ? AND otp = ? AND otp_expires > NOW()',
    [userId, otp],
    (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (results.length === 0) return res.status(400).json({ error: 'Invalid or expired OTP' });

      // Update user as verified
      db.execute(
        'UPDATE users SET is_verified = TRUE, otp = NULL, otp_expires = NULL WHERE id = ?',
        [userId],
        (err) => {
          if (err) return res.status(500).json({ error: 'Failed to verify user' });
          res.json({ message: 'Email verified successfully' });
        }
      );
    }
  );
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    db.execute('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (results.length === 0) return res.status(400).json({ error: 'User not found' });

      const user = results[0];
      if (!user.is_verified) return res.status(400).json({ error: 'Please verify your email first' });

      // Ensure bcrypt is used correctly
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
      );

      res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get posts
app.get('/api/posts', (req, res) => {
  const query = `
    SELECT p.*, u.name as user_name, u.profile_image as user_image,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count,
           p.sold
    FROM posts p
    JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC
  `;

  db.execute(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// Create post
app.post('/api/posts', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { crop_name, area, phone, location, price, quantity, description } = req.body;
    
    // Upload image to Cloudinary if provided
    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file);
    }

    db.execute(
      'INSERT INTO posts (user_id, crop_name, area, phone, location, price, quantity, description, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.userId, crop_name, area, phone, location, price, quantity, description, imageUrl],
      (err, result) => {
        if (err) return res.status(500).json({ error: 'Failed to create post' });
        res.json({ message: 'Post created successfully', postId: result.insertId });
      }
    );
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Like/Unlike post
app.post('/api/posts/:id/like', authenticateToken, (req, res) => {
  const postId = req.params.id;
  const userId = req.user.userId;

  // Check if already liked
  db.execute('SELECT * FROM likes WHERE user_id = ? AND post_id = ?', [userId, postId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });

    if (results.length > 0) {
      // Unlike
      db.execute('DELETE FROM likes WHERE user_id = ? AND post_id = ?', [userId, postId], (err) => {
        if (err) return res.status(500).json({ error: 'Failed to unlike' });
        
        // Get updated like count
        db.execute('SELECT COUNT(*) as count FROM likes WHERE post_id = ?', [postId], (err, countResults) => {
          if (err) return res.status(500).json({ error: 'Failed to get like count' });
          res.json({ 
            message: 'Post unliked', 
            liked: false, 
            likeCount: countResults[0].count 
          });
        });
      });
    } else {
      // Like
      db.execute('INSERT INTO likes (user_id, post_id) VALUES (?, ?)', [userId, postId], (err) => {
        if (err) return res.status(500).json({ error: 'Failed to like' });
        
        // Get updated like count
        db.execute('SELECT COUNT(*) as count FROM likes WHERE post_id = ?', [postId], (err, countResults) => {
          if (err) return res.status(500).json({ error: 'Failed to get like count' });
          res.json({ 
            message: 'Post liked', 
            liked: true, 
            likeCount: countResults[0].count 
          });
        });
      });
    }
  });
});

// Add comment
app.post('/api/posts/:id/comments', authenticateToken, (req, res) => {
  const postId = req.params.id;
  const { comment } = req.body;

  db.execute(
    'INSERT INTO comments (user_id, post_id, comment) VALUES (?, ?, ?)',
    [req.user.userId, postId, comment],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to add comment' });
      res.json({ message: 'Comment added successfully' });
    }
  );
});

// Get comments
app.get('/api/posts/:id/comments', (req, res) => {
  const postId = req.params.id;

  const query = `
    SELECT c.*, u.name as user_name, u.profile_image as user_image
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at DESC
  `;

  db.execute(query, [postId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// Wishlist operations
app.post('/api/wishlist/:postId', authenticateToken, (req, res) => {
  const postId = req.params.postId;
  const userId = req.user.userId;

  // Check if already in wishlist
  db.execute('SELECT * FROM wishlist WHERE user_id = ? AND post_id = ?', [userId, postId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });

    if (results.length > 0) {
      // Remove from wishlist
      db.execute('DELETE FROM wishlist WHERE user_id = ? AND post_id = ?', [userId, postId], (err) => {
        if (err) return res.status(500).json({ error: 'Failed to remove from wishlist' });
        res.json({ message: 'Removed from wishlist', inWishlist: false });
      });
    } else {
      // Add to wishlist
      db.execute('INSERT INTO wishlist (user_id, post_id) VALUES (?, ?)', [userId, postId], (err) => {
        if (err) return res.status(500).json({ error: 'Failed to add to wishlist' });
        res.json({ message: 'Added to wishlist', inWishlist: true });
      });
    }
  });
});

// Get user wishlist
app.get('/api/wishlist', authenticateToken, (req, res) => {
  const query = `
    SELECT p.*, u.name as user_name, u.profile_image as user_image
    FROM wishlist w
    JOIN posts p ON w.post_id = p.id
    JOIN users u ON p.user_id = u.id
    WHERE w.user_id = ?
    ORDER BY w.created_at DESC
  `;

  db.execute(query, [req.user.userId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// Submit report
app.post('/api/reports', authenticateToken, (req, res) => {
  const { reported_user_id, post_id, type, description } = req.body;

  db.execute(
    'INSERT INTO reports (reporter_id, reported_user_id, post_id, type, description) VALUES (?, ?, ?, ?, ?)',
    [req.user.userId, reported_user_id, post_id, type, description],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to submit report' });
      res.json({ message: 'Report submitted successfully' });
    }
  );
});

// Get user profile
app.get('/api/profile', authenticateToken, (req, res) => {
  db.execute('SELECT id, name, email, phone, location, profile_image FROM users WHERE id = ?', [req.user.userId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(results[0]);
  });
});

// Update profile
app.put('/api/profile', authenticateToken, upload.single('profile_image'), async (req, res) => {
  try {
    const { name, phone, location } = req.body;
    
    // Upload profile image to Cloudinary if provided
    let profileImageUrl = null;
    if (req.file) {
      profileImageUrl = await uploadToCloudinary(req.file);
    }

    let query = 'UPDATE users SET name = ?, phone = ?, location = ?';
    let params = [name, phone, location];

    if (profileImageUrl) {
      query += ', profile_image = ?';
      params.push(profileImageUrl);
    }

    query += ' WHERE id = ?';
    params.push(req.user.userId);

    db.execute(query, params, (err) => {
      if (err) return res.status(500).json({ error: 'Failed to update profile' });
      res.json({ message: 'Profile updated successfully' });
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password endpoint
app.post('/api/change-password', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  db.execute('SELECT password FROM users WHERE id = ?', [userId], async (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(404).json({ error: 'User not found' });
    const valid = await bcrypt.compare(currentPassword, results[0].password);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    const hashed = await bcrypt.hash(newPassword, 10);
    db.execute('UPDATE users SET password = ? WHERE id = ?', [hashed, userId], (err) => {
      if (err) return res.status(500).json({ error: 'Failed to update password' });
      res.json({ message: 'Password changed successfully' });
    });
  });
});

// Socket.io for real-time messaging
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Remove room join logic
  // socket.on('join', (userId) => {
  //   socket.join(userId.toString());
  //   console.log(`User ${userId} joined room ${userId} (socket: ${socket.id})`);
  // });

  socket.on('sendMessage', (data) => {
    console.log('sendMessage event received:', data, 'from socket:', socket.id);
    const { senderId, receiverId, message } = data;
    // Save message to database
    db.execute(
      'INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)',
      [senderId, receiverId, message],
      (err, result) => {
        if (!err) {
          const messageData = {
            id: result.insertId,
            sender_id: parseInt(senderId),
            receiver_id: parseInt(receiverId),
            message: message,
            created_at: new Date()
          };
          // Emit to all connected clients (clients will filter on their side)
          io.emit('newMessage', messageData);
          console.log(`Message sent from ${senderId} to ${receiverId}`);
        } else {
          console.error('Error saving message:', err);
        }
      }
    );
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});


// Get conversations
app.get('/api/conversations', authenticateToken, (req, res) => {
  const query = `
    SELECT DISTINCT 
      CASE 
        WHEN m.sender_id = ? THEN m.receiver_id 
        ELSE m.sender_id 
      END as user_id,
      u.name, u.profile_image,
      (SELECT CASE 
         WHEN media_url IS NOT NULL THEN CONCAT('[Media] ', COALESCE(message, ''))
         ELSE message 
       END FROM messages 
       WHERE (sender_id = ? AND receiver_id = user_id) OR (sender_id = user_id AND receiver_id = ?)
       ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT created_at FROM messages 
       WHERE (sender_id = ? AND receiver_id = user_id) OR (sender_id = user_id AND receiver_id = ?)
       ORDER BY created_at DESC LIMIT 1) as last_message_time
    FROM messages m
    JOIN users u ON u.id = CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END
    WHERE m.sender_id = ? OR m.receiver_id = ?
    ORDER BY last_message_time DESC
  `;

  const userId = req.user.userId;
  db.execute(query, [userId, userId, userId, userId, userId, userId, userId, userId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// Get messages
app.get('/api/messages/:userId', authenticateToken, (req, res) => {
  const otherUserId = req.params.userId;
  const currentUserId = req.user.userId;

  const query = `
    SELECT m.*, u.name as sender_name,
           m.media_url as media, m.media_type as mediaType
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
    ORDER BY m.created_at ASC
  `;

  db.execute(query, [currentUserId, otherUserId, otherUserId, currentUserId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// Mark messages as read
app.post('/api/messages/:userId/mark-read', authenticateToken, (req, res) => {
  const otherUserId = req.params.userId;
  const currentUserId = req.user.userId;

  db.execute(
    'UPDATE messages SET is_read = TRUE WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE',
    [otherUserId, currentUserId],
    (err) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ message: 'Messages marked as read' });
    }
  );
});

// Get unread message count
app.get('/api/messages/unread-count', authenticateToken, (req, res) => {
  const currentUserId = req.user.userId;

  db.execute(
    'SELECT COUNT(*) as unreadCount FROM messages WHERE receiver_id = ? AND is_read = FALSE',
    [currentUserId],
    (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ unreadCount: results[0].unreadCount });
    }
  );
});

// Machinery API endpoints

// Get machinery requests
app.get('/api/machinery-requests', (req, res) => {
  const query = `
    SELECT mr.*, u.name as user_name, u.profile_image as user_image
    FROM machinery_requests mr
    JOIN users u ON mr.user_id = u.id
    ORDER BY mr.created_at DESC
  `;

  db.execute(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// Create machinery request
app.post('/api/machinery-requests', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { name, purpose, phone } = req.body;
    
    // Upload image to Cloudinary if provided
    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file);
    }

    // Ensure all parameters are defined
    const userId = req.user.userId;
    const machineryName = name || '';
    const machineryPurpose = purpose || '';
    const phoneNumber = phone || null;
    const image = imageUrl || null;

    db.execute(
      'INSERT INTO machinery_requests (user_id, name, purpose, phone, image) VALUES (?, ?, ?, ?, ?)',
      [userId, machineryName, machineryPurpose, phoneNumber, image],
      (err, result) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to create machinery request' });
        }
        res.json({ message: 'Machinery request created successfully', requestId: result.insertId });
      }
    );
  } catch (error) {
    console.error('Error creating machinery request:', error);
    res.status(500).json({ error: 'Failed to create machinery request' });
  }
});

// Delete machinery request (admin only)
app.delete('/api/machinery-requests/:id', authenticateToken, (req, res) => {
  // Check if user is admin (you can add admin check logic here)
  db.execute('DELETE FROM machinery_requests WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to delete machinery request' });
    res.json({ message: 'Machinery request deleted' });
  });
});

// Get machinery posts
app.get('/api/machinery-posts', (req, res) => {
  const query = `
    SELECT mp.*, u.name as user_name, u.profile_image as user_image
    FROM machinery_posts mp
    JOIN users u ON mp.user_id = u.id
    ORDER BY mp.created_at DESC
  `;

  db.execute(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// Create machinery post
app.post('/api/machinery-posts', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { name, purpose, price, phone, status } = req.body;
    
    // Upload image to Cloudinary if provided
    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file);
    }

    // Ensure all parameters are defined
    const userId = req.user.userId;
    const machineryName = name || '';
    const machineryPurpose = purpose || '';
    const machineryPrice = price || 0;
    const phoneNumber = phone || '';
    const machineryStatus = status || 'available';
    const image = imageUrl || null;

    db.execute(
      'INSERT INTO machinery_posts (user_id, name, purpose, price, phone, status, image) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, machineryName, machineryPurpose, machineryPrice, phoneNumber, machineryStatus, image],
      (err, result) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to create machinery post' });
        }
        res.json({ message: 'Machinery post created successfully', postId: result.insertId });
      }
    );
  } catch (error) {
    console.error('Error creating machinery post:', error);
    res.status(500).json({ error: 'Failed to create machinery post' });
  }
});

// Update machinery status (owner only)
app.put('/api/machinery-posts/:id/status', authenticateToken, (req, res) => {
  const { status } = req.body;
  const postId = req.params.id;

  // Check if user owns the post
  db.execute('SELECT user_id FROM machinery_posts WHERE id = ?', [postId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(404).json({ error: 'Machinery post not found' });
    if (results[0].user_id !== req.user.userId) return res.status(403).json({ error: 'Not authorized' });

    db.execute('UPDATE machinery_posts SET status = ? WHERE id = ?', [status, postId], (err) => {
      if (err) return res.status(500).json({ error: 'Failed to update status' });
      res.json({ message: 'Status updated successfully' });
    });
  });
});

// Delete machinery post (admin or owner)
app.delete('/api/machinery-posts/:id', authenticateToken, (req, res) => {
  const postId = req.params.id;

  // Check if user owns the post or is admin
  db.execute('SELECT user_id FROM machinery_posts WHERE id = ?', [postId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(404).json({ error: 'Machinery post not found' });
    
    // Allow deletion if user owns the post or is admin (you can add admin check logic here)
    if (results[0].user_id !== req.user.userId) {
      // Add admin check here if needed
      // return res.status(403).json({ error: 'Not authorized' });
    }

    db.execute('DELETE FROM machinery_posts WHERE id = ?', [postId], (err) => {
      if (err) return res.status(500).json({ error: 'Failed to delete machinery post' });
      res.json({ message: 'Machinery post deleted' });
    });
  });
});

// Admin endpoints (no authentication for demo)
app.get('/api/admin/users', (req, res) => {
  db.execute('SELECT id, name, email, phone, location, is_verified FROM users', (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});
app.delete('/api/admin/users/:id', (req, res) => {
  db.execute('DELETE FROM users WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to delete user' });
    res.json({ message: 'User deleted' });
  });
});
app.get('/api/admin/crops', (req, res) => {
  db.execute('SELECT p.*, u.name as user_name FROM posts p JOIN users u ON p.user_id = u.id', (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});
app.delete('/api/admin/crops/:id', (req, res) => {
  db.execute('DELETE FROM posts WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to delete crop' });
    res.json({ message: 'Crop deleted' });
  });
});
app.get('/api/admin/reports', (req, res) => {
  db.execute(`SELECT r.*, 
    u1.name as reporter_name, 
    u2.name as reported_user_name
    FROM reports r
    JOIN users u1 ON r.reporter_id = u1.id
    LEFT JOIN users u2 ON r.reported_user_id = u2.id`, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// Admin machinery endpoints
app.get('/api/admin/machinery', (req, res) => {
  db.execute('SELECT mp.*, u.name as user_name FROM machinery_posts mp JOIN users u ON mp.user_id = u.id', (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

app.get('/api/admin/machinery-requests', (req, res) => {
  db.execute('SELECT mr.*, u.name as user_name FROM machinery_requests mr JOIN users u ON mr.user_id = u.id', (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// Admin delete machinery request
app.delete('/api/admin/machinery-requests/:id', (req, res) => {
  db.execute('DELETE FROM machinery_requests WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to delete machinery request' });
    res.json({ message: 'Machinery request deleted' });
  });
});

// Admin delete machinery post
app.delete('/api/admin/machinery-posts/:id', (req, res) => {
  db.execute('DELETE FROM machinery_posts WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to delete machinery post' });
    res.json({ message: 'Machinery post deleted' });
  });
});

app.get('/api/admin/posts', (req, res) => {
  db.execute('SELECT p.*, u.name as user_name FROM posts p JOIN users u ON p.user_id = u.id', (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

app.delete('/api/admin/posts/:id', (req, res) => {
  db.execute('DELETE FROM posts WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to delete post' });
    res.json({ message: 'Post deleted' });
  });
});

// Admin stats endpoint
app.get('/api/admin/stats', (req, res) => {
  const stats = {};
  
  // Get user count
  db.execute('SELECT COUNT(*) as count FROM users', (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    stats.users = results[0].count;
    
    // Get post count
    db.execute('SELECT COUNT(*) as count FROM posts', (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      stats.posts = results[0].count;
      
      // Get machinery count
      db.execute('SELECT COUNT(*) as count FROM machinery_posts', (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        stats.machinery = results[0].count;
        
        // Get request count
        db.execute('SELECT COUNT(*) as count FROM machinery_requests', (err, results) => {
          if (err) return res.status(500).json({ error: 'Database error' });
          stats.requests = results[0].count;
          
          res.json(stats);
        });
      });
    });
  });
});
app.delete('/api/admin/reports/:id', (req, res) => {
  db.execute('DELETE FROM reports WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to delete report' });
    res.json({ message: 'Report deleted' });
  });
});

// --- Farming Tips Endpoints ---
// Public: Get all tips
app.get('/api/farming-tips', (req, res) => {
  db.execute('SELECT * FROM farming_tips ORDER BY created_at DESC', (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});
// Admin: Add tip
app.post('/api/admin/farming-tips', (req, res) => {
  const { tip } = req.body;
  if (!tip) return res.status(400).json({ error: 'Tip required' });
  db.execute('INSERT INTO farming_tips (tip) VALUES (?)', [tip], (err, result) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ message: 'Tip added', id: result.insertId });
  });
});
// Admin: Edit tip
app.put('/api/admin/farming-tips/:id', (req, res) => {
  const { tip } = req.body;
  if (!tip) return res.status(400).json({ error: 'Tip required' });
  db.execute('UPDATE farming_tips SET tip = ? WHERE id = ?', [tip, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ message: 'Tip updated' });
  });
});
// Admin: Delete tip
app.delete('/api/admin/farming-tips/:id', (req, res) => {
  db.execute('DELETE FROM farming_tips WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ message: 'Tip deleted' });
  });
});

// --- Platform Stats Endpoint ---
app.get('/api/platform-stats', async (req, res) => {
  try {
    db.query('SELECT COUNT(*) AS farmers FROM users', (err, usersResult) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      db.query('SELECT COUNT(*) AS crops FROM posts', (err, postsResult) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        db.query('SELECT COUNT(*) AS trades FROM posts WHERE sold = TRUE', (err, soldResult) => {
          if (err) return res.status(500).json({ error: 'Database error' });
          db.query('SELECT COUNT(*) AS available FROM posts WHERE sold = FALSE', (err, availableResult) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({
              farmers: usersResult[0].farmers,
              crops: postsResult[0].crops,
              trades: soldResult[0].trades,
              available: availableResult[0].available
            });
          });
        });
      });
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user's reports
app.get('/api/reports', authenticateToken, (req, res) => {
    db.execute('SELECT * FROM reports WHERE reporter_id = ? ORDER BY created_at DESC', [req.user.userId], (err, results) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch reports' });
        res.json(results);
    });
});

// Admin: update report status and reply
app.put('/api/admin/reports/:id', (req, res) => {
    const { status, reply } = req.body;
    db.execute('UPDATE reports SET status = ?, reply = ? WHERE id = ?', [status, reply, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Failed to update report' });
        // Optionally, send notification to reporter and reported user here
        res.json({ message: 'Report updated' });
    });
});

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});