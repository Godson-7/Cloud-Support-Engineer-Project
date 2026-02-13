const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, DeleteCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ 
    region: process.env.AWS_REGION || 'us-east-1' 
});
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    console.log('AdminProducts Lambda invoked:', event.httpMethod, event.path);
    
    // ==================== CORS HANDLING ====================
    // Handle OPTIONS request (CORS preflight)
    if (event.httpMethod === 'OPTIONS') {
        console.log('Handling OPTIONS request for CORS preflight');
        return {
            statusCode: 200,
            headers: getCorsHeaders(),
            body: ''
        };
    }
    
    try {
        // ==================== AUTHENTICATION ====================
        const authHeader = event.headers?.Authorization || event.headers?.authorization;
        
        if (!authHeader) {
            console.error('No authorization header found');
            return {
                statusCode: 401,
                headers: getCorsHeaders(),
                body: JSON.stringify({ 
                    error: 'No authorization header',
                    message: 'Please login first'
                })
            };
        }
        
        // Extract token
        const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
        console.log('Token received');
        
        // TODO: Add JWT verification here
        
        let body = {};
        if (event.body) {
            try {
                body = JSON.parse(event.body);
            } catch (parseError) {
                console.error('JSON parse error:', parseError);
                return {
                    statusCode: 400,
                    headers: getCorsHeaders(),
                    body: JSON.stringify({ 
                        error: 'Invalid JSON body'
                    })
                };
            }
        }
        
        const httpMethod = event.httpMethod;
        const path = event.path;
        const queryParams = event.queryStringParameters || {};
        
        console.log(`Processing ${httpMethod} ${path}`);
        
        // ==================== ROUTING ====================
        // Handle /products routes
        if (path === '/products') {
            if (httpMethod === 'GET') {
                const shop = queryParams.shop || 'all'; // Default to 'all'
                console.log(`Getting products for shop: ${shop}`);
                return await getProducts(shop);
            }
            else if (httpMethod === 'POST') {
                console.log('Creating new product');
                return await addProduct(body);
            }
        }
        else if (path.startsWith('/products/')) {
            const pathParts = path.split('/').filter(p => p);
            if (pathParts.length >= 2) {
                const productId = pathParts[1];
                
                if (httpMethod === 'PUT') {
                    console.log(`Updating product: ${productId}`);
                    return await updateProduct(productId, body);
                }
                else if (httpMethod === 'DELETE') {
                    console.log(`Deleting product: ${productId}`);
                    return await deleteProduct(productId, body);
                }
            }
        }
        
        return {
            statusCode: 404,
            headers: getCorsHeaders(),
            body: JSON.stringify({ 
                error: 'Not found',
                message: `No handler for ${httpMethod} ${path}`
            })
        };
        
    } catch (error) {
        console.error('AdminProducts error:', error);
        return {
            statusCode: 500,
            headers: getCorsHeaders(),
            body: JSON.stringify({ 
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};

// ==================== BUSINESS LOGIC ====================

async function getProducts(shopFilter) {
    console.log(`🛍️ Getting products. Filter: ${shopFilter}`);
    
    // Define which shops to query
    let shopsToQuery;
    if (shopFilter === 'all' || !shopFilter) {
        shopsToQuery = ['RaymakossaShop', 'TarsoShop', 'MarketShop'];
        console.log('Querying ALL shops:', shopsToQuery);
    } else {
        // Convert frontend shop name to table name
        if (shopFilter === 'Raymakossa') shopsToQuery = ['RaymakossaShop'];
        else if (shopFilter === 'Tarso') shopsToQuery = ['TarsoShop'];
        else if (shopFilter === 'Market') shopsToQuery = ['MarketShop'];
        else {
            return {
                statusCode: 400,
                headers: getCorsHeaders(),
                body: JSON.stringify({
                    error: 'Invalid shop filter',
                    validShops: ['all', 'Raymakossa', 'Tarso', 'Market']
                })
            };
        }
    }
    
    let allProducts = [];
    
    // Query each shop
    for (const shopTable of shopsToQuery) {
        console.log(`📋 Querying ${shopTable}...`);
        
        try {
            const params = {
                TableName: shopTable,
                KeyConditionExpression: 'begins_with(PK, :pk)',
                ExpressionAttributeValues: {
                    ':pk': 'PRODUCT#'
                }
            };
            
            const result = await docClient.send(new QueryCommand(params));
            console.log(`   Found ${result.Items?.length || 0} products in ${shopTable}`);
            
            if (result.Items && result.Items.length > 0) {
                const shopProducts = result.Items.map(item => {
                    // Extract shop name from table name
                    const shopName = shopTable.replace('Shop', '');
                    
                    // Map DynamoDB fields to frontend expected format
                    return {
                        productId: item.PK.replace('PRODUCT#', ''),
                        id: item.PK.replace('PRODUCT#', ''),
                        name: item.name || 'Unnamed Product',
                        category: item.category || 'Furniture',
                        price: item.sellingPrice || item.costPrice || 0,
                        costPrice: item.costPrice || 0,
                        sellingPrice: item.sellingPrice || 0,
                        stock: item.currentStock || 0,
                        quantity: item.currentStock || 0,
                        minStock: item.minStock || 2,
                        lastUpdated: item.lastUpdated || item.createdAt,
                        createdAt: item.createdAt,
                        description: item.description || '',
                        shop: shopName,
                        shops: [shopName], // Array for compatibility
                        status: (item.currentStock || 0) > 0 ? 'In Stock' : 'Out of Stock'
                    };
                });
                
                allProducts = [...allProducts, ...shopProducts];
            }
        } catch (error) {
            console.error(`❌ Error getting products from ${shopTable}:`, error.message);
            // Continue with other shops even if one fails
        }
    }
    
    console.log(`✅ Total products found: ${allProducts.length}`);
    
    // If no products found, return empty array
    if (allProducts.length === 0) {
        console.log('⚠️ No products found in any shop');
        return {
            statusCode: 200,
            headers: getCorsHeaders(),
            body: JSON.stringify([]) // Return empty array
        };
    }
    
    // Log first product to verify format
    if (allProducts.length > 0) {
        console.log('📦 Sample product:', {
            id: allProducts[0].id,
            name: allProducts[0].name,
            price: allProducts[0].price,
            stock: allProducts[0].stock,
            shop: allProducts[0].shop
        });
    }
    
    // ⚠️ CRITICAL: Return the array directly that your frontend expects
    return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify(allProducts) // Direct array, not wrapped in object
    };
}

async function addProduct(data) {
    console.log('➕ Adding product:', data);
    
    // Validate required fields
    if (!data.name || !data.price) {
        return {
            statusCode: 400,
            headers: getCorsHeaders(),
            body: JSON.stringify({
                error: 'Missing required fields',
                required: ['name', 'price']
            })
        };
    }
    
    const productName = data.name;
    const category = data.category || 'other';
    const sellingPrice = parseFloat(data.price) || 0;
    const initialStock = parseInt(data.stock) || 0;
    const shops = data.shops || ['Raymakossa'];
    const description = data.description || '';
    
    const productId = `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`Generated product ID: ${productId}`);
    
    const responses = [];
    
    for (const shop of shops) {
        let shopTable;
        if (shop === 'Raymakossa') shopTable = 'RaymakossaShop';
        else if (shop === 'Tarso') shopTable = 'TarsoShop';
        else if (shop === 'Market') shopTable = 'MarketShop';
        else {
            console.log(`⚠️ Skipping invalid shop: ${shop}`);
            continue;
        }
        
        const timestamp = new Date().toISOString();
        
        const productParams = {
            TableName: shopTable,
            Item: {
                PK: `PRODUCT#${productId}`,
                SK: 'DETAILS',
                name: productName,
                category: category,
                costPrice: sellingPrice * 0.7, // Estimated cost
                sellingPrice: sellingPrice,
                currentStock: initialStock,
                minStock: 2,
                description: description,
                createdAt: timestamp,
                lastUpdated: timestamp,
                shopName: shop
            }
        };
        
        console.log(`📝 Creating product in ${shopTable}:`, productParams.Item);
        
        try {
            await docClient.send(new PutCommand(productParams));
            console.log(`✅ Product created in ${shopTable}`);
            
            if (initialStock > 0) {
                const stockParams = {
                    TableName: shopTable,
                    Item: {
                        PK: `STOCK#${productId}`,
                        SK: `${timestamp}#INITIAL`,
                        type: 'RESTOCK',
                        quantity: initialStock,
                        previousStock: 0,
                        newStock: initialStock,
                        reason: 'Initial stock',
                        timestamp: timestamp
                    }
                };
                await docClient.send(new PutCommand(stockParams));
                console.log(`📦 Stock record created for ${productId}`);
            }
            
            responses.push({
                shop: shop,
                success: true,
                productId: productId
            });
            
        } catch (dbError) {
            console.error(`❌ Database error for ${shop}:`, dbError.message);
            responses.push({
                shop: shop,
                success: false,
                error: dbError.message
            });
        }
    }
    
    const allSuccessful = responses.every(r => r.success);
    const message = allSuccessful ? 'Product added successfully' : 'Product added with some errors';
    
    console.log(`📊 Product creation result: ${message}`);
    
    return {
        statusCode: allSuccessful ? 201 : 207,
        headers: getCorsHeaders(),
        body: JSON.stringify({ 
            success: allSuccessful,
            message: message,
            productId: productId,
            responses: responses
        })
    };
}

