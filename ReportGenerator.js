const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    try {
        console.log('ReportGenerator event:', JSON.stringify(event, null, 2));
        
        const httpMethod = event.httpMethod;
        const path = event.path;
        const queryParams = event.queryStringParameters || {};
        
        if (httpMethod === 'GET' && path === '/reports/sales-summary') {
            return await generateSalesSummaryReport(queryParams);
        }
        else if (httpMethod === 'GET' && path === '/reports/stock-summary') {
            return await generateStockSummaryReport();
        }
        else if (httpMethod === 'GET' && path === '/reports/attendance-summary') {
            return await generateAttendanceSummaryReport(queryParams);
        }
        else if (httpMethod === 'GET' && path === '/reports/low-stock') {
            return await generateLowStockReport();
        }
        else if (httpMethod === 'GET' && path === '/reports/shop-comparison') {
            return await generateShopComparisonReport(queryParams);
        }
        else if (httpMethod === 'GET' && path === '/reports/daily-sales') {
            return await generateDailySalesReport(queryParams);
        }
        else {
            return {
                statusCode: 400,
                headers: getCorsHeaders(),
                body: JSON.stringify({ error: 'Invalid request' })
            };
        }
        
    } catch (error) {
        console.error('ReportGenerator error:', error);
        return {
            statusCode: 500,
            headers: getCorsHeaders(),
            body: JSON.stringify({ error: error.message })
        };
    }
};

async function generateSalesSummaryReport(queryParams) {
    const { period = 'today', shop } = queryParams;
    const today = new Date().toISOString().split('T')[0];
    
    const shops = shop ? [shop] : ['Raymakossa', 'Tarso', 'Market'];
    const report = {
        reportType: 'SALES_SUMMARY',
        period: period,
        generatedAt: new Date().toISOString(),
        shops: {},
        summary: {
            totalSales: 0,
            totalTransactions: 0,
            averageTransactionValue: 0
        }
    };
    
    for (const shopName of shops) {
        const shopTable = `${shopName}Shop`;
        const shopData = await getShopSalesData(shopTable, today);
        report.shops[shopName] = shopData;
        
        report.summary.totalSales += shopData.totalSales;
        report.summary.totalTransactions += shopData.transactionCount;
    }
    
    if (report.summary.totalTransactions > 0) {
        report.summary.averageTransactionValue = 
            (report.summary.totalSales / report.summary.totalTransactions).toFixed(2);
    }
    
    await storeGeneratedReport(report);
    
    return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            report: report
        })
    };
}

async function getShopSalesData(shopTable, date) {
    const params = {
        TableName: shopTable,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
            ':pk': `TRANSACTION#${date}`
        }
    };
    
    const result = await docClient.send(new QueryCommand(params));
    const transactions = result.Items || [];
    
    const sales = transactions.filter(t => t.type === 'SALE');
    const returns = transactions.filter(t => t.type === 'RETURN');
    
    const paymentMethods = {};
    sales.forEach(sale => {
        const method = sale.paymentMethod || 'CASH';
        if (!paymentMethods[method]) {
            paymentMethods[method] = { count: 0, amount: 0 };
        }
        paymentMethods[method].count++;
        paymentMethods[method].amount += sale.totalAmount;
    });
    
    const attendants = {};
    sales.forEach(sale => {
        const name = sale.attendantName || sale.attendantId;
        if (!attendants[name]) {
            attendants[name] = { sales: 0, amount: 0 };
        }
        attendants[name].sales++;
        attendants[name].amount += sale.totalAmount;
    });
    
    const productSales = {};
    sales.forEach(sale => {
        sale.items?.forEach(item => {
            if (!productSales[item.productId]) {
                productSales[item.productId] = {
                    productId: item.productId,
                    name: item.name,
                    quantity: 0,
                    revenue: 0
                };
            }
            productSales[item.productId].quantity += item.quantity;
            productSales[item.productId].revenue += item.total;
        });
    });
    
    const topProducts = Object.values(productSales)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
    
    return {
        date: date,
        totalSales: sales.reduce((sum, t) => sum + t.totalAmount, 0),
        totalReturns: returns.reduce((sum, t) => sum + t.totalAmount, 0),
        netSales: sales.reduce((sum, t) => sum + t.totalAmount, 0) - 
                 returns.reduce((sum, t) => sum + t.totalAmount, 0),
        transactionCount: transactions.length,
        salesCount: sales.length,
        returnsCount: returns.length,
        paymentMethods: paymentMethods,
        attendants: attendants,
        topProducts: topProducts
    };
}

