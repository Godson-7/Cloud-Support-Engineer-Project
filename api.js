import { API_CONFIG, API_ENDPOINTS, IS_MOBILE } from './config.js';
import { getToken, isAdmin, getCurrentShop } from './auth.js';
import { mobileHelper } from './mobile-auth.js';

class ApiClient {
    constructor() {
        this.baseUrls = API_CONFIG;
        this.isMobile = IS_MOBILE;
    }

    async request(endpoint, options = {}) {
        // Check connection on mobile
        if (this.isMobile && !navigator.onLine) {
            mobileHelper.showMobileAlert('No internet connection', 'error');
            throw new Error('No internet connection');
        }

        // Determine base URL
        const baseUrl = isAdmin() ? this.baseUrls.ADMIN_API_BASE_URL : this.baseUrls.SHOP_API_BASE_URL;
        const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
        const token = getToken();

        if (!token) {
            throw new Error('No authentication token');
        }

        console.log('API Request:', {
            method: options.method || 'GET',
            url: url,
            isMobile: this.isMobile
        });

        // Headers
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
        };
         
       // if (this.isMobile) {
      //   headers['X-Device-Type'] = 'mobile';
     //   headers['X-Screen-Width'] = window.screen.width;
    // }
         
        const requestOptions = {
            ...options,
            headers: {
                ...headers,
                ...options.headers
            }
        };

        // Add timeout for mobile
        if (this.isMobile) {
            requestOptions.signal = AbortSignal.timeout(30000);
        }

        try {
            const response = await fetch(url, requestOptions);
            
            console.log('📡 API Response:', {
                status: response.status,
                url: url
            });

            if (response.status === 401) {
                // Token expired
                localStorage.clear();
                sessionStorage.clear();
                if (this.isMobile) {
                    mobileHelper.showMobileAlert('Session expired, please login again', 'error');
                }
                setTimeout(() => {
                    window.location.href = 'login.html?session=expired';
                }, 1000);
                throw new Error('Session expired');
            }

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `Request failed: ${response.status}`;
                
                try {
                    const errorData = JSON.parse(errorText);
                    errorMessage = errorData.message || errorData.error || errorMessage;
                } catch {
                    errorMessage = errorText || errorMessage;
                }
                
                throw new Error(errorMessage);
            }

            // Handle empty response
            if (response.status === 204) {
                return { success: true };
            }

