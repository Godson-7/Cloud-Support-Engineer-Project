// auth.js - PRODUCTION READY WITH FIXED LOGIN REDIRECTS
import { 
    COGNITO_CONFIG, 
    USER_ROLES, 
    STORAGE_KEYS, 
    PHONE_FORMATS, 
    IS_MOBILE 
} from './config.js';

// Initialize AWS SDK
if (typeof AWS !== 'undefined') {
    AWS.config.region = COGNITO_CONFIG.REGION;
} else {
    console.error('AWS SDK not loaded!');
}

// Global Cognito references
const AmazonCognitoIdentity = window.AmazonCognitoIdentity;
const CognitoUserPool = AmazonCognitoIdentity?.CognitoUserPool;
const CognitoUser = AmazonCognitoIdentity?.CognitoUser;
const AuthenticationDetails = AmazonCognitoIdentity?.AuthenticationDetails;

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.currentToken = null;
        this.userRole = null;
        this.userShop = null;
        this.cognitoUser = null;
        this.isMobile = IS_MOBILE;
        this.init();
    }

    init() {
        this.loadUserFromStorage();
        this.setupLogoutButton();
        this.setupAutoRefresh();
        
        if (this.isMobile) {
            this.setupMobileFeatures();
        }
    }

    loadUserFromStorage() {
        try {
            const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
            const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || 'null');
            const shop = localStorage.getItem(STORAGE_KEYS.SHOP);
            
            if (token && user) {
                // Check if token is expired
                if (this.isTokenExpired(token)) {
                    console.log('Token expired, clearing auth');
                    this.clearAuthData();
                    return;
                }
                
                this.currentToken = token;
                this.currentUser = user;
                this.userRole = user.role;
                this.userShop = shop;
                
                console.log('✅ User loaded from storage:', {
                    username: user.username,
                    role: user.role,
                    shop: shop
                });
            }
        } catch (error) {
            console.error('Error loading user from storage:', error);
            this.clearAuthData();
        }
    }

    isTokenExpired(token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const expiry = payload.exp * 1000; // Convert to milliseconds
            return Date.now() >= expiry;
        } catch {
            return true;
        }
    }

    async authenticateAdmin(email, password) {
        console.log('🔑 Admin login attempt:', email);
        
        return new Promise((resolve, reject) => {
            this.authenticateCognitoUser(email, password, 'admin', null, resolve, reject);
        });
    }

    async authenticateShopAttendant(phoneNumber, password, selectedShop) {
        console.log('🔑 Shop login attempt:', { phoneNumber, selectedShop });
        
        // Format phone number
        const formattedPhone = PHONE_FORMATS.GHANA.format(phoneNumber);
        console.log('Formatted phone:', formattedPhone);
        
        return new Promise((resolve, reject) => {
            this.authenticateCognitoUser(formattedPhone, password, 'shop', selectedShop, resolve, reject);
        });
    }

    authenticateCognitoUser(username, password, userType, selectedShop, resolve, reject) {
        if (!CognitoUserPool || !CognitoUser) {
            reject(new Error('Cognito SDK not loaded. Please refresh the page.'));
            return;
        }
        
        const poolConfig = userType === 'admin' 
            ? { 
                poolId: COGNITO_CONFIG.ADMIN_POOL_ID, 
                clientId: COGNITO_CONFIG.ADMIN_CLIENT_ID 
              }
            : { 
                poolId: COGNITO_CONFIG.SHOP_POOL_ID, 
                clientId: COGNITO_CONFIG.SHOP_CLIENT_ID 
              };
        
        console.log('Using pool config:', {
            userType: userType,
            poolId: poolConfig.poolId.substring(0, 20) + '...'
        });
        
        const authenticationData = {
            Username: username,
            Password: password
        };
        
        const authenticationDetails = new AuthenticationDetails(authenticationData);
        const userPool = new CognitoUserPool({
            UserPoolId: poolConfig.poolId,
            ClientId: poolConfig.clientId
        });
        
        this.cognitoUser = new CognitoUser({
            Username: username,
            Pool: userPool
        });
        
        this.cognitoUser.authenticateUser(authenticationDetails, {
            onSuccess: (result) => {
                console.log('✅ Authentication successful for:', username);
                this.processAuthSuccess(result, username, userType, selectedShop, resolve);
            },
            onFailure: (err) => {
                console.error('❌ Authentication failed:', err);
                
                let errorMessage = 'Authentication failed';
                if (err.code === 'NotAuthorizedException') {
                    errorMessage = 'Invalid username or password';
                } else if (err.code === 'UserNotFoundException') {
                    errorMessage = 'User not found. Please check your credentials';
                } else if (err.code === 'UserNotConfirmedException') {
                    errorMessage = 'Please verify your account first';
                } else if (err.message) {
                    errorMessage = err.message;
                }
                
                reject(new Error(errorMessage));
            },
            newPasswordRequired: () => {
                console.log('🔄 New password required');
                this.handleNewPasswordRequired(username, userType, selectedShop, resolve, reject);
            },
            mfaRequired: () => {
                reject(new Error('MFA is not supported in this app'));
            }
        });
    }

    processAuthSuccess(result, username, userType, selectedShop, resolve) {
        try {
            const idToken = result.getIdToken().getJwtToken();
            const tokenPayload = result.getIdToken().payload;
            
            console.log('🔍 Token payload:', {
                groups: tokenPayload['cognito:groups'],
                email: tokenPayload.email,
                phone: tokenPayload.phone_number
            });
            
            // Determine user role and shop
            let role, shop;
            
            if (userType === 'admin') {
                // Admin user
                role = USER_ROLES.ADMIN;
                shop = null;
                console.log('👑 User identified as ADMIN');
            } else {
                // Shop attendant - determine shop from Cognito groups
                const groups = tokenPayload['cognito:groups'] || [];
                shop = this.determineShopFromGroups(groups, selectedShop);
                
                if (!shop) {
                    throw new Error('User not assigned to any shop group. Contact administrator.');
                }
                
                role = this.getRoleFromShop(shop);
                console.log(`🏪 User identified as ${shop} attendant`);
            }
            
            // Create user info object
            const userInfo = {
                username: username,
                email: tokenPayload.email || '',
                phone: tokenPayload.phone_number || username,
                role: role,
                name: tokenPayload.name || tokenPayload['cognito:username'] || username.split('@')[0],
                shop: shop,
                userType: userType,
                groups: tokenPayload['cognito:groups'] || []
            };
            
            console.log('✅ User info created:', userInfo);
            
            // Save auth data and redirect
            this.saveAuthData(idToken, userInfo, shop);
            resolve(userInfo);
            
        } catch (error) {
            console.error('❌ Error processing auth success:', error);
            reject(new Error('Failed to process authentication: ' + error.message));
        }
    }

    determineShopFromGroups(groups, selectedShop) {
        console.log('Determining shop from groups:', groups);
        
        // Check if user is in any shop group
        if (groups.includes('RaymakossaGroup')) {
            console.log('✅ User belongs to RaymakossaGroup');
            return 'Raymakossa';
        }
        if (groups.includes('TarsoGroup')) {
            console.log('✅ User belongs to TarsoGroup');
            return 'Tarso';
        }
        if (groups.includes('MarketGroup')) {
            console.log('✅ User belongs to MarketGroup');
            return 'Market';
        }
        
        // If no shop group found but selectedShop provided (for testing)
        if (selectedShop && ['Raymakossa', 'Tarso', 'Market'].includes(selectedShop)) {
            console.log('⚠️ Using selected shop (no group found):', selectedShop);
            return selectedShop;
        }
        
        console.error('❌ User not in any shop group:', groups);
        return null;
    }

    getRoleFromShop(shop) {
        const roleMap = {
            'Raymakossa': USER_ROLES.RAYMAKOSSA,
            'Tarso': USER_ROLES.TARSO,
            'Market': USER_ROLES.MARKET
        };
        return roleMap[shop] || 'SHOP_ATTENDANT';
    }

    saveAuthData(token, userInfo, shop) {
        console.log('💾 Saving auth data:', { 
            role: userInfo.role, 
            shop: shop,
            username: userInfo.username 
        });
        
        // Store in memory
        this.currentToken = token;
        this.currentUser = userInfo;
        this.userRole = userInfo.role;
        this.userShop = shop;
        
        // Store in localStorage
        localStorage.setItem(STORAGE_KEYS.TOKEN, token);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userInfo));
        if (shop) {
            localStorage.setItem(STORAGE_KEYS.SHOP, shop);
        }
        
        // Set auth header for API calls
        this.setAuthHeader(token);
        
        // REDIRECT BASED ON USER TYPE - FIXED LOGIC
        console.log('🔄 Preparing redirect...');
        console.log('User Type:', userInfo.userType);
        console.log('User Role:', userInfo.role);
        console.log('Is Admin?', userInfo.userType === 'admin');
        
        setTimeout(() => {
            if (userInfo.userType === 'admin' || userInfo.role === USER_ROLES.ADMIN) {
                console.log('🚀 Redirecting ADMIN to admin-dashboard.html');
                window.location.href = 'admin-dashboard.html';
            } else {
                console.log('🚀 Redirecting SHOP ATTENDANT to shop-dashboard.html');
                window.location.href = 'shop-dashboard.html';
            }
        }, 500);
    }

    setAuthHeader(token) {
        // Store token globally for fetch interceptor
        window.authToken = token;
        
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const [url, options = {}] = args;
            
            // Only add auth header to our API endpoints
            if (typeof url === 'string' && url.includes('execute-api.us-east-1.amazonaws.com')) {
                const headers = {
                    ...options.headers,
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                };
                
                return originalFetch(url, { ...options, headers });
            }
            
            return originalFetch(url, options);
        };
    }

    handleNewPasswordRequired(username, userType, shop, resolve, reject) {
        // Simplified new password handler
        const newPassword = prompt('Please set your new password:');
        if (!newPassword) {
            reject(new Error('Password change cancelled'));
            return;
        }
        
        this.cognitoUser.completeNewPasswordChallenge(newPassword, {}, {
            onSuccess: (result) => {
                console.log('✅ New password set successfully');
                this.processAuthSuccess(result, username, userType, shop, resolve);
            },
            onFailure: (err) => {
                console.error('❌ Failed to set new password:', err);
                reject(new Error('Failed to set new password: ' + err.message));
            }
        });
    }

    logout() {
        console.log('🚪 Logging out...');
        
        // Clear Cognito session
        if (this.cognitoUser) {
            try {
                this.cognitoUser.signOut();
            } catch (error) {
                console.warn('Error signing out from Cognito:', error);
            }
        }
        
        // Clear all data
        this.clearAuthData();
        localStorage.clear();
        sessionStorage.clear();
        
        // Reset fetch override
        if (window.originalFetch) {
            window.fetch = window.originalFetch;
        }
        
        // Redirect to login
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 500);
    }

    clearAuthData() {
        this.currentUser = null;
        this.currentToken = null;
        this.userRole = null;
        this.userShop = null;
        this.cognitoUser = null;
    }

    isAuthenticated() {
        if (!this.currentToken) return false;
        return !this.isTokenExpired(this.currentToken);
    }

    isAdmin() {
        return this.userRole === USER_ROLES.ADMIN;
    }

    getCurrentShop() {
        return this.userShop;
    }

    getUserInfo() {
        return this.currentUser;
    }

    getToken() {
        return this.currentToken;
    }

    setupLogoutButton() {
        document.addEventListener('click', (e) => {
            if (e.target.closest('#logoutBtn')) {
                e.preventDefault();
                this.logout();
            }
        });
    }

    setupAutoRefresh() {
        // Refresh token 5 minutes before expiry
        setInterval(() => {
            if (this.currentToken && this.isTokenExpired(this.currentToken)) {
                console.log('Token expired, logging out');
                this.logout();
            }
        }, 5 * 60 * 1000); // Check every 5 minutes
    }

    setupMobileFeatures() {
        console.log('📱 Mobile auth features enabled');
        
        // Touch-friendly elements
        document.querySelectorAll('button, input').forEach(el => {
            el.style.minHeight = '44px';
            el.style.fontSize = '16px';
        });
    }
}

