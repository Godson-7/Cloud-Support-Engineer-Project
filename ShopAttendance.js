const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    try {
        console.log('ShopAttendance event:', JSON.stringify(event, null, 2));
        
        const httpMethod = event.httpMethod;
        const path = event.path;
        const body = event.body ? JSON.parse(event.body) : {};
        const queryParams = event.queryStringParameters || {};
        
        const shop = event.requestContext?.authorizer?.shop || body.shop;
        const attendantId = event.requestContext?.authorizer?.email || body.attendantId;
        const attendantName = event.requestContext?.authorizer?.name || body.attendantName;
        
        if (!shop) {
            return {
                statusCode: 400,
                headers: getCorsHeaders(),
                body: JSON.stringify({ error: 'Shop information is required' })
            };
        }
        
        const shopTable = `${shop}Shop`;
        
        if (httpMethod === 'POST' && path === '/attendance/clock-in') {
            return await clockIn(shopTable, attendantId, attendantName);
        }
        else if (httpMethod === 'POST' && path === '/attendance/clock-out') {
            return await clockOut(shopTable, attendantId, attendantName);
        }
        else if (httpMethod === 'PUT' && path === '/attendance/note') {
            return await updateDailyNote(shopTable, attendantId, body.note);
        }
        else if (httpMethod === 'GET' && path === '/attendance/today') {
            return await getTodayAttendance(shopTable, queryParams);
        }
        else if (httpMethod === 'GET' && path === '/attendance/history') {
            return await getAttendanceHistory(shopTable, attendantId, queryParams);
        }
        else {
            return {
                statusCode: 400,
                headers: getCorsHeaders(),
                body: JSON.stringify({ error: 'Invalid request' })
            };
        }
        
    } catch (error) {
        console.error('ShopAttendance error:', error);
        return {
            statusCode: 500,
            headers: getCorsHeaders(),
            body: JSON.stringify({ error: error.message })
        };
    }
};

async function clockIn(shopTable, attendantId, attendantName) {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const timeString = now.toTimeString().split(' ')[0].substring(0, 5);
    
    const checkParams = {
        TableName: shopTable,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: {
            ':pk': `ATTENDANCE#${today}`,
            ':sk': `ATTENDANT#${attendantId}`
        }
    };
    
    const existing = await docClient.send(new QueryCommand(checkParams));
    
    if (existing.Items && existing.Items.length > 0) {
        const record = existing.Items[0];
        if (record.clockOut === null) {
            return {
                statusCode: 400,
                headers: getCorsHeaders(),
                body: JSON.stringify({ 
                    error: 'Already clocked in today',
                    currentStatus: {
                        clockIn: record.clockIn,
                        status: 'Still clocked in'
                    }
                })
            };
        }
    }
    
    const params = {
        TableName: shopTable,
        Item: {
            PK: `ATTENDANCE#${today}`,
            SK: `ATTENDANT#${attendantId}`,
            type: 'ATTENDANCE',
            attendantId: attendantId,
            attendantName: attendantName || attendantId.split('@')[0],
            date: today,
            clockIn: timeString,
            clockOut: null,
            hoursWorked: 0,
            dailyNote: '',
            timestamp: now.toISOString(),
            status: 'CLOCKED_IN'
        }
    };
    
    await docClient.send(new PutCommand(params));
    
    await updateAttendanceReport(shopTable.replace('Shop', ''), today, 'CLOCK_IN', {
        attendantId,
        attendantName,
        time: timeString
    });
    
    return {
        statusCode: 201,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            message: `Clocked in at ${timeString}`,
            time: timeString,
            date: today,
            status: 'CLOCKED_IN'
        })
    };
}

async function clockOut(shopTable, attendantId, attendantName) {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const timeString = now.toTimeString().split(' ')[0].substring(0, 5);
    
    const getParams = {
        TableName: shopTable,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: {
            ':pk': `ATTENDANCE#${today}`,
            ':sk': `ATTENDANT#${attendantId}`
        }
    };
    
    const existing = await docClient.send(new QueryCommand(getParams));
    
    if (!existing.Items || existing.Items.length === 0) {
        return {
            statusCode: 404,
            headers: getCorsHeaders(),
            body: JSON.stringify({ error: 'No clock-in record found for today' })
        };
    }
    
    const record = existing.Items[0];
    
    if (record.clockOut !== null) {
        return {
            statusCode: 400,
            headers: getCorsHeaders(),
            body: JSON.stringify({ error: 'Already clocked out today' })
        };
    }
    
    const clockInTime = record.clockIn;
    const hoursWorked = calculateHours(clockInTime, timeString);
    
    const updateParams = {
        TableName: shopTable,
        Key: {
            PK: `ATTENDANCE#${today}`,
            SK: `ATTENDANT#${attendantId}`
        },
        UpdateExpression: 'SET clockOut = :out, hoursWorked = :hours, lastUpdated = :now, status = :status',
        ExpressionAttributeValues: {
            ':out': timeString,
            ':hours': parseFloat(hoursWorked),
            ':now': now.toISOString(),
            ':status': 'CLOCKED_OUT'
        },
        ReturnValues: 'ALL_NEW'
    };
    
    const result = await docClient.send(new UpdateCommand(updateParams));
    
    await updateAttendanceReport(shopTable.replace('Shop', ''), today, 'CLOCK_OUT', {
        attendantId,
        attendantName,
        clockIn: clockInTime,
        clockOut: timeString,
        hoursWorked: hoursWorked
    });
    
    return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            message: `Clocked out at ${timeString}. Worked ${hoursWorked} hours today.`,
            clockIn: clockInTime,
            clockOut: timeString,
            hoursWorked: hoursWorked,
            attendance: result.Attributes
        })
    };
}

