require('dotenv').config(); 
const express = require('express');

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcrypt');
 
// const database = require('./database');
const saltRounds = 10;
// port 

const port = 8080;
const app = express();


app.use(cors());
app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// database();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb('Error: Images only!');
        }
    }
});

//database
const databaseConnection = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Database connected successfully");
  } catch (error) {
    console.log("Error while connecting to database", error);
    process.exit(1); 
  }
};




const contactSchema = new mongoose.Schema({
    name: { type: String, required: true },
    studentId: { type: String },
    email: { type: String, required: true },
    subject: { type: String },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, required: true },
    description: { type: String },
    imageUrl: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    customerPhone: { type: String, required: true },
    studentId: { type: String, required: true },
    deliveryAddress: { type: String, required: true },
    orderDate: { type: Date, default: Date.now },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true }
    }],
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, required: true },
    total: { type: Number, required: true },
    status: {
        type: String,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
        default: 'Pending'
    }
});

const userSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: {
        type: String,
        required: true,
        unique: true,
        validate: {
            validator: function (v) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: props => `${props.value} is not a valid email address!`
        }
    },
    phone: {
        type: String,
        required: true,
        validate: {
            validator: function (v) {
                return /^[0-9]{10,15}$/.test(v);
            },
            message: props => `${props.value} is not a valid phone number!`
        }
    },
    studentId: { type: String, required: true, unique: true },
    address: { type: String, required: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const paymentSchema = new mongoose.Schema({
    orderId: { type: String, required: true },
    paymentMethod: {
        type: String,
        required: true,
        enum: ['card', 'cash']
    },
    cardDetails: {
        number: { type: String },
        name: { type: String },
        expiry: { type: String },
        cvv: { type: String }
    },
    amount: { type: Number, required: true },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    paymentDate: { type: Date, default: Date.now }
});

// Models
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);
const Contact = mongoose.model('Contact', contactSchema);
const User = mongoose.model('User', userSchema);
const Payment = mongoose.model('Payment', paymentSchema);


