const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    try {
        console.log('ShopTransactions event:', JSON.stringify(event, null, 2));
        
        const httpMethod = event.httpMethod;
        const path = event.path;
        const body = event.body ? JSON.parse(event.body) : {};
        const queryParams = event.queryStringParameters || {};
        
        const shop = event.requestContext?.authorizer?.shop || body.shop;
        const attendantId = event.requestContext?.authorizer?.email || body.attendantId;
        const attendantName = event.requestContext?.authorizer?.name || body.attendantName;
        
        if (!shop || !attendantId) {
            return {
                statusCode: 400,
                headers: getCorsHeaders(),
                body: JSON.stringify({ error: 'Missing shop or attendant information' })
            };
        }
        
        const shopTable = `${shop}Shop`;
        
        if (httpMethod === 'POST' && path === '/transactions/sale') {
            return await recordSale(shopTable, attendantId, attendantName, body);
        }
        else if (httpMethod === 'POST' && path === '/transactions/return') {
            return await recordReturn(shopTable, attendantId, attendantName, body);
        }
        else if (httpMethod === 'GET' && path === '/transactions/today') {
            return await getTodayTransactions(shopTable, attendantId, queryParams);
        }
        else if (httpMethod === 'GET' && path === '/transactions/summary') {
            return await getTransactionSummary(shopTable, queryParams);
        }
        else {
            return {
                statusCode: 400,
                headers: getCorsHeaders(),
                body: JSON.stringify({ error: 'Invalid request' })
            };
        }
        
    } catch (error) {
        console.error('ShopTransactions error:', error);
        return {
            statusCode: 500,
            headers: getCorsHeaders(),
            body: JSON.stringify({ error: error.message })
        };
    }
};

async function recordSale(shopTable, attendantId, attendantName, data) {
    const { items, paymentMethod, customerName, notes } = data;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
        return {
            statusCode: 400,
            headers: getCorsHeaders(),
            body: JSON.stringify({ error: 'No items in sale' })
        };
    }
    
    const transactionId = `SALE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const today = new Date().toISOString().split('T')[0];
    const timestamp = new Date().toISOString();
    
    let totalAmount = 0;
    const validatedItems = [];
    const stockUpdates = [];
    
    for (const item of items) {
        const { productId, quantity, price } = item;
        
        const productParams = {
            TableName: shopTable,
            Key: {
                PK: `PRODUCT#${productId}`,
                SK: 'DETAILS'
            }
        };
        
        const productResult = await docClient.send(new QueryCommand(productParams));
        
        if (!productResult.Items || productResult.Items.length === 0) {
            return {
                statusCode: 404,
                headers: getCorsHeaders(),
                body: JSON.stringify({ error: `Product ${productId} not found` })
            };
        }
        
        const product = productResult.Items[0];
        const currentStock = product.currentStock || 0;
        
        if (currentStock < quantity) {
            return {
                statusCode: 400,
                headers: getCorsHeaders(),
                body: JSON.stringify({ 
                    error: `Insufficient stock for ${product.name}. Available: ${currentStock}, Requested: ${quantity}` 
                })
            };
        }
        
        const itemTotal = quantity * (price || product.sellingPrice);
        totalAmount += itemTotal;
        
        validatedItems.push({
            productId,
            name: product.name,
            quantity,
            unitPrice: price || product.sellingPrice,
            total: itemTotal
        });
        
        const newStock = currentStock - quantity;
        const updateParams = {
            TableName: shopTable,
            Key: {
                PK: `PRODUCT#${productId}`,
                SK: 'DETAILS'
            },
            UpdateExpression: 'SET currentStock = :newStock, lastUpdated = :now',
            ExpressionAttributeValues: {
                ':newStock': newStock,
                ':now': timestamp
            }
        };
        
        await docClient.send(new UpdateCommand(updateParams));
        
        const stockParams = {
            TableName: shopTable,
            Item: {
                PK: `STOCK#${productId}`,
                SK: `${timestamp}#SALE`,
                type: 'SALE',
                quantity: -quantity,
                previousStock: currentStock,
                newStock: newStock,
                transactionId: transactionId,
                attendantId: attendantId,
                attendantName: attendantName,
                timestamp: timestamp
            }
        };
        
        await docClient.send(new PutCommand(stockParams));
        
        stockUpdates.push({
            productId,
            productName: product.name,
            quantity,
            previousStock: currentStock,
            newStock: newStock
        });
    }
    
    const transactionParams = {
        TableName: shopTable,
        Item: {
            PK: `TRANSACTION#${today}`,
            SK: transactionId,
            type: 'SALE',
            transactionId: transactionId,
            attendantId: attendantId,
            attendantName: attendantName,
            items: validatedItems,
            totalAmount: totalAmount,
            paymentMethod: paymentMethod || 'CASH',
            customerName: customerName || '',
            notes: notes || '',
            timestamp: timestamp,
            stockUpdates: stockUpdates
        }
    };
    
    await docClient.send(new PutCommand(transactionParams));
    
    await updateDailySales(shopTable.replace('Shop', ''), today, totalAmount, 1);
    
    return {
        statusCode: 201,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            message: 'Sale recorded successfully',
            transactionId: transactionId,
            totalAmount: totalAmount,
            timestamp: timestamp
        })
    };
}