async function generateStockSummaryReport() {
    const shops = ['Raymakossa', 'Tarso', 'Market'];
    const report = {
        reportType: 'STOCK_SUMMARY',
        generatedAt: new Date().toISOString(),
        shops: {},
        summary: {
            totalProducts: 0,
            totalStockValue: 0,
            lowStockItems: 0,
            outOfStockItems: 0
        }
    };
    
    for (const shopName of shops) {
        const shopTable = `${shopName}Shop`;
        const stockData = await getShopStockData(shopTable);
        report.shops[shopName] = stockData;
        
        report.summary.totalProducts += stockData.totalProducts;
        report.summary.totalStockValue += stockData.totalStockValue;
        report.summary.lowStockItems += stockData.lowStockCount;
        report.summary.outOfStockItems += stockData.outOfStockCount;
    }
    
    report.summary.lowStockPercentage = report.summary.totalProducts > 0 ? 
        ((report.summary.lowStockItems / report.summary.totalProducts) * 100).toFixed(1) + '%' : '0%';
    
    await storeGeneratedReport(report);
    
    return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            report: report
        })
    };
}

async function getShopStockData(shopTable) {
    const params = {
        TableName: shopTable,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
            ':pk': 'PRODUCT#'
        }
    };
    
    const result = await docClient.send(new QueryCommand(params));
    const products = result.Items?.filter(item => item.SK === 'DETAILS') || [];
    
    let totalStockValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const lowStockItems = [];
    const outOfStockItems = [];
    
    products.forEach(product => {
        const stockValue = product.currentStock * product.costPrice;
        totalStockValue += stockValue;
        
        if (product.currentStock === 0) {
            outOfStockCount++;
            outOfStockItems.push({
                productId: product.PK.replace('PRODUCT#', ''),
                name: product.name,
                category: product.category,
                lastUpdated: product.lastUpdated
            });
        } else if (product.currentStock <= product.minStock) {
            lowStockCount++;
            lowStockItems.push({
                productId: product.PK.replace('PRODUCT#', ''),
                name: product.name,
                currentStock: product.currentStock,
                minStock: product.minStock,
                value: stockValue
            });
        }
    });
    
    lowStockItems.sort((a, b) => a.currentStock - b.currentStock);
    
    return {
        totalProducts: products.length,
        totalStockValue: totalStockValue.toFixed(2),
        lowStockCount: lowStockCount,
        outOfStockCount: outOfStockCount,
        lowStockItems: lowStockItems.slice(0, 10),
        outOfStockItems: outOfStockItems,
        lastUpdated: new Date().toISOString()
    };
}

async function generateAttendanceSummaryReport(queryParams) {
    const { date } = queryParams;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const shops = ['Raymakossa', 'Tarso', 'Market'];
    
    const report = {
        reportType: 'ATTENDANCE_SUMMARY',
        date: targetDate,
        generatedAt: new Date().toISOString(),
        shops: {},
        summary: {
            totalAttendants: 0,
            presentAttendants: 0,
            totalHoursWorked: 0
        }
    };
    
    for (const shopName of shops) {
        const shopTable = `${shopName}Shop`;
        const attendanceData = await getShopAttendanceData(shopTable, targetDate);
        report.shops[shopName] = attendanceData;
        
        report.summary.totalAttendants += attendanceData.totalAttendants;
        report.summary.presentAttendants += attendanceData.presentNow;
        report.summary.totalHoursWorked += parseFloat(attendanceData.totalHours);
    }
    
    report.summary.attendanceRate = report.summary.totalAttendants > 0 ? 
        ((report.summary.presentAttendants / report.summary.totalAttendants) * 100).toFixed(1) + '%' : '0%';
    
    report.summary.averageHours = report.summary.totalAttendants > 0 ? 
        (report.summary.totalHoursWorked / report.summary.totalAttendants).toFixed(2) : 0;
    
    await storeGeneratedReport(report);
    
    return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            report: report
        })
    };
}

async function getShopAttendanceData(shopTable, date) {
    const params = {
        TableName: shopTable,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
            ':pk': `ATTENDANCE#${date}`
        }
    };
    
    const result = await docClient.send(new QueryCommand(params));
    const attendanceRecords = result.Items || [];
    
    const presentCount = attendanceRecords.filter(item => item.clockOut === null).length;
    const totalHours = attendanceRecords.reduce((sum, item) => sum + (item.hoursWorked || 0), 0);
    
    const notes = attendanceRecords
        .filter(item => item.dailyNote && item.dailyNote.trim() !== '')
        .map(item => ({
            attendant: item.attendantName,
            note: item.dailyNote,
            time: item.lastUpdated || item.timestamp
        }));
    
    return {
        date: date,
        totalAttendants: attendanceRecords.length,
        presentNow: presentCount,
        clockedOut: attendanceRecords.length - presentCount,
        totalHours: totalHours.toFixed(2),
        averageHours: attendanceRecords.length > 0 ? 
            (totalHours / attendanceRecords.length).toFixed(2) : 0,
        attendanceList: attendanceRecords.map(item => ({
            attendant: item.attendantName,
            clockIn: item.clockIn,
            clockOut: item.clockOut,
            hours: item.hoursWorked,
            status: item.clockOut === null ? 'PRESENT' : 'LEFT'
        })),
        notes: notes
    };
}