async function updateProduct(productId, data) {
    console.log(`✏️ Updating product ${productId}:`, data);
    
    const shop = data.shops && data.shops[0] ? data.shops[0] : 'Raymakossa';
    const shopTable = `${shop}Shop`;
    
    console.log(`Updating in shop: ${shopTable}`);
    
    // Build update expression
    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.category !== undefined) updates.category = data.category;
    if (data.price !== undefined) updates.sellingPrice = parseFloat(data.price);
    if (data.stock !== undefined) updates.currentStock = parseInt(data.stock);
    if (data.description !== undefined) updates.description = data.description;
    
    let updateExpression = 'SET lastUpdated = :now';
    const expressionValues = {
        ':now': new Date().toISOString()
    };
    
    Object.entries(updates).forEach(([key, value], index) => {
        updateExpression += `, ${key} = :val${index}`;
        expressionValues[`:val${index}`] = value;
    });
    
    const updateParams = {
        TableName: shopTable,
        Key: {
            PK: `PRODUCT#${productId}`,
            SK: 'DETAILS'
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionValues,
        ReturnValues: 'ALL_NEW'
    };
    
    console.log('Update params:', updateParams);
    
    try {
        const result = await docClient.send(new UpdateCommand(updateParams));
        console.log(`✅ Product ${productId} updated successfully`);
        
        return {
            statusCode: 200,
            headers: getCorsHeaders(),
            body: JSON.stringify({
                success: true,
                message: 'Product updated successfully',
                product: result.Attributes
            })
        };
        
    } catch (dbError) {
        console.error('❌ Update error:', dbError.message);
        return {
            statusCode: 500,
            headers: getCorsHeaders(),
            body: JSON.stringify({ 
                error: 'Failed to update product',
                message: dbError.message
            })
        };
    }
}