async function recordReturn(shopTable, attendantId, attendantName, data) {
    const { originalTransactionId, items, reason } = data;
    
    const returnId = `RETURN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const today = new Date().toISOString().split('T')[0];
    const timestamp = new Date().toISOString();
    
    let originalTransaction = null;
    
    const todayParams = {
        TableName: shopTable,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: {
            ':pk': `TRANSACTION#${today}`,
            ':sk': originalTransactionId
        }
    };
    
    const todayResult = await docClient.send(new QueryCommand(todayParams));
    
    if (todayResult.Items && todayResult.Items.length > 0) {
        originalTransaction = todayResult.Items[0];
    } else {
        return {
            statusCode: 404,
            headers: getCorsHeaders(),
            body: JSON.stringify({ error: 'Original transaction not found' })
        };
    }
    
    if (originalTransaction.type !== 'SALE') {
        return {
            statusCode: 400,
            headers: getCorsHeaders(),
            body: JSON.stringify({ error: 'Can only return sales transactions' })
        };
    }
    
    let returnTotal = 0;
    const returnItems = [];
    
    for (const returnItem of items) {
        const { productId, quantity } = returnItem;
        
        const productParams = {
            TableName: shopTable,
            Key: {
                PK: `PRODUCT#${productId}`,
                SK: 'DETAILS'
            }
        };
        
        const productResult = await docClient.send(new QueryCommand(productParams));
        
        if (!productResult.Items || productResult.Items.length === 0) {
            return {
                statusCode: 404,
                headers: getCorsHeaders(),
                body: JSON.stringify({ error: `Product ${productId} not found` })
            };
        }
        
        const product = productResult.Items[0];
        const currentStock = product.currentStock || 0;
        const newStock = currentStock + quantity;
        
        const updateParams = {
            TableName: shopTable,
            Key: {
                PK: `PRODUCT#${productId}`,
                SK: 'DETAILS'
            },
            UpdateExpression: 'SET currentStock = :newStock, lastUpdated = :now',
            ExpressionAttributeValues: {
                ':newStock': newStock,
                ':now': timestamp
            }
        };
        
        await docClient.send(new UpdateCommand(updateParams));
        
        const originalItem = originalTransaction.items.find(item => item.productId === productId);
        const itemPrice = originalItem ? originalItem.unitPrice : product.sellingPrice;
        const itemTotal = quantity * itemPrice;
        returnTotal += itemTotal;
        
        returnItems.push({
            productId,
            name: product.name,
            quantity,
            unitPrice: itemPrice,
            total: itemTotal
        });
        
        const stockParams = {
            TableName: shopTable,
            Item: {
                PK: `STOCK#${productId}`,
                SK: `${timestamp}#RETURN`,
                type: 'RETURN',
                quantity: quantity,
                previousStock: currentStock,
                newStock: newStock,
                returnId: returnId,
                originalTransactionId: originalTransactionId,
                attendantId: attendantId,
                attendantName: attendantName,
                reason: reason || 'Customer return',
                timestamp: timestamp
            }
        };
        
        await docClient.send(new PutCommand(stockParams));
    }
    
    const returnParams = {
        TableName: shopTable,
        Item: {
            PK: `TRANSACTION#${today}`,
            SK: returnId,
            type: 'RETURN',
            returnId: returnId,
            originalTransactionId: originalTransactionId,
            attendantId: attendantId,
            attendantName: attendantName,
            items: returnItems,
            totalAmount: returnTotal,
            reason: reason || 'Customer return',
            timestamp: timestamp
        }
    };
    
    await docClient.send(new PutCommand(returnParams));
    
    await updateDailySales(shopTable.replace('Shop', ''), today, -returnTotal, 0);
    
    return {
        statusCode: 201,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            message: 'Return processed successfully',
            returnId: returnId,
            returnAmount: returnTotal
        })
    };
}