async function updateDailyNote(shopTable, attendantId, note) {
    if (!note || note.trim() === '') {
        return {
            statusCode: 400,
            headers: getCorsHeaders(),
            body: JSON.stringify({ error: 'Note cannot be empty' })
        };
    }
    
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    
    const checkParams = {
        TableName: shopTable,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: {
            ':pk': `ATTENDANCE#${today}`,
            ':sk': `ATTENDANT#${attendantId}`
        }
    };
    
    const existing = await docClient.send(new QueryCommand(checkParams));
    
    if (!existing.Items || existing.Items.length === 0) {
        return {
            statusCode: 404,
            headers: getCorsHeaders(),
            body: JSON.stringify({ error: 'No attendance record found for today' })
        };
    }
    
    const updateParams = {
        TableName: shopTable,
        Key: {
            PK: `ATTENDANCE#${today}`,
            SK: `ATTENDANT#${attendantId}`
        },
        UpdateExpression: 'SET dailyNote = :note, lastUpdated = :now',
        ExpressionAttributeValues: {
            ':note': note.trim(),
            ':now': now.toISOString()
        },
        ReturnValues: 'ALL_NEW'
    };
    
    const result = await docClient.send(new UpdateCommand(updateParams));
    
    return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            message: 'Daily note updated',
            attendance: result.Attributes
        })
    };
}

async function getTodayAttendance(shopTable, queryParams) {
    const { includeNotes, status } = queryParams;
    const today = new Date().toISOString().split('T')[0];
    
    const params = {
        TableName: shopTable,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
            ':pk': `ATTENDANCE#${today}`
        }
    };
    
    if (status === 'present') {
        params.FilterExpression = 'clockOut = :null';
        params.ExpressionAttributeValues[':null'] = null;
    } else if (status === 'left') {
        params.FilterExpression = 'attribute_exists(clockOut)';
    }
    
    const result = await docClient.send(new QueryCommand(params));
    
    const attendanceRecords = result.Items || [];
    
    const presentCount = attendanceRecords.filter(item => item.clockOut === null).length;
    const leftCount = attendanceRecords.filter(item => item.clockOut !== null).length;
    const totalHours = attendanceRecords.reduce((sum, item) => sum + (item.hoursWorked || 0), 0);
    
    let responseRecords = attendanceRecords;
    if (includeNotes !== 'true') {
        responseRecords = attendanceRecords.map(({ dailyNote, ...rest }) => rest);
    }
    
    return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            date: today,
            attendance: responseRecords,
            summary: {
                totalAttendants: attendanceRecords.length,
                presentNow: presentCount,
                clockedOut: leftCount,
                totalHoursWorked: totalHours.toFixed(2),
                averageHours: attendanceRecords.length > 0 ? 
                    (totalHours / attendanceRecords.length).toFixed(2) : 0
            }
        })
    };
}

async function getAttendanceHistory(shopTable, attendantId, queryParams) {
    const { days = 30 } = queryParams;
    
    const today = new Date();
    const history = [];
    
    for (let i = 0; i < parseInt(days); i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateString = date.toISOString().split('T')[0];
        
        const params = {
            TableName: shopTable,
            KeyConditionExpression: 'PK = :pk AND SK = :sk',
            ExpressionAttributeValues: {
                ':pk': `ATTENDANCE#${dateString}`,
                ':sk': `ATTENDANT#${attendantId}`
            }
        };
        
        try {
            const result = await docClient.send(new QueryCommand(params));
            if (result.Items && result.Items.length > 0) {
                history.push(result.Items[0]);
            }
        } catch (error) {
            console.error(`Error getting attendance for ${dateString}:`, error);
        }
    }
    
    const totalDays = history.length;
    const totalHours = history.reduce((sum, item) => sum + (item.hoursWorked || 0), 0);
    const averageHours = totalDays > 0 ? (totalHours / totalDays).toFixed(2) : 0;
    
    const latestRecord = history.length > 0 ? history[0] : null;
    
    return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            attendantId: attendantId,
            history: history,
            summary: {
                periodDays: parseInt(days),
                recordedDays: totalDays,
                attendanceRate: ((totalDays / parseInt(days)) * 100).toFixed(1) + '%',
                totalHours: totalHours.toFixed(2),
                averageHours: averageHours,
                lastClockIn: latestRecord?.clockIn || 'N/A',
                lastClockOut: latestRecord?.clockOut || 'N/A',
                lastStatus: latestRecord?.status || 'N/A'
            }
        })
    };
}

async function updateAttendanceReport(shopName, date, action, data) {
    try {
        const params = {
            TableName: 'InventoryReports',
            Item: {
                PK: `ATTENDANCE_LOG#${date}`,
                SK: `SHOP#${shopName}#${new Date().toISOString()}`,
                shopName: shopName,
                date: date,
                action: action,
                data: data,
                timestamp: new Date().toISOString()
            }
        };
        
        await docClient.send(new PutCommand(params));
    } catch (error) {
        console.error('Error updating attendance report:', error);
    }
}

function calculateHours(startTime, endTime) {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    const startTotal = startHour * 60 + startMin;
    const endTotal = endHour * 60 + endMin;
    
    let diff = endTotal - startTotal;
    if (diff < 0) {
        diff += 24 * 60;
    }
    
    return (diff / 60).toFixed(2);
}

function getCorsHeaders() {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key'
    };
}