import { 
    getShopProducts, 
    recordSale, 
    clockIn, 
    clockOut, 
    addDailyNote, 
    getDailyNotes,
    getSalesHistory,
    getShopStats
} from './api.js';
import { getCurrentShop, getUserInfo } from './auth.js';
import { REFRESH_INTERVALS } from './config.js';

class ShopDashboard {
    constructor() {
        this.currentShop = getCurrentShop();
        this.userInfo = getUserInfo();
        this.clockedIn = false;
        this.cart = [];
        this.refreshInterval = null;
        this.init();
    }

    init() {
        this.loadShopData();
        this.setupEventListeners();
        this.setupClockStatus();
        this.startAutoRefresh();
    }

    async loadShopData() {
        try {
            await Promise.all([
                this.loadProducts(),
                this.loadShopStats(),
                this.loadDailyNotes(),
                this.loadSalesHistory()
            ]);
        } catch (error) {
            console.error('Error loading shop data:', error);
            this.showError('Failed to load shop data');
        }
    }

    async loadProducts() {
        try {
            const products = await getShopProducts();
            this.renderProducts(products);
            this.renderSaleProductList(products);
        } catch (error) {
            console.error('Error loading products:', error);
        }
    }

    renderProducts(products) {
        const gridEl = document.getElementById('shopProductsGrid');
        if (!gridEl) return;

        if (!products || products.length === 0) {
            gridEl.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-box-open"></i>
                    <p>No products available</p>
                </div>
            `;
            return;
        }

        gridEl.innerHTML = products.map(product => `
            <div class="shop-product-card" data-id="${product.id}">
                <div class="product-image">
                    <i class="fas fa-${this.getProductIcon(product.category)}"></i>
                </div>
                <div class="product-info">
                    <h4>${product.name}</h4>
                    <p class="product-price">₵${parseFloat(product.price).toFixed(2)}</p>
                    <div class="product-meta">
                        <span class="stock-badge ${product.stock < 5 ? 'low' : 'normal'}">
                            <i class="fas fa-cubes"></i> ${product.stock} in stock
                        </span>
                        <button class="btn btn-sm add-to-cart" data-product='${JSON.stringify(product)}'>
                            <i class="fas fa-cart-plus"></i> Add
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        // Add event listeners to add-to-cart buttons
        this.setupAddToCartListeners();
    }

    renderSaleProductList(products) {
        const listEl = document.getElementById('saleProductList');
        if (!listEl) return;

        listEl.innerHTML = products.map(product => `
            <div class="sale-product-item" data-id="${product.id}">
                <div class="product-info">
                    <h5>${product.name}</h5>
                    <p class="product-price">₵${parseFloat(product.price).toFixed(2)}</p>
                    <small>Stock: ${product.stock}</small>
                </div>
                <button class="btn btn-sm add-to-cart-btn" 
                        data-product='${JSON.stringify(product)}'>
                    <i class="fas fa-plus"></i> Add
                </button>
            </div>
        `).join('');

        // Add event listeners
        this.setupSaleProductListeners();
    }

    async loadShopStats() {
        try {
            const stats = await getShopStats();
            this.updateShopStats(stats);
        } catch (error) {
            console.error('Error loading shop stats:', error);
        }
    }

    updateShopStats(stats) {
        // Update product count
        const productCountEl = document.getElementById('shopProductCount');
        if (productCountEl && stats.productCount !== undefined) {
            productCountEl.textContent = stats.productCount;
        }

        // Update today's sales
        const todaySalesEl = document.getElementById('todaySales');
        if (todaySalesEl && stats.todaySales !== undefined) {
            todaySalesEl.textContent = `₵${stats.todaySales.toFixed(2)}`;
        }

        // Update low stock badge
        const lowStockBadge = document.getElementById('lowStockBadge');
        if (lowStockBadge && stats.lowStockCount !== undefined) {
            lowStockBadge.textContent = stats.lowStockCount;
            lowStockBadge.style.display = stats.lowStockCount > 0 ? 'flex' : 'none';
        }
    }

    async loadDailyNotes() {
        try {
            const notes = await getDailyNotes();
            this.renderDailyNotes(notes);
        } catch (error) {
            console.error('Error loading daily notes:', error);
        }
    }

    renderDailyNotes(notes) {
        const listEl = document.getElementById('notesList');
        if (!listEl) return;

        if (!notes || notes.length === 0) {
            listEl.innerHTML = `
                <div class="empty-notes">
                    <i class="fas fa-sticky-note"></i>
                    <p>No notes yet</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = notes.map(note => `
            <div class="note-item">
                <div class="note-header">
                    <span class="note-author">${note.attendantId?.split('@')[0] || 'Attendant'}</span>
                    <span class="note-time">${new Date(note.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="note-content">
                    ${note.note}
                </div>
            </div>
        `).join('');
    }

    async loadSalesHistory(period = 'today') {
        try {
            const history = await getSalesHistory(period);
            this.renderSalesHistory(history);
            this.updateSalesStats(history);
        } catch (error) {
            console.error('Error loading sales history:', error);
        }
    }

    renderSalesHistory(history) {
        const tbody = document.getElementById('salesHistoryBody');
        if (!tbody) return;

        if (!history || history.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        <i class="fas fa-history"></i>
                        <p>No sales history</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = history.map(sale => `
            <tr>
                <td>${sale.id || 'N/A'}</td>
                <td>${new Date(sale.timestamp).toLocaleTimeString()}</td>
                <td>${sale.items?.length || 0} items</td>
                <td class="price">₵${parseFloat(sale.total).toFixed(2)}</td>
                <td>${sale.attendantId?.split('@')[0] || 'Attendant'}</td>
            </tr>
        `).join('');
    }

    updateSalesStats(history) {
        if (!history || !Array.isArray(history)) return;

        const totalRevenue = history.reduce((sum, sale) => sum + (sale.total || 0), 0);
        const totalItems = history.reduce((sum, sale) => sum + (sale.items?.length || 0), 0);

        document.getElementById('totalRevenue').textContent = `₵${totalRevenue.toFixed(2)}`;
        document.getElementById('totalSalesCount').textContent = history.length;
        document.getElementById('totalItemsSold').textContent = totalItems;
    }

    setupEventListeners() {
        // Clock in/out button
        const clockBtn = document.getElementById('clockBtn');
        if (clockBtn) {
            clockBtn.addEventListener('click', () => {
                this.toggleClockStatus();
            });
        }

        // Add to cart buttons
        this.setupAddToCartListeners();

        // Cart management
        const clearCartBtn = document.getElementById('clearCart');
        if (clearCartBtn) {
            clearCartBtn.addEventListener('click', () => {
                this.clearCart();
            });
        }

        const processSaleBtn = document.getElementById('processSale');
        if (processSaleBtn) {
            processSaleBtn.addEventListener('click', () => {
                this.processSale();
            });
        }

        // Save note button
        const saveNoteBtn = document.getElementById('saveNote');
        if (saveNoteBtn) {
            saveNoteBtn.addEventListener('click', () => {
                this.saveDailyNote();
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById('refreshShopData');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshData();
            });
        }

        // Product search
        const productSearch = document.getElementById('productSearch');
        if (productSearch) {
            productSearch.addEventListener('input', (e) => {
                this.filterProducts(e.target.value);
            });
        }

        // Sale product search
        const saleProductSearch = document.getElementById('saleProductSearch');
        if (saleProductSearch) {
            saleProductSearch.addEventListener('input', (e) => {
                this.filterSaleProducts(e.target.value);
            });
        }

        // History filter
        const historyFilter = document.getElementById('historyFilter');
        if (historyFilter) {
            historyFilter.addEventListener('change', (e) => {
                this.loadSalesHistory(e.target.value);
            });
        }
    }

    setupClockStatus() {
        // Check if user is clocked in (this would come from backend)
        // For now, we'll assume not clocked in
        this.updateClockUI(false);
    }

    async toggleClockStatus() {
        try {
            if (this.clockedIn) {
                await clockOut();
                this.clockedIn = false;
                this.showSuccess('Clocked out successfully');
            } else {
                await clockIn();
                this.clockedIn = true;
                this.showSuccess('Clocked in successfully');
            }
            this.updateClockUI(this.clockedIn);
        } catch (error) {
            console.error('Error toggling clock status:', error);
            this.showError('Failed to update clock status');
        }
    }

    updateClockUI(isClockedIn) {
        const indicator = document.getElementById('statusIndicator');
        const text = document.getElementById('statusText');
        const btn = document.getElementById('clockBtn');

        if (isClockedIn) {
            indicator.style.color = 'var(--success-color)';
            text.textContent = 'Clocked In';
            btn.innerHTML = '<i class="fas fa-clock"></i> Clock Out';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
        } else {
            indicator.style.color = 'var(--warning-color)';
            text.textContent = 'Not Clocked In';
            btn.innerHTML = '<i class="fas fa-clock"></i> Clock In';
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-primary');
        }
    }

    setupAddToCartListeners() {
        document.querySelectorAll('.add-to-cart, .add-to-cart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productData = JSON.parse(e.target.closest('button').dataset.product);
                this.addToCart(productData);
            });
        });
    }

    setupSaleProductListeners() {
        document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productData = JSON.parse(e.target.closest('button').dataset.product);
                this.addToCart(productData);
            });
        });
    }

    addToCart(product) {
        // Check if product already in cart
        const existingItem = this.cart.find(item => item.id === product.id);
        
        if (existingItem) {
            // Check stock
            if (existingItem.quantity >= product.stock) {
                this.showError('Not enough stock available');
                return;
            }
            existingItem.quantity += 1;
        } else {
            // Check stock
            if (product.stock < 1) {
                this.showError('Product out of stock');
                return;
            }
            this.cart.push({
                ...product,
                quantity: 1
            });
        }

        this.updateCart();
        this.showSuccess(`${product.name} added to cart`);
    }

    updateCart() {
        this.renderCartItems();
        this.updateCartSummary();
        this.updateProcessSaleButton();
    }

    renderCartItems() {
        const container = document.getElementById('cartItems');
        if (!container) return;

        if (this.cart.length === 0) {
            container.innerHTML = `
                <div class="empty-cart">
                    <i class="fas fa-shopping-cart"></i>
                    <p>No items in cart</p>
                    <small>Add products from the left</small>
                </div>
            `;
            return;
        }

        container.innerHTML = this.cart.map(item => `
            <div class="cart-item" data-id="${item.id}">
                <div class="item-info">
                    <h5>${item.name}</h5>
                    <p class="item-price">₵${parseFloat(item.price).toFixed(2)} each</p>
                </div>
                <div class="item-controls">
                    <div class="quantity-controls">
                        <button class="btn-icon decrease-quantity" data-id="${item.id}">
                            <i class="fas fa-minus"></i>
                        </button>
                        <span class="quantity">${item.quantity}</span>
                        <button class="btn-icon increase-quantity" data-id="${item.id}">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <div class="item-total">
                        ₵${(item.price * item.quantity).toFixed(2)}
                    </div>
                    <button class="btn-icon remove-item" data-id="${item.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        // Add event listeners to cart item controls
        this.setupCartItemListeners();
    }

    setupCartItemListeners() {
        // Decrease quantity
        document.querySelectorAll('.decrease-quantity').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = e.target.closest('button').dataset.id;
                this.decreaseQuantity(productId);
            });
        });

        // Increase quantity
        document.querySelectorAll('.increase-quantity').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = e.target.closest('button').dataset.id;
                this.increaseQuantity(productId);
            });
        });

        // Remove item
        document.querySelectorAll('.remove-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = e.target.closest('button').dataset.id;
                this.removeFromCart(productId);
            });
        });
    }

    decreaseQuantity(productId) {
        const item = this.cart.find(item => item.id === productId);
        if (item && item.quantity > 1) {
            item.quantity -= 1;
            this.updateCart();
        } else {
            this.removeFromCart(productId);
        }
    }

    increaseQuantity(productId) {
        const item = this.cart.find(item => item.id === productId);
        const product = this.getProductById(productId);
        
        if (item && product && item.quantity < product.stock) {
            item.quantity += 1;
            this.updateCart();
        } else {
            this.showError('Not enough stock available');
        }
    }

    removeFromCart(productId) {
        this.cart = this.cart.filter(item => item.id !== productId);
        this.updateCart();
    }

    updateCartSummary() {
        const subtotal = this.cart.reduce((sum, item) => 
            sum + (item.price * item.quantity), 0);
        const tax = subtotal * 0.03; // 3% tax
        const total = subtotal + tax;

        document.getElementById('cartSubtotal').textContent = `₵${subtotal.toFixed(2)}`;
        document.getElementById('cartTax').textContent = `₵${tax.toFixed(2)}`;
        document.getElementById('cartTotal').textContent = `₵${total.toFixed(2)}`;
    }

    updateProcessSaleButton() {
        const btn = document.getElementById('processSale');
        if (btn) {
            btn.disabled = this.cart.length === 0;
        }
    }

    async processSale() {
        if (this.cart.length === 0) {
            this.showError('Cart is empty');
            return;
        }

        if (!this.clockedIn) {
            if (!confirm('You are not clocked in. Process sale anyway?')) {
                return;
            }
        }

        const saleData = {
            items: this.cart.map(item => ({
                productId: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity
            })),
            total: this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
            timestamp: new Date().toISOString()
        };

        try {
            await recordSale(saleData);
            this.showSuccess('Sale processed successfully');
            
            // Clear cart and refresh data
            this.clearCart();
            await this.loadShopData();
            
        } catch (error) {
            console.error('Error processing sale:', error);
            this.showError('Failed to process sale');
        }
    }

    clearCart() {
        this.cart = [];
        this.updateCart();
    }

    async saveDailyNote() {
        const editor = document.getElementById('noteEditor');
        const note = editor.value.trim();

        if (!note) {
            this.showError('Please enter a note');
            return;
        }

        try {
            await addDailyNote(note);
            editor.value = '';
            this.showSuccess('Note saved successfully');
            await this.loadDailyNotes();
        } catch (error) {
            console.error('Error saving note:', error);
            this.showError('Failed to save note');
        }
    }

    filterProducts(searchTerm) {
        const cards = document.querySelectorAll('.shop-product-card');
        searchTerm = searchTerm.toLowerCase();

        cards.forEach(card => {
            const productName = card.querySelector('h4').textContent.toLowerCase();
            if (productName.includes(searchTerm)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }

    filterSaleProducts(searchTerm) {
        const items = document.querySelectorAll('.sale-product-item');
        searchTerm = searchTerm.toLowerCase();

        items.forEach(item => {
            const productName = item.querySelector('h5').textContent.toLowerCase();
            if (productName.includes(searchTerm)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    getProductById(productId) {
        // This would ideally come from the current product list
        // For now, we'll search in the cart
        return this.cart.find(item => item.id === productId);
    }

    getProductIcon(category) {
        const icons = {
            'electronics': 'tv',
            'clothing': 'tshirt',
            'food': 'utensils',
            'beverages': 'wine-bottle',
            'home': 'home',
            'default': 'box-open'
        };
        return icons[category?.toLowerCase()] || icons.default;
    }

    startAutoRefresh() {
        this.refreshInterval = setInterval(() => {
            this.refreshData();
        }, REFRESH_INTERVALS.SHOP_POLLING);
    }

    refreshData() {
        this.loadShopData();
        this.showSuccess('Data refreshed');
    }

    showError(message) {
        console.error('Error:', message);
        // Implement error notification UI
        alert(`Error: ${message}`);
    }

    showSuccess(message) {
        console.log('Success:', message);
        // Implement success notification UI
        // Could use a toast notification here
    }
}

// Initialize shop dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ShopDashboard();
});