            const data = await response.json();
            return data;

        } catch (error) {
            console.error('❌ API Request Failed:', error);
            
            if (this.isMobile) {
                if (error.name === 'AbortError') {
                    mobileHelper.showMobileAlert('Request timeout. Please try again.', 'error');
                } else if (error.message.includes('Failed to fetch')) {
                    mobileHelper.showMobileAlert('Cannot connect to server', 'error');
                } else {
                    mobileHelper.showMobileAlert(error.message, 'error');
                }
            }
            
            throw error;
        }
    }

    // ==================== ADMIN ENDPOINTS ====================
    
    async getProducts(shop = 'all') {
        const endpoint = shop === 'all' ? 
            API_ENDPOINTS.ADMIN.PRODUCTS : 
            `${API_ENDPOINTS.ADMIN.PRODUCTS}?shop=${shop}`;
        return this.request(endpoint);
    }

    async createProduct(productData) {
        return this.request(API_ENDPOINTS.ADMIN.PRODUCTS, {
            method: 'POST',
            body: JSON.stringify(productData)
        });
    }

    async updateProduct(productId, productData) {
        return this.request(`${API_ENDPOINTS.ADMIN.PRODUCTS}/${productId}`, {
            method: 'PUT',
            body: JSON.stringify(productData)
        });
    }

    async deleteProduct(productId) {
        return this.request(`${API_ENDPOINTS.ADMIN.PRODUCTS}/${productId}`, {
            method: 'DELETE'
        });
    }

    async getShopsOverview() {
        return this.request(API_ENDPOINTS.ADMIN.SHOPS_OVERVIEW);
    }

    async getReports(period = 'today') {
        return this.request(`${API_ENDPOINTS.ADMIN.REPORTS}?period=${period}`);
    }

    // ==================== SHOP ENDPOINTS ====================
    
    async getShopProducts() {
        const shop = getCurrentShop();
        if (!shop) throw new Error('No shop selected');
        return this.request(`${API_ENDPOINTS.SHOP.PRODUCTS}?shop=${shop}`);
    }

    async recordSale(saleData) {
        const shop = getCurrentShop();
        if (!shop) throw new Error('No shop selected');
        
        const saleWithMetadata = {
            ...saleData,
            shop: shop,
            timestamp: new Date().toISOString(),
            device: this.isMobile ? 'mobile' : 'desktop'
        };
        
        if (this.isMobile) {
            mobileHelper.showMobileAlert('Processing sale...', 'info', 2000);
        }
        
        return this.request(API_ENDPOINTS.SHOP.SALE, {
            method: 'POST',
            body: JSON.stringify(saleWithMetadata)
        });
    }

    async clockIn() {
        if (this.isMobile) {
            mobileHelper.showMobileAlert('Clocking in...', 'info');
        }
        return this.request(`${API_ENDPOINTS.SHOP.ATTENDANCE}/clock-in`, {
            method: 'POST'
        });
    }

    async clockOut() {
        if (this.isMobile) {
            mobileHelper.showMobileAlert('Clocking out...', 'info');
        }
        return this.request(`${API_ENDPOINTS.SHOP.ATTENDANCE}/clock-out`, {
            method: 'POST'
        });
    }

    async getAttendance() {
        return this.request(`${API_ENDPOINTS.SHOP.ATTENDANCE}/today`);
    }

    async addDailyNote(note) {
        const shop = getCurrentShop();
        if (!shop) throw new Error('No shop selected');
        
        if (this.isMobile) {
            mobileHelper.showMobileAlert('Saving note...', 'info');
        }
        
        return this.request(API_ENDPOINTS.SHOP.NOTES, {
            method: 'POST',
            body: JSON.stringify({ 
                note: note,
                shop: shop,
                timestamp: new Date().toISOString()
            })
        });
    }

    async getDailyNotes() {
        const shop = getCurrentShop();
        if (!shop) throw new Error('No shop selected');
        return this.request(`${API_ENDPOINTS.SHOP.NOTES}?shop=${shop}`);
    }

    async getSalesHistory(period = 'today') {
        const shop = getCurrentShop();
        if (!shop) throw new Error('No shop selected');
        return this.request(`${API_ENDPOINTS.SHOP.TRANSACTIONS}?shop=${shop}&period=${period}`);
    }

    async getShopStats() {
        const shop = getCurrentShop();
        if (!shop) throw new Error('No shop selected');
        return this.request(`${API_ENDPOINTS.SHOP.STATS}?shop=${shop}`);
    }

    async returnProduct(returnData) {
        const shop = getCurrentShop();
        if (!shop) throw new Error('No shop selected');
        
        return this.request(API_ENDPOINTS.SHOP.RETURN, {
            method: 'POST',
            body: JSON.stringify({
                ...returnData,
                shop: shop
            })
        });
    }

    // Mobile-specific methods
    async syncOfflineData() {
        if (!this.isMobile) return;
        
        // Check for offline data
        const offlineData = localStorage.getItem('offline_sales');
        if (!offlineData) return;
        
        try {
            const sales = JSON.parse(offlineData);
            for (const sale of sales) {
                await this.recordSale(sale);
            }
            
            localStorage.removeItem('offline_sales');
            mobileHelper.showMobileAlert('Offline data synced!', 'success');
        } catch (error) {
            console.error('Failed to sync offline data:', error);
        }
    }
}

// Create singleton instance
const api = new ApiClient();

// Sync offline data on mobile when coming online
if (IS_MOBILE) {
    window.addEventListener('online', () => {
        api.syncOfflineData();
    });
}

// Export functions
export { api };
export const getProducts = (...args) => api.getProducts(...args);
export const createProduct = (...args) => api.createProduct(...args);
export const updateProduct = (...args) => api.updateProduct(...args);
export const deleteProduct = (...args) => api.deleteProduct(...args);
export const getShopsOverview = () => api.getShopsOverview();
export const getReports = (...args) => api.getReports(...args);
export const getShopProducts = () => api.getShopProducts();
export const recordSale = (...args) => api.recordSale(...args);
export const clockIn = () => api.clockIn();
export const clockOut = () => api.clockOut();
export const getAttendance = () => api.getAttendance();
export const addDailyNote = (...args) => api.addDailyNote(...args);
export const getDailyNotes = () => api.getDailyNotes();
export const getSalesHistory = (...args) => api.getSalesHistory(...args);
export const getShopStats = () => api.getShopStats();
export const returnProduct = (...args) => api.returnProduct(...args);