async function generateLowStockReport() {
    const shops = ['Raymakossa', 'Tarso', 'Market'];
    const report = {
        reportType: 'LOW_STOCK_ALERT',
        generatedAt: new Date().toISOString(),
        alerts: [],
        summary: {
            totalAlerts: 0,
            criticalAlerts: 0,
            warningAlerts: 0
        }
    };
    
    for (const shopName of shops) {
        const shopTable = `${shopName}Shop`;
        const lowStockData = await getShopLowStockAlerts(shopTable);
        
        lowStockData.forEach(item => {
            item.shop = shopName;
            report.alerts.push(item);
            
            if (item.currentStock === 0) {
                report.summary.criticalAlerts++;
            } else {
                report.summary.warningAlerts++;
            }
            
            report.summary.totalAlerts++;
        });
    }
    
    report.alerts.sort((a, b) => {
        if (a.currentStock === 0 && b.currentStock > 0) return -1;
        if (a.currentStock > 0 && b.currentStock === 0) return 1;
        return a.currentStock - b.currentStock;
    });
    
    await storeGeneratedReport(report);
    
    if (report.summary.criticalAlerts > 0) {
        await sendCriticalAlertNotification(report);
    }
    
    return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            report: report,
            hasCriticalAlerts: report.summary.criticalAlerts > 0
        })
    };
}

async function getShopLowStockAlerts(shopTable) {
    const params = {
        TableName: shopTable,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
            ':pk': 'PRODUCT#'
        }
    };
    
    const result = await docClient.send(new QueryCommand(params));
    const products = result.Items?.filter(item => item.SK === 'DETAILS') || [];
    
    return products
        .filter(product => product.currentStock <= product.minStock)
        .map(product => ({
            productId: product.PK.replace('PRODUCT#', ''),
            name: product.name,
            category: product.category,
            currentStock: product.currentStock,
            minStock: product.minStock,
            severity: product.currentStock === 0 ? 'CRITICAL' : 'WARNING',
            lastUpdated: product.lastUpdated,
            valueAtRisk: (product.minStock - product.currentStock) * product.costPrice
        }));
}

async function generateShopComparisonReport(queryParams) {
    const { metric = 'sales' } = queryParams;
    const today = new Date().toISOString().split('T')[0];
    const shops = ['Raymakossa', 'Tarso', 'Market'];
    
    const report = {
        reportType: 'SHOP_COMPARISON',
        metric: metric,
        date: today,
        generatedAt: new Date().toISOString(),
        comparison: [],
        rankings: {}
    };
    
    for (const shopName of shops) {
        const shopTable = `${shopName}Shop`;
        const metrics = await getShopMetrics(shopTable, today);
        report.comparison.push({
            shop: shopName,
            ...metrics
        });
    }
    
    if (metric === 'sales') {
        report.comparison.sort((a, b) => b.totalSales - a.totalSales);
    } else if (metric === 'stockValue') {
        report.comparison.sort((a, b) => b.stockValue - a.stockValue);
    } else if (metric === 'attendance') {
        report.comparison.sort((a, b) => b.attendanceRate - a.attendanceRate);
    } else if (metric === 'transactions') {
        report.comparison.sort((a, b) => b.transactionCount - a.transactionCount);
    }
    
    report.rankings = {
        bySales: report.comparison.map(s => s.shop),
        byStockValue: [...report.comparison].sort((a, b) => b.stockValue - a.stockValue).map(s => s.shop),
        byAttendance: [...report.comparison].sort((a, b) => b.attendanceRate - a.attendanceRate).map(s => s.shop),
        byEfficiency: [...report.comparison].sort((a, b) => 
            (b.totalSales / (b.attendanceCount || 1)) - (a.totalSales / (a.attendanceCount || 1))
        ).map(s => s.shop)
    };
    
    await storeGeneratedReport(report);
    
    return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            report: report
        })
    };
}