// Create singleton instance
const auth = new AuthManager();

// Export functions
export default auth;
export async function authenticateAdmin(email, password) {
    return auth.authenticateAdmin(email, password);
}
export async function authenticateShopAttendant(phoneNumber, password, shop) {
    return auth.authenticateShopAttendant(phoneNumber, password, shop);
}
export function logout() {
    return auth.logout();
}
export function isAuthenticated() {
    return auth.isAuthenticated();
}
export function isAdmin() {
    return auth.isAdmin();
}
export function getCurrentShop() {
    return auth.getCurrentShop();
}
export function getUserInfo() {
    return auth.getUserInfo();
}
export function getToken() {
    return auth.getToken();
}

// Debug functions
export function debugAuth() {
    console.log('=== AUTH DEBUG ===');
    console.log('Token exists:', !!localStorage.getItem(STORAGE_KEYS.TOKEN));
    console.log('Token:', localStorage.getItem(STORAGE_KEYS.TOKEN)?.substring(0, 50) + '...');
    
    const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || '{}');
    console.log('User:', user);
    console.log('Role:', user.role);
    console.log('User Type:', user.userType);
    console.log('Shop:', localStorage.getItem(STORAGE_KEYS.SHOP));
    console.log('Is Admin?', user.userType === 'admin' || user.role === 'Admin');
}