async function deleteProduct(productId, data) {
    console.log(`🗑️ Deleting product ${productId}:`, data);
    
    const shop = data.shops && data.shops[0] ? data.shops[0] : 'Raymakossa';
    const shopTable = `${shop}Shop`;
    
    console.log(`Deleting from shop: ${shopTable}`);
    
    // First check if product exists
    const getParams = {
        TableName: shopTable,
        Key: {
            PK: `PRODUCT#${productId}`,
            SK: 'DETAILS'
        }
    };
    
    try {
        const productResult = await docClient.send(new QueryCommand(getParams));
        
        if (!productResult.Items || productResult.Items.length === 0) {
            console.log(`❌ Product ${productId} not found in ${shopTable}`);
            return {
                statusCode: 404,
                headers: getCorsHeaders(),
                body: JSON.stringify({ 
                    error: 'Product not found'
                })
            };
        }
        
        console.log(`✅ Product found, proceeding with deletion`);
        
        const deleteParams = {
            TableName: shopTable,
            Key: {
                PK: `PRODUCT#${productId}`,
                SK: 'DETAILS'
            }
        };
        
        await docClient.send(new DeleteCommand(deleteParams));
        console.log(`✅ Product ${productId} deleted successfully`);
        
        return {
            statusCode: 200,
            headers: getCorsHeaders(),
            body: JSON.stringify({
                success: true,
                message: 'Product deleted successfully',
                productId: productId
            })
        };
        
    } catch (dbError) {
        console.error('❌ Delete error:', dbError.message);
        return {
            statusCode: 500,
            headers: getCorsHeaders(),
            body: JSON.stringify({ 
                error: 'Failed to delete product',
                message: dbError.message
            })
        };
    }
}

function getCorsHeaders() {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,X-Device-Type,X-Screen-Width',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400'
    };
}