const { CognitoIdentityProviderClient, AdminInitiateAuthCommand, AdminGetUserCommand, AdminListGroupsForUserCommand } = require("@aws-sdk/client-cognito-identity-provider");

const cognitoClient = new CognitoIdentityProviderClient({ 
    region: process.env.AWS_REGION || 'us-east-1' 
});

exports.handler = async (event) => {
    try {
        console.log('ShopAuth event:', JSON.stringify(event, null, 2));
        
        const { action, email, password } = JSON.parse(event.body);
        
        const attendantsPoolId = process.env.ATTENDANTS_USER_POOL_ID;
        const attendantsClientId = process.env.ATTENDANTS_CLIENT_ID;
        
        if (action === 'login') {
            return await attendantLogin(email, password, attendantsPoolId, attendantsClientId);
        } else {
            return {
                statusCode: 400,
                headers: getCorsHeaders(),
                body: JSON.stringify({ error: 'Invalid action' })
            };
        }
        
    } catch (error) {
        console.error('ShopAuth error:', error);
        const statusCode = error.name === 'NotAuthorizedException' ? 401 : 500;
        return {
            statusCode: statusCode,
            headers: getCorsHeaders(),
            body: JSON.stringify({ 
                error: error.name === 'NotAuthorizedException' ? 'Invalid email or password' : error.message 
            })
        };
    }
};

async function attendantLogin(email, password, userPoolId, clientId) {
    const authParams = {
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        ClientId: clientId,
        UserPoolId: userPoolId,
        AuthParameters: {
            USERNAME: email,
            PASSWORD: password
        }
    };
    
    const authCommand = new AdminInitiateAuthCommand(authParams);
    const authResult = await cognitoClient.send(authCommand);
    
    const userParams = {
        Username: email,
        UserPoolId: userPoolId
    };
    
    const userCommand = new AdminGetUserCommand(userParams);
    const userResult = await cognitoClient.send(userCommand);
    
    const groupParams = {
        Username: email,
        UserPoolId: userPoolId
    };
    
    const groupCommand = new AdminListGroupsForUserCommand(groupParams);
    const groupResult = await cognitoClient.send(groupCommand);
    
    let shop = '';
    let shopTable = '';
    
    if (groupResult.Groups && groupResult.Groups.length > 0) {
        const groupName = groupResult.Groups[0].GroupName;
        if (groupName === 'RaymakossaGroup') {
            shop = 'Raymakossa';
            shopTable = 'RaymakossaShop';
        } else if (groupName === 'TarsoGroup') {
            shop = 'Tarso';
            shopTable = 'TarsoShop';
        } else if (groupName === 'MarketGroup') {
            shop = 'Market';
            shopTable = 'MarketShop';
        }
    }
    
    const userAttributes = {};
    userResult.UserAttributes.forEach(attr => {
        userAttributes[attr.Name] = attr.Value;
    });
    
    return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify({
            success: true,
            token: authResult.AuthenticationResult.IdToken,
            email: email,
            name: userAttributes.name || userAttributes.email || email.split('@')[0],
            shop: shop,
            shopTable: shopTable,
            role: 'attendant',
            permissions: ['clock_in', 'clock_out', 'record_sale', 'add_note']
        })
    };
}

function getCorsHeaders() {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key'
    };
}