async function getTodayTransactions(shopTable, attendantId, queryParams) {
    const today = new Date().toISOString().split('T')[0];
    const { type, limit = 50 } = queryParams;
    
    const params = {
        TableName: shopTable,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
            ':pk': `TRANSACTION#${today}`
        },
        Limit: parseInt(limit),
        ScanIndexForward: false
    };
    
    if (attendantId !== 'all') {
        params.FilterExpression = 'attendantId = :attendantId';
        params.ExpressionAttributeValues[':attendantId'] = attendantId;
    }
    
    if (type) {
        if (params.FilterExpression) {
            params.FilterExpression += ' AND #type = :type';
        } else {
            params.FilterExpression = '#type = :type';
        }
        params.ExpressionAttributeNames = { '#type': 'type' };
        params.ExpressionAttributeValues[':type'] = type;
    }
    
    const result = await docClient.send(new QueryCommand(params));
    
    const sales = result.Items?.filter(t => t.type === 'SALE') || [];
    const returns = result.Items?.filter(t => t.type === 'RETURN') || [];
    
    const summary = {
        totalTransactions: result.Count || 0,
        salesCount: sales.length,
        returnsCount: returns.length,
        salesAmount: sales.reduce((sum, t) => sum + t.totalAmount, 0),
        returnsAmount: returns.reduce((sum, t) => sum + t.totalAmount, 0),
        netAmount: sales.reduce((sum, t) => sum + t.totalAmount, 0) - 
                   returns.reduce((sum, t) => sum + t.totalAmount, 0)
    };
    
    return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            transactions: result.Items || [],
            summary: summary,
            date: today
        })
    };
}

async function getTransactionSummary(shopTable, queryParams) {
    const { period } = queryParams;
    const today = new Date().toISOString().split('T')[0];
    
    const params = {
        TableName: shopTable,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
            ':pk': `TRANSACTION#${today}`
        }
    };
    
    const result = await docClient.send(new QueryCommand(params));
    
    const transactions = result.Items || [];
    const sales = transactions.filter(t => t.type === 'SALE');
    const returns = transactions.filter(t => t.type === 'RETURN');
    
    const paymentMethods = {};
    sales.forEach(sale => {
        const method = sale.paymentMethod || 'CASH';
        paymentMethods[method] = (paymentMethods[method] || 0) + 1;
    });
    
    const attendants = {};
    transactions.forEach(t => {
        const name = t.attendantName || t.attendantId;
        if (!attendants[name]) {
            attendants[name] = { sales: 0, returns: 0, amount: 0 };
        }
        if (t.type === 'SALE') {
            attendants[name].sales++;
            attendants[name].amount += t.totalAmount;
        } else if (t.type === 'RETURN') {
            attendants[name].returns++;
            attendants[name].amount -= t.totalAmount;
        }
    });
    
    const summary = {
        date: today,
        totalTransactions: transactions.length,
        totalSales: sales.length,
        totalReturns: returns.length,
        salesAmount: sales.reduce((sum, t) => sum + t.totalAmount, 0),
        returnsAmount: returns.reduce((sum, t) => sum + t.totalAmount, 0),
        netAmount: sales.reduce((sum, t) => sum + t.totalAmount, 0) - 
                   returns.reduce((sum, t) => sum + t.totalAmount, 0),
        paymentMethods: paymentMethods,
        attendants: attendants,
        averageSaleValue: sales.length > 0 ? 
            (sales.reduce((sum, t) => sum + t.totalAmount, 0) / sales.length).toFixed(2) : 0
    };
    
    return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            summary: summary
        })
    };
}

async function updateDailySales(shopName, date, amount, transactionCount) {
    try {
        const params = {
            TableName: 'InventoryReports',
            Key: {
                PK: `DAILY_SALES#${date}`,
                SK: `SHOP#${shopName}`
            },
            UpdateExpression: 'ADD totalAmount :amount, transactionCount :count SET lastUpdated = :now, shopName = :shop',
            ExpressionAttributeValues: {
                ':amount': amount,
                ':count': transactionCount,
                ':now': new Date().toISOString(),
                ':shop': shopName
            }
        };
        
        await docClient.send(new UpdateCommand(params));
    } catch (error) {
        console.error('Error updating daily sales:', error);
    }
}

function getCorsHeaders() {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key'
    };
}