// API Endpoints
app.get('/api/products/search', async (req, res) => {
    try {
        const {
            search,
            category,
            minPrice,
            maxPrice,
            inStock,
            sort = 'newest',
            page = 1,
            limit = 10
        } = req.query;

        // Build the aggregation pipeline
        const pipeline = [];
        const matchStage = {};

        // Text search
        if (search) {
            matchStage.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { category: { $regex: search, $options: 'i' } }
            ];
        }

        // Category filter
        if (category) {
            matchStage.category = { $regex: new RegExp(`^${category}$`, 'i') };
        }

        // Price range
        if (minPrice || maxPrice) {
            matchStage.price = {};
            if (minPrice) matchStage.price.$gte = parseFloat(minPrice);
            if (maxPrice) matchStage.price.$lte = parseFloat(maxPrice);
        }

        // Stock availability
        if (inStock === 'true') {
            matchStage.stock = { $gt: 0 };
        }

        // Add match stage if we have any conditions
        if (Object.keys(matchStage).length > 0) {
            pipeline.push({ $match: matchStage });
        }

        // Sorting
        const sortOptions = {
            'price-asc': { price: 1 },
            'price-desc': { price: -1 },
            'name-asc': { name: 1 },
            'name-desc': { name: -1 },
            'newest': { createdAt: -1 },
            'oldest': { createdAt: 1 }
        };

        if (sortOptions[sort]) {
            pipeline.push({ $sort: sortOptions[sort] });
        }

        // Count total documents before pagination
        const countPipeline = [...pipeline];
        countPipeline.push({ $count: 'total' });
        const countResult = await Product.aggregate(countPipeline);
        const total = countResult[0]?.total || 0;

        // Pagination
        const skip = (page - 1) * limit;
        pipeline.push(
            { $skip: skip },
            { $limit: parseInt(limit) }
        );

        // Execute the pipeline
        const products = await Product.aggregate(pipeline);

        res.json({
            success: true,
            data: products,
            pagination: {
                total,
                totalPages: Math.ceil(total / limit),
                currentPage: parseInt(page),
                itemsPerPage: parseInt(limit)
            }
        });
    } catch (error) {
        console.error("Search error:", error);
        res.status(500).json({
            success: false,
            error: "Search failed",
            details: error.message
        });
    }
});
// Product Endpoints
app.get('/api/products', async (req, res) => {
    try {
        const { search, category, minPrice, maxPrice, sort } = req.query;

        // Build the query pipeline
        const pipeline = [];

        // Match stage for search term
        if (search) {
            pipeline.push({
                $match: {
                    $or: [
                        { name: { $regex: search, $options: 'i' } },
                        { description: { $regex: search, $options: 'i' } },
                        { category: { $regex: search, $options: 'i' } }
                    ]
                }
            });
        }

        // Match stage for category filter
        if (category) {
            pipeline.push({
                $match: {
                    category: { $regex: new RegExp(`^${category}$`, 'i') }
                }
            });
        }

        // Match stage for price range
        if (minPrice || maxPrice) {
            const priceFilter = {};
            if (minPrice) priceFilter.$gte = parseFloat(minPrice);
            if (maxPrice) priceFilter.$lte = parseFloat(maxPrice);
            pipeline.push({
                $match: {
                    price: priceFilter
                }
            });
        }

        // Sort stage
        let sortOption = { createdAt: -1 }; // Default sort
        if (sort) {
            switch (sort) {
                case 'price-asc':
                    sortOption = { price: 1 };
                    break;
                case 'price-desc':
                    sortOption = { price: -1 };
                    break;
                case 'name-asc':
                    sortOption = { name: 1 };
                    break;
                case 'name-desc':
                    sortOption = { name: -1 };
                    break;
                case 'newest':
                    sortOption = { createdAt: -1 };
                    break;
                case 'oldest':
                    sortOption = { createdAt: 1 };
                    break;
            }
        }
        pipeline.push({ $sort: sortOption });

        // Execute the aggregation pipeline
        const products = await Product.aggregate(pipeline);

        res.json(products);
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ error: "Error fetching products" });
    }
});
app.post('/api/products', upload.single('image'), async (req, res) => {
    try {
        const { name, category, price, stock, description } = req.body;

        if (!name || !category || !price || !stock) {
            return res.status(400).json({ error: "Name, category, price, and stock are required" });
        }

        const imageUrl = req.file ? '/uploads/' + req.file.filename : '/uploads/default-product.jpg';

        const product = new Product({
            name,
            category,
            price: parseFloat(price),
            stock: parseInt(stock),
            description: description || "",
            imageUrl
        });

        await product.save();

        res.status(201).json({
            message: "Product created successfully",
            product
        });
    } catch (error) {
        console.error("Error creating product:", error);
        res.status(500).json({ error: "Error creating product" });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }

        // Delete the associated image file if it exists
        if (product.imageUrl && product.imageUrl !== '/uploads/default-product.jpg') {
            const imagePath = path.join(__dirname, product.imageUrl);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        res.json({ message: "Product deleted successfully" });
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({ error: "Error deleting product" });
    }
});
app.post('/api/payments', async (req, res) => {
    try {
        console.log('Received payment data:', req.body); // Log incoming data

        const { orderId, paymentMethod, cardDetails, amount } = req.body;

        if (!orderId) {
            console.error('Missing orderId');
            return res.status(400).json({ error: "Order ID is required" });
        }

        if (!paymentMethod) {
            console.error('Missing paymentMethod');
            return res.status(400).json({ error: "Payment method is required" });
        }

        if (!amount) {
            console.error('Missing amount');
            return res.status(400).json({ error: "Amount is required" });
        }

        if (paymentMethod === 'card') {
            if (!cardDetails || !cardDetails.number || !cardDetails.name) {
                console.error('Invalid card details:', cardDetails);
                return res.status(400).json({
                    error: "Card number and name are required for card payments"
                });
            }

            // Basic card validation
            const cleanCardNumber = cardDetails.number.replace(/\s+/g, '');
            if (cleanCardNumber.length !== 16 || !/^\d+$/.test(cleanCardNumber)) {
                console.error('Invalid card number format');
                return res.status(400).json({ error: "Invalid card number" });
            }
        }

        const payment = new Payment({
            orderId,
            paymentMethod,
            cardDetails: paymentMethod === 'card' ? {
                number: cardDetails.number.replace(/\s+/g, '').slice(-4), // Store only last 4 digits
                name: cardDetails.name,
                expiry: cardDetails.expiry,
                // Never store full CVV - this is just for demo
                cvv: '***' // In real app, don't store CVV at all
            } : null,
            amount,
            status: 'completed'
        });

        const savedPayment = await payment.save();
        console.log('Payment saved:', savedPayment);

        // Update order status
        const updatedOrder = await Order.findOneAndUpdate(
            { _id: orderId },
            { status: 'Processing' },
            { new: true }
        );

        if (!updatedOrder) {
            console.error('Order not found:', orderId);
            return res.status(404).json({ error: "Order not found" });
        }

        res.status(201).json({
            success: true,
            message: "Payment processed successfully",
            paymentId: savedPayment._id,
            orderId: savedPayment.orderId
        });

    } catch (error) {
        console.error("Payment processing error:", error);
        res.status(500).json({
            error: "Payment processing failed",
            details: error.message
        });
    }
});
// Order Endpoints
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find()
            .sort({ orderDate: -1 })
            .populate('items.productId');
        res.json(orders);
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ error: "Error fetching orders" });
    }
});
// Payment Endpoints
app.get('/api/payments', async (req, res) => {
    try {
        const payments = await Payment.find().sort({ paymentDate: -1 });
        res.json(payments);
    } catch (error) {
        console.error("Error fetching payments:", error);
        res.status(500).json({ error: "Error fetching payments" });
    }
});
app.get('/api/orders/:id', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('items.productId');
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }
        res.json(order);
    } catch (error) {
        console.error("Error fetching order:", error);
        res.status(500).json({ error: "Error fetching order" });
    }
});
// Get single product by ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }
        res.json(product);
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({ error: "Error fetching product" });
    }
});
app.get('/api/products', async (req, res) => {
    try {
        const {
            search,
            category,
            minPrice,
            maxPrice,
            sort,
            page = 1,
            limit = 10,
            fields
        } = req.query;

        // Build the query pipeline
        const pipeline = [];
        const matchStage = {};

        // Text search (if search parameter is provided)
        if (search) {
            matchStage.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Category filter
        if (category) {
            matchStage.category = { $regex: new RegExp(`^${category}$`, 'i') };
        }

        // Price range filter
        if (minPrice || maxPrice) {
            matchStage.price = {};
            if (minPrice) matchStage.price.$gte = parseFloat(minPrice);
            if (maxPrice) matchStage.price.$lte = parseFloat(maxPrice);
        }

        // Add match stage if we have any conditions
        if (Object.keys(matchStage).length > 0) {
            pipeline.push({ $match: matchStage });
        }

        // Sorting
        let sortOption = { createdAt: -1 }; // Default sort
        if (sort) {
            switch (sort) {
                case 'price-asc': sortOption = { price: 1 }; break;
                case 'price-desc': sortOption = { price: -1 }; break;
                case 'name-asc': sortOption = { name: 1 }; break;
                case 'name-desc': sortOption = { name: -1 }; break;
                case 'newest': sortOption = { createdAt: -1 }; break;
                case 'oldest': sortOption = { createdAt: 1 }; break;
            }
        }
        pipeline.push({ $sort: sortOption });

        // Projection (field selection)
        if (fields) {
            const fieldList = fields.split(',').reduce((acc, field) => {
                acc[field.trim()] = 1;
                return acc;
            }, {});
            pipeline.push({ $project: fieldList });
        }

        // Pagination
        const skip = (page - 1) * limit;
        pipeline.push(
            { $skip: skip },
            { $limit: parseInt(limit) }
        );

        // Count total documents for pagination info
        const countPipeline = [];
        if (Object.keys(matchStage).length > 0) {
            countPipeline.push({ $match: matchStage });
        }
        countPipeline.push({ $count: 'total' });

        const [products, countResult] = await Promise.all([
            Product.aggregate(pipeline),
            Product.aggregate(countPipeline)
        ]);

        const total = countResult.length > 0 ? countResult[0].total : 0;
        const totalPages = Math.ceil(total / limit);

        res.json({
            products,
            pagination: {
                total,
                totalPages,
                currentPage: parseInt(page),
                itemsPerPage: parseInt(limit),
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            }
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ error: "Error fetching products" });
    }
});
app.use(cors({
    origin: 'http://localhost', // or your client's origin
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.post('/api/orders', async (req, res) => {
    try {
        const {
            customerName,
            customerEmail,
            customerPhone,
            studentId,
            deliveryAddress,
            items,
            subtotal,
            deliveryFee,
            total
        } = req.body;

        if (!customerName || !customerEmail || !customerPhone || !studentId || !deliveryAddress ||
            !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: "All fields are required and items must not be empty" });
        }

        for (const item of items) {
            if (!item.productId || !item.name || !item.quantity || !item.price) {
                return res.status(400).json({ error: "Each item must have productId, name, quantity, and price" });
            }
        }

        const order = new Order({
            customerName,
            customerEmail,
            customerPhone,
            studentId,
            deliveryAddress,
            items,
            subtotal,
            deliveryFee,
            total,
            status: 'Pending'
        });

        await order.save();

        for (const item of items) {
            await Product.findByIdAndUpdate(item.productId, {
                $inc: { stock: -item.quantity }
            });
        }

        res.status(201).json({
            message: "Order created successfully",
            orderId: order._id,
            order
        });
    } catch (error) {
        console.error("Error creating order:", error);
        res.status(500).json({ error: "Error creating order" });
    }
});

app.patch('/api/orders/:id/status', async (req, res) => {
    try {
        const { status } = req.body;

        if (!['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'].includes(status)) {
            return res.status(400).json({ error: "Invalid status" });
        }

        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );

        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        if (status === 'Cancelled') {
            for (const item of order.items) {
                await Product.findByIdAndUpdate(item.productId, {
                    $inc: { stock: item.quantity }
                });
            }
        }

        res.json({ message: "Order status updated successfully", order });
    } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ error: "Error updating order status" });
    }
});
// Add this endpoint to your Node.js 
// Add this to your server code (replace the incomplete PUT endpoint)
app.put('/api/products/:id', upload.single('image'), async (req, res) => {
    try {
        const { name, category, price, stock, description } = req.body;
        const productId = req.params.id;

        if (!name || !category || !price || !stock) {
            return res.status(400).json({ error: "Name, category, price, and stock are required" });
        }

        const updateData = {
            name,
            category,
            price: parseFloat(price),
            stock: parseInt(stock),
            description: description || ""
        };

        // Handle image update if new image is provided
        if (req.file) {
            // First get the old product to delete its image
            const oldProduct = await Product.findById(productId);
            if (oldProduct && oldProduct.imageUrl && oldProduct.imageUrl !== '/uploads/default-product.jpg') {
                const oldImagePath = path.join(__dirname, oldProduct.imageUrl);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }

            updateData.imageUrl = '/uploads/' + req.file.filename;
        }

        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            updateData,
            { new: true }
        );

        if (!updatedProduct) {
            return res.status(404).json({ error: "Product not found" });
        }

        res.json({
            message: "Product updated successfully",
            product: updatedProduct
        });
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ error: "Error updating product" });
    }
});
// User Endpoints
app.post('/post', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, studentId, address, password } = req.body;

        if (!firstName || !lastName || !email || !phone || !studentId || !address || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const existingUser = await User.findOne({ $or: [{ email }, { studentId }] });
        if (existingUser) {
            return res.status(400).json({
                error: "User with this email or student ID already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const user = new User({
            firstName,
            lastName,
            email,
            phone,
            studentId,
            address,
            password: hashedPassword
        });

        await user.save();

        res.status(201).json({
            message: "User registered successfully",
            userId: user._id
        });
    } catch (error) {
        console.error("Error registering user:", error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: "Error registering user" });
    }
});

// Contact Endpoint
app.post('/contact', async (req, res) => {
    try {
        const { name, studentId, email, subject, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ error: "Name, email, and message are required" });
        }

        const contact = new Contact({
            name,
            studentId: studentId || null,
            email,
            subject: subject || "No subject",
            message
        });

        await contact.save();

        res.status(201).json({
            message: "Thank you for your message! We'll get back to you soon.",
            contactId: contact._id
        });
    } catch (error) {
        console.error("Error saving contact:", error);
        res.status(500).json({ error: "Error saving your message. Please try again." });
    }
});



// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message });
});

app.listen(port, () => {
     databaseConnection();
    console.log(`Server started on port ${port}`);
});