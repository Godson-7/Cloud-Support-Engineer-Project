import { 
    getProducts, 
    createProduct, 
    updateProduct, 
    deleteProduct, 
    getShopsOverview 
} from './api.js';

class AdminDashboard {
    constructor() {
        this.currentShop = 'all';
        this.products = [];
        this.isLoading = false;
        this.init();
    }

    init() {
        console.log('🚀 AdminDashboard initializing...');
        
        // Setup event listeners first
        this.setupEventListeners();
        this.setupProductModal();
        
        // Then load data
        this.loadDashboardData();
        
        // Setup auto-refresh every 3 hours
        this.setupAutoRefresh();
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Shop filter
        const shopFilter = document.getElementById('shopFilter');
        if (shopFilter) {
            shopFilter.addEventListener('change', (e) => {
                this.currentShop = e.target.value;
                this.loadProducts();
            });
        }

        // Refresh button - FIXED
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            console.log('Refresh button found, adding click handler');
            refreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Refresh button clicked');
                this.refreshData();
            });
        } else {
            console.error('Refresh button not found!');
        }

        // Add product button
        const addProductBtn = document.getElementById('addProductBtn');
        if (addProductBtn) {
            addProductBtn.addEventListener('click', () => {
                this.showAddProductModal();
            });
        }

        // Export button
        const exportBtn = document.getElementById('exportProducts');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportProducts();
            });
        }
    }

    setupProductModal() {
        const form = document.getElementById('productForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleProductSubmit();
            });
        }

        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('productModal').classList.remove('active');
            });
        });

        // Close modal on outside click
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                document.getElementById('productModal').classList.remove('active');
            }
        });
    }

    async loadDashboardData() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading(true);
        
        try {
            console.log('Loading dashboard data...');
            
            // Load products and shops in parallel
            const [products, shops] = await Promise.all([
                this.loadProducts(),
                this.loadShopsOverview()
            ]);
            
            console.log('Dashboard data loaded successfully');
            this.updateDashboardStats(products, shops);
            
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.showError(`Failed to load data: ${error.message}`);
        } finally {
            this.isLoading = false;
            this.showLoading(false);
            this.updateLastUpdated();
        }
    }

    async loadProducts() {
        try {
            console.log(`Loading products for shop: ${this.currentShop}`);
            this.products = await getProducts(this.currentShop);
            console.log(`Loaded ${this.products.length} products`);
            
            this.renderProductsTable();
            this.updateProductsSummary();
            
            return this.products;
        } catch (error) {
            console.error('Error loading products:', error);
            this.showError(`Failed to load products: ${error.message}`);
            this.products = [];
            this.renderProductsTable();
            return [];
        }
    }

    renderProductsTable() {
        const tbody = document.getElementById('productsTableBody');
        if (!tbody) {
            console.error('Products table body not found!');
            return;
        }

        if (!this.products || this.products.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-state">
                        <i class="fas fa-box-open"></i>
                        <p>No products found</p>
                        <button class="btn btn-text" onclick="document.getElementById('addProductBtn').click()">
                            Add your first product
                        </button>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.products.map(product => {
            const productId = product.productId || product.id || 'N/A';
            const stock = product.stock || product.quantity || 0;
            const price = product.price || 0;
            const shops = Array.isArray(product.shops) ? product.shops : 
                         product.shop ? [product.shop] : 
                         ['All'];
            
            return `
                <tr data-product-id="${productId}">
                    <td>${productId}</td>
                    <td>
                        <strong>${product.name || 'Unnamed Product'}</strong>
                        ${product.description ? `<br><small class="text-muted">${product.description}</small>` : ''}
                    </td>
                    <td><span class="badge">${product.category || 'Uncategorized'}</span></td>
                    <td class="price">₵${parseFloat(price).toFixed(2)}</td>
                    <td>
                        <div class="stock-indicator">
                            <span class="stock-value ${stock < 10 ? 'low' : ''}">
                                ${stock}
                            </span>
                            ${stock < 10 ? '<i class="fas fa-exclamation-triangle text-warning"></i>' : ''}
                        </div>
                    </td>
                    <td>
                        ${shops.map(shop => 
                            `<span class="shop-tag">${shop}</span>`
                        ).join('')}
                    </td>
                    <td>
                        <span class="status-badge ${stock > 0 ? 'active' : 'inactive'}">
                            ${stock > 0 ? 'In Stock' : 'Out of Stock'}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon edit-product" data-id="${productId}" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon delete-product" data-id="${productId}" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Re-attach event listeners
        this.attachProductActionListeners();
    }

    attachProductActionListeners() {
        // Edit buttons
        document.querySelectorAll('.edit-product').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = e.target.closest('.edit-product').dataset.id;
                this.editProduct(productId);
            });
        });

        // Delete buttons
        document.querySelectorAll('.delete-product').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const productId = e.target.closest('.delete-product').dataset.id;
                await this.deleteProduct(productId);
            });
        });
    }

    updateProductsSummary() {
        if (!this.products || this.products.length === 0) {
            ['totalInventoryValue', 'averagePrice', 'outOfStockCount'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = id.includes('Price') ? '₵0.00' : '0';
            });
            return;
        }

        const totalValue = this.products.reduce((sum, product) => 
            sum + (parseFloat(product.price || 0) * parseInt(product.stock || product.quantity || 0)), 0);
        
        const averagePrice = this.products.length > 0 
            ? this.products.reduce((sum, product) => sum + parseFloat(product.price || 0), 0) / this.products.length
            : 0;
        
        const outOfStockCount = this.products.filter(p => (p.stock || p.quantity || 0) <= 0).length;

        const totalValueEl = document.getElementById('totalInventoryValue');
        const averagePriceEl = document.getElementById('averagePrice');
        const outOfStockEl = document.getElementById('outOfStockCount');
        
        if (totalValueEl) totalValueEl.textContent = `₵${totalValue.toFixed(2)}`;
        if (averagePriceEl) averagePriceEl.textContent = `₵${averagePrice.toFixed(2)}`;
        if (outOfStockEl) outOfStockEl.textContent = outOfStockCount;
    }

    async loadShopsOverview() {
        try {
            const overview = await getShopsOverview();
            this.renderShopsOverview(overview);
            return overview;
        } catch (error) {
            console.error('Error loading shops overview:', error);
            this.showError('Failed to load shops overview');
            return [];
        }
    }

    renderShopsOverview(overview) {
        const container = document.getElementById('shopsPerformance');
        if (!container) return;

        if (!overview || overview.length === 0) {
            container.innerHTML = '<div class="error-state"><p>No shop data available</p></div>';
            return;
        }

        container.innerHTML = overview.map(shop => `
            <div class="shop-performance-card">
                <div class="shop-header">
                    <div class="shop-icon-small">
                        <i class="fas fa-store"></i>
                    </div>
                    <div>
                        <h4>${shop.name || shop.shopName || 'Shop'}</h4>
                        <small>${shop.location || ''}</small>
                    </div>
                </div>
                <div class="shop-stats">
                    <div class="stat">
                        <span class="stat-label">Products</span>
                        <span class="stat-value">${shop.productCount || shop.totalProducts || 0}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Stock</span>
                        <span class="stat-value">${shop.totalStock || shop.inventoryCount || 0}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Sales</span>
                        <span class="stat-value">₵${(shop.todaySales || shop.dailyRevenue || 0).toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    updateDashboardStats(products, shops) {
        // Update stats cards
        const totalSales = shops?.reduce((sum, shop) => sum + (shop.todaySales || 0), 0) || 0;
        const totalProducts = products?.length || 0;
        const lowStockCount = products?.filter(p => (p.stock || p.quantity || 0) < 10).length || 0;
        const activeAttendants = shops?.reduce((sum, shop) => sum + (shop.activeAttendants || 0), 0) || 0;

        const totalSalesEl = document.getElementById('totalSales');
        const totalProductsEl = document.getElementById('totalProducts');
        const lowStockEl = document.getElementById('lowStockCount');
        const attendantsEl = document.getElementById('activeAttendants');
        
        if (totalSalesEl) totalSalesEl.textContent = `₵${totalSales.toFixed(2)}`;
        if (totalProductsEl) totalProductsEl.textContent = totalProducts;
        if (lowStockEl) lowStockEl.textContent = lowStockCount;
        if (attendantsEl) attendantsEl.textContent = activeAttendants;
    }

    refreshData() {
        console.log('Refreshing data...');
        this.loadDashboardData();
        this.showToast('Data refreshed successfully', 'success');
    }

    setupAutoRefresh() {
        // Auto-refresh every 3 hours (10800000 ms)
        setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.refreshData();
            }
        }, 10800000);
    }

    showAddProductModal() {
        document.getElementById('modalTitle').textContent = 'Add New Product';
        document.getElementById('productForm').reset();
        document.getElementById('productId').value = '';
        
        // Set all shops checked by default
        document.querySelectorAll('input[name="shop"]').forEach(cb => {
            cb.checked = true;
        });
        
        document.getElementById('productModal').classList.add('active');
        
        // Focus on name field
        setTimeout(() => {
            document.getElementById('productName').focus();
        }, 100);
    }

    async editProduct(productId) {
        try {
            const product = this.products.find(p => 
                (p.productId === productId) || (p.id === productId)
            );
            
            if (!product) {
                throw new Error('Product not found');
            }

            document.getElementById('modalTitle').textContent = 'Edit Product';
            document.getElementById('productId').value = productId;
            document.getElementById('productName').value = product.name || '';
            document.getElementById('productCategory').value = product.category || '';
            document.getElementById('productPrice').value = product.price || 0;
            document.getElementById('productStock').value = product.stock || product.quantity || 0;
            document.getElementById('productDescription').value = product.description || '';
            
            // Set shop checkboxes
            const productShops = Array.isArray(product.shops) ? product.shops : 
                               product.shop ? [product.shop] : 
                               ['Raymakossa', 'Tarso', 'Market'];
            
            document.querySelectorAll('input[name="shop"]').forEach(checkbox => {
                checkbox.checked = productShops.includes(checkbox.value);
            });

            document.getElementById('productModal').classList.add('active');

        } catch (error) {
            console.error('Error loading product for edit:', error);
            this.showError('Failed to load product: ' + error.message);
        }
    }

    async deleteProduct(productId) {
        if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
            return;
        }

        try {
            await deleteProduct(productId);
            this.showToast('Product deleted successfully', 'success');
            await this.loadProducts(); // Refresh list
        } catch (error) {
            console.error('Error deleting product:', error);
            this.showError('Failed to delete product: ' + error.message);
        }
    }

    async handleProductSubmit() {
        const form = document.getElementById('productForm');
        const productId = document.getElementById('productId').value;
        
        // Get form data
        const formData = {
            name: document.getElementById('productName').value.trim(),
            category: document.getElementById('productCategory').value,
            price: parseFloat(document.getElementById('productPrice').value),
            stock: parseInt(document.getElementById('productStock').value) || 0,
            description: document.getElementById('productDescription').value.trim(),
            shops: Array.from(document.querySelectorAll('input[name="shop"]:checked'))
                .map(cb => cb.value)
        };

        // Validation
        if (!formData.name) {
            this.showError('Product name is required');
            return;
        }

        if (formData.price <= 0 || isNaN(formData.price)) {
            this.showError('Price must be greater than 0');
            return;
        }

        if (formData.stock < 0 || isNaN(formData.stock)) {
            this.showError('Stock cannot be negative');
            return;
        }

        // Disable submit button and show loading
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        submitBtn.disabled = true;

        try {
            let result;
            if (productId) {
                // Update existing product
                console.log('Updating product:', productId, formData);
                result = await updateProduct(productId, formData);
                this.showToast('Product updated successfully', 'success');
            } else {
                // Create new product
                console.log('Creating product:', formData);
                result = await createProduct(formData);
                this.showToast('Product created successfully', 'success');
            }

            console.log('Product save result:', result);

            // Close modal, reset form, and refresh data
            document.getElementById('productModal').classList.remove('active');
            form.reset();
            await this.loadProducts();

        } catch (error) {
            console.error('Error saving product:', error);
            this.showError('Failed to save product: ' + error.message);
        } finally {
            // Restore button state
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    exportProducts() {
        if (!this.products || this.products.length === 0) {
            this.showError('No products to export');
            return;
        }

        const dataStr = JSON.stringify(this.products, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `products_${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        document.body.appendChild(linkElement);
        linkElement.click();
        document.body.removeChild(linkElement);
        
        this.showToast('Products exported successfully', 'success');
    }

    updateLastUpdated() {
        const el = document.getElementById('lastUpdated');
        if (el) {
            el.textContent = new Date().toLocaleTimeString();
        }
    }

    showLoading(show) {
        // You can implement a loading overlay if needed
        if (show) {
            console.log('Loading...');
        } else {
            console.log('Loading complete');
        }
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showToast(message, type = 'info') {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'check-circle'}"></i>
            <span>${message}</span>
            <button class="toast-close">&times;</button>
        `;
        
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => toast.classList.add('show'), 10);
        
        // Auto-remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, type === 'error' ? 5000 : 3000);
        
        // Close button
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        });
    }
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing Admin Dashboard...');
    new AdminDashboard();
});