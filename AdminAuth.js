// AdminAuth.js - CommonJS version for Node.js 20.x
const { CognitoIdentityProviderClient, AdminInitiateAuthCommand, AdminGetUserCommand, AdminListGroupsForUserCommand } = require("@aws-sdk/client-cognito-identity-provider");

const cognitoClient = new CognitoIdentityProviderClient({ 
    region: process.env.AWS_REGION || 'us-east-1' 
});

exports.handler = async (event) => {
    try {
        console.log('AdminAuth event:', JSON.stringify(event, null, 2));
        
        // Parse the body
        let body;
        try {
            body = JSON.parse(event.body);
        } catch (parseError) {
            return {
                statusCode: 400,
                headers: getCorsHeaders(),
                body: JSON.stringify({ error: 'Invalid JSON body', details: parseError.message })
            };
        }
        
        const { action, email, password, newPassword } = body;
        
        const adminUserPoolId = process.env.ADMIN_USER_POOL_ID;
        const adminClientId = process.env.ADMIN_CLIENT_ID;
        
        switch (action) {
            case 'login':
                return await adminLogin(email, password, adminUserPoolId, adminClientId);
            case 'getProfile':
                return await getAdminProfile(email, adminUserPoolId);
            default:
                return {
                    statusCode: 400,
                    headers: getCorsHeaders(),
                    body: JSON.stringify({ error: 'Invalid action. Use "login" or "getProfile"' })
                };
        }
        
    } catch (error) {
        console.error('AdminAuth error:', error);
        return {
            statusCode: error.name === 'NotAuthorizedException' ? 401 : 500,
            headers: getCorsHeaders(),
            body: JSON.stringify({ 
                error: error.name === 'NotAuthorizedException' ? 'Invalid credentials' : error.message,
                details: error.name
            })
        };
    }
};

async function adminLogin(email, password, userPoolId, clientId) {
    // Validate environment variables
    if (!userPoolId || !clientId) {
        console.error('Missing Cognito configuration:', {
            userPoolId: userPoolId,
            clientId: clientId,
            env: process.env
        });
        
        return {
            statusCode: 500,
            headers: getCorsHeaders(),
            body: JSON.stringify({ 
                error: 'Server configuration error - Missing Cognito settings',
                message: 'Please check ADMIN_USER_POOL_ID and ADMIN_CLIENT_ID environment variables'
            })
        };
    }
    
    const params = {
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        ClientId: clientId,
        UserPoolId: userPoolId,
        AuthParameters: {
            USERNAME: email,
            PASSWORD: password
        }
    };
    
    console.log('Cognito login params:', { 
        userPoolId: userPoolId.substring(0, 10) + '...',
        clientId: clientId.substring(0, 10) + '...',
        email: email 
    });
    
    try {
        const command = new AdminInitiateAuthCommand(params);
        const result = await cognitoClient.send(command);
        
        // Get admin details
        const userParams = {
            Username: email,
            UserPoolId: userPoolId
        };
        
        const userCommand = new AdminGetUserCommand(userParams);
        const userResult = await cognitoClient.send(userCommand);
        
        const userAttributes = {};
        userResult.UserAttributes.forEach(attr => {
            userAttributes[attr.Name] = attr.Value;
        });
        
        return {
            statusCode: 200,
            headers: getCorsHeaders(),
            body: JSON.stringify({
                success: true,
                token: result.AuthenticationResult.IdToken,
                email: email,
                name: userAttributes.name || userAttributes.email || email.split('@')[0],
                role: 'admin',
                shops: ['Raymakossa', 'Tarso', 'Market'] // Admin can see all shops
            })
        };
        
    } catch (cognitoError) {
        console.error('Cognito login error:', {
            name: cognitoError.name,
            message: cognitoError.message,
            code: cognitoError.code
        });
        
        throw cognitoError; // Re-throw to be caught by main handler
    }
}

async function getAdminProfile(email, userPoolId) {
    const params = {
        Username: email,
        UserPoolId: userPoolId
    };
    
    const command = new AdminGetUserCommand(params);
    const result = await cognitoClient.send(command);
    
    const profile = {};
    result.UserAttributes.forEach(attr => {
        profile[attr.Name.replace('custom:', '')] = attr.Value;
    });
    
    return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            profile: profile
        })
    };
}

function getCorsHeaders() {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'
    };
}