// Auto-check authentication on page load
document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop();
    const protectedPages = ['admin-dashboard.html', 'shop-dashboard.html'];
    
    console.log('🔍 Page loaded:', currentPage);
    
    if (protectedPages.includes(currentPage)) {
        if (!auth.isAuthenticated()) {
            console.log('❌ Not authenticated, redirecting to login');
            setTimeout(() => {
                window.location.href = 'login.html?redirect=' + encodeURIComponent(currentPage);
            }, 1000);
            return;
        }
        
        // Check if user is on correct dashboard
        const user = auth.getUserInfo();
        const isAdminUser = auth.isAdmin();
        
        console.log('👤 Current user:', {
            username: user?.username,
            role: user?.role,
            userType: user?.userType,
            isAdmin: isAdminUser
        });
        
        // Prevent admin from accessing shop dashboard
        if (currentPage === 'shop-dashboard.html' && isAdminUser) {
            console.log('⚠️ Admin trying to access shop dashboard, redirecting...');
            window.location.href = 'admin-dashboard.html';
            return;
        }
        
        // Prevent shop attendant from accessing admin dashboard
        if (currentPage === 'admin-dashboard.html' && !isAdminUser) {
            console.log('⚠️ Shop attendant trying to access admin dashboard, redirecting...');
            window.location.href = 'shop-dashboard.html';
            return;
        }
        
        // Update UI with user info
        // Admin dashboard elements
        const userNameEl = document.getElementById('userName');
        if (userNameEl && user) {
            userNameEl.textContent = user.name || user.username;
        }
        
        // Shop dashboard elements
        const attendantNameEl = document.getElementById('attendantName');
        const attendantRoleEl = document.getElementById('attendantRole');
        const shopNameEl = document.getElementById('shopName');
        
        if (attendantNameEl && user) {
            attendantNameEl.textContent = user.name || user.phone || user.username;
        }
        
        if (attendantRoleEl && user) {
            const roleDisplay = user.role?.replace('Group', '') || 'Shop Attendant';
            attendantRoleEl.textContent = roleDisplay;
        }
        
        if (shopNameEl && auth.getCurrentShop()) {
            shopNameEl.textContent = `${auth.getCurrentShop()} Shop Dashboard`;
        }
    }
});

// Add debug function to window for easy access
window.debugAuth = debugAuth;