async function getShopMetrics(shopTable, date) {
    const salesParams = {
        TableName: shopTable,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
            ':pk': `TRANSACTION#${date}`
        }
    };
    
    const salesResult = await docClient.send(new QueryCommand(salesParams));
    const transactions = salesResult.Items || [];
    const sales = transactions.filter(t => t.type === 'SALE');
    
    const attendanceParams = {
        TableName: shopTable,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
            ':pk': `ATTENDANCE#${date}`
        }
    };
    
    const attendanceResult = await docClient.send(new QueryCommand(attendanceParams));
    const attendanceRecords = attendanceResult.Items || [];
    
    const stockParams = {
        TableName: shopTable,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
            ':pk': 'PRODUCT#'
        }
    };
    
    const stockResult = await docClient.send(new QueryCommand(stockParams));
    const products = stockResult.Items?.filter(item => item.SK === 'DETAILS') || [];
    
    const totalSales = sales.reduce((sum, t) => sum + t.totalAmount, 0);
    const stockValue = products.reduce((sum, p) => sum + (p.currentStock * p.costPrice), 0);
    const attendanceRate = attendanceRecords.length > 0 ? 
        (attendanceRecords.filter(a => a.clockOut === null).length / attendanceRecords.length) * 100 : 0;
    
    return {
        totalSales: totalSales,
        transactionCount: transactions.length,
        salesCount: sales.length,
        attendanceCount: attendanceRecords.length,
        attendanceRate: attendanceRate.toFixed(2),
        stockValue: stockValue.toFixed(2),
        productCount: products.length,
        lowStockCount: products.filter(p => p.currentStock <= p.minStock).length,
        salesPerAttendant: attendanceRecords.length > 0 ? 
            (totalSales / attendanceRecords.length).toFixed(2) : totalSales
    };
}

async function generateDailySalesReport(queryParams) {
    const { days = 7, shop } = queryParams;
    const shops = shop ? [shop] : ['Raymakossa', 'Tarso', 'Market'];
    const endDate = new Date();
    
    const report = {
        reportType: 'DAILY_SALES_TREND',
        period: `${days} days`,
        generatedAt: new Date().toISOString(),
        dailyData: [],
        summary: {
            totalPeriodSales: 0,
            averageDailySales: 0,
            bestDay: { date: '', amount: 0 },
            worstDay: { date: '', amount: 0 }
        }
    };
    
    for (let i = 0; i < parseInt(days); i++) {
        const date = new Date(endDate);
        date.setDate(date.getDate() - i);
        const dateString = date.toISOString().split('T')[0];
        
        let dayTotal = 0;
        const shopData = {};
        
        for (const shopName of shops) {
            const shopTable = `${shopName}Shop`;
            const daySales = await getDaySales(shopTable, dateString);
            shopData[shopName] = daySales;
            dayTotal += daySales;
        }
        
        report.dailyData.push({
            date: dateString,
            dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'short' }),
            totalSales: dayTotal,
            shopBreakdown: shopData
        });
        
        report.summary.totalPeriodSales += dayTotal;
        
        if (dayTotal > report.summary.bestDay.amount) {
            report.summary.bestDay = { date: dateString, amount: dayTotal };
        }
        if (i === 0 || dayTotal < report.summary.worstDay.amount) {
            report.summary.worstDay = { date: dateString, amount: dayTotal };
        }
    }
    
    report.summary.averageDailySales = (report.summary.totalPeriodSales / parseInt(days)).toFixed(2);
    
    report.dailyData.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    await storeGeneratedReport(report);
    
    return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            report: report
        })
    };
}

async function getDaySales(shopTable, date) {
    const params = {
        TableName: shopTable,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
            ':pk': `TRANSACTION#${date}`
        }
    };
    
    try {
        const result = await docClient.send(new QueryCommand(params));
        const sales = result.Items?.filter(t => t.type === 'SALE') || [];
        const returns = result.Items?.filter(t => t.type === 'RETURN') || [];
        
        return sales.reduce((sum, t) => sum + t.totalAmount, 0) - 
               returns.reduce((sum, t) => sum + t.totalAmount, 0);
    } catch (error) {
        console.error(`Error getting sales for ${date} from ${shopTable}:`, error);
        return 0;
    }
}

async function storeGeneratedReport(reportData) {
    try {
        const params = {
            TableName: 'InventoryReports',
            Item: {
                PK: `GENERATED_REPORT#${reportData.reportType}`,
                SK: new Date().toISOString(),
                reportType: reportData.reportType,
                data: reportData,
                generatedAt: new Date().toISOString(),
                expiresAt: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
            }
        };
        
        await docClient.send(new PutCommand(params));
    } catch (error) {
        console.error('Error storing generated report:', error);
    }
}

async function sendCriticalAlertNotification(report) {
    console.log('CRITICAL STOCK ALERT NOTIFICATION:', {
        totalAlerts: report.summary.totalAlerts,
        criticalAlerts: report.summary.criticalAlerts,
        shopsAffected: [...new Set(report.alerts.map(a => a.shop))],
        criticalItems: report.alerts.filter(a => a.severity === 'CRITICAL').map(a => ({
            shop: a.shop,
            product: a.name,
            stock: a.currentStock
        }))
    });
}

function getCorsHeaders() {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key'
    };
}