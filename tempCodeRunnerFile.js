code
app.put('/api/products/:id', upload.single('image'), async (req, res) => {
    try {
        console.log('Product update request received:', {
            params: req.params,
            body: req.body,
            file: req.file ? req.file.filename : 'No file uploaded'
        });

        const { name, category, price, stock, description } = req.body;
        const productId = req.params.id;

        if (!name || !category || !price || !stock) {
            console.log('Validation failed - missing required fields');
            return res.status(400).json({ error: "Name, category, price, and stock are required" });
        }

        // Find existing product
        const existingProduct = await Product.findById(productId);
        if (!existingProduct) {
            console.log('Product not found:', productId);
            return res.status(404).json({ error: "Product not found" });
        }

        // Handle image update
        let imageUrl = existingProduct.imageUrl;
        if (req.file) {
            // Delete old image if it's not the default
            if (existingProduct.imageUrl && existingProduct.imageUrl !== '/uploads/default-product.jpg') {
                const oldImagePath = path.join(__dirname, existingProduct.imageUrl);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
            imageUrl = '/uploads/' + req.file.filename;
        }

        // Update product
        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            {
                name,
                category,
                price: parseFloat(price),
                stock: parseInt(stock),
                description: description || "",
                imageUrl
            },
            { new: true }
        );

        console.log('Product updated successfully:', updatedProduct);
        res.json({
            message: "Product updated successfully",
            product: updatedProduct
        });
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({
            error: "Error updating product",
            details: error.message
        });
    }
});