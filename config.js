// ⚡ PRODUCTION CONFIGURATION - EXACT AWS VALUES ⚡
import { AWS_CONFIG } from './aws-config.js';

const COGNITO_CONFIG = {
    ADMIN_POOL_ID: AWS_CONFIG.COGNITO.ADMIN_POOL_ID,
    ADMIN_CLIENT_ID: AWS_CONFIG.COGNITO.ADMIN_CLIENT_ID,
    SHOP_POOL_ID: AWS_CONFIG.COGNITO.SHOP_POOL_ID,
    SHOP_CLIENT_ID: AWS_CONFIG.COGNITO.SHOP_CLIENT_ID,
    REGION: AWS_CONFIG.COGNITO.REGION
};

const API_CONFIG = {
    SHOP_API_BASE_URL: AWS_CONFIG.API_ENDPOINTS.SHOP_API,
    ADMIN_API_BASE_URL: AWS_CONFIG.API_ENDPOINTS.ADMIN_API
};

const REFRESH_INTERVALS = {
    AUTO_REFRESH: 3 * 60 * 60 * 1000,
    REAL_TIME_POLLING: 10000,
    SHOP_POLLING: 30000,
    TOKEN_REFRESH: 50 * 60 * 1000
};

const USER_ROLES = {
    ADMIN: 'Admin',
    RAYMAKOSSA: 'RaymakossaGruop',
    TARSO: 'TarsoGroup',
    MARKET: 'MarketGroup'
};

const STORAGE_KEYS = {
    TOKEN: 'marks_inventory_token',
    USER: 'marks_inventory_user',
    SHOP: 'marks_selected_shop',
    LAST_REFRESH: 'marks_last_refresh',
    COGNITO_SESSION: 'cognito_session',
    IS_MOBILE: 'is_mobile_device'
};

const SHOPS = {
    Raymakossa: {
        name: 'Raymakossa Shop',
        table: AWS_CONFIG.DYNAMODB_TABLES.RAYMAKOSSA,
        color: '#3498db',
        icon: 'fa-building'
    },
    Tarso: {
        name: 'Tarso Shop',
        table: AWS_CONFIG.DYNAMODB_TABLES.TARSO,
        color: '#2ecc71',
        icon: 'fa-store-alt'
    },
    Market: {
        name: 'Market Shop',
        table: AWS_CONFIG.DYNAMODB_TABLES.MARKET,
        color: '#e74c3c',
        icon: 'fa-shopping-cart'
    }
};

const PHONE_FORMATS = {
    GHANA: {
        format: (phone) => {
            let digits = phone.replace(/\D/g, '');
            
            if (digits.startsWith('0')) {
                return '+233' + digits.substring(1);
            }
            if (digits.startsWith('233') && digits.length === 12) {
                return '+' + digits;
            }
            if (digits.length === 9) {
                return '+233' + digits;
            }
            if (phone.startsWith('+233')) {
                return phone;
            }
            return '+233' + digits;
        },
        validate: (phone) => {
            const formatted = PHONE_FORMATS.GHANA.format(phone);
            return /^\+233\d{9}$/.test(formatted);
        }
    }
};

const API_ENDPOINTS = {
    ADMIN: {
        PRODUCTS: '/products',
        REPORTS: '/reports',
        SHOPS_OVERVIEW: '/shops/overview',
        AUTH: '/auth'
    },
    SHOP: {
        PRODUCTS: '/products',
        SALE: '/sale',
        RETURN: '/return',
        ATTENDANCE: '/attendance',
        NOTES: '/notes',
        TRANSACTIONS: '/transactions',
        STATS: '/stats',
        AUTH: '/auth'
    }
};

const IS_MOBILE = /iPhone|iPad|iPod|Android|webOS|BlackBerry|Windows Phone/i.test(navigator.userAgent);
const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

export { 
    COGNITO_CONFIG, 
    API_CONFIG, 
    REFRESH_INTERVALS, 
    USER_ROLES, 
    STORAGE_KEYS, 
    SHOPS, 
    PHONE_FORMATS,
    API_ENDPOINTS,
    IS_MOBILE,
    IS_TOUCH
};