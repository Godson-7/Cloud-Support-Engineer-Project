// Mobile-friendly authentication and UI helpers
import { IS_MOBILE, IS_TOUCH, STORAGE_KEYS } from './config.js';

class MobileAuthHelper {
    constructor() {
        this.isMobile = IS_MOBILE || IS_TOUCH;
        this.setupComplete = false;
        this.init();
    }

    init() {
        if (this.isMobile) {
            console.log('📱 Mobile device detected');
            localStorage.setItem(STORAGE_KEYS.IS_MOBILE, 'true');
            this.setupMobileFeatures();
        } else {
            localStorage.removeItem(STORAGE_KEYS.IS_MOBILE);
        }
    }

    setupMobileFeatures() {
        if (this.setupComplete) return;
        
        // Add mobile class to body
        document.body.classList.add('touch-device', 'mobile-device');
        
        // Prevent zoom on input focus (iOS fix)
        this.preventIOSZoom();
        
        // Add mobile menu toggle
        this.addMobileMenuToggle();
        
        // Make elements touch-friendly
        this.makeTouchFriendly();
        
        // Setup mobile storage
        this.setupMobileStorage();
        
        this.setupComplete = true;
        console.log('📱 Mobile features enabled');
    }

    preventIOSZoom() {
        if (!IS_MOBILE) return;
        
        let viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = 'viewport';
            document.head.appendChild(viewport);
        }
        
        viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
        
        // Prevent zoom on input focus
        document.addEventListener('focus', (e) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
                viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
            }
        }, true);
        
        document.addEventListener('blur', () => {
            setTimeout(() => {
                viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
            }, 100);
        }, true);
    }

    addMobileMenuToggle() {
        // Check if we're on a page with sidebar
        const hasSidebar = document.querySelector('.sidebar') || document.querySelector('.shop-sidebar');
        if (!hasSidebar) return;
        
        // Remove existing toggle if any
        const existingToggle = document.querySelector('.mobile-menu-toggle');
        if (existingToggle) existingToggle.remove();
        
        // Create mobile menu toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'mobile-menu-toggle';
        toggleBtn.innerHTML = '<i class="fas fa-bars"></i>';
        toggleBtn.title = 'Menu';
        toggleBtn.setAttribute('aria-label', 'Toggle menu');
        
        // Style the button
        toggleBtn.style.cssText = `
            position: fixed;
            top: 15px;
            left: 15px;
            z-index: 1001;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            font-size: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        `;
        
        // Add click handler
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMobileMenu();
        });
        
        document.body.appendChild(toggleBtn);
    }

    toggleMobileMenu() {
        const sidebar = document.querySelector('.sidebar') || document.querySelector('.shop-sidebar');
        if (!sidebar) return;
        
        const isActive = sidebar.classList.contains('active');
        
        if (isActive) {
            sidebar.classList.remove('active');
            this.removeMobileOverlay();
        } else {
            sidebar.classList.add('active');
            this.addMobileOverlay();
        }
    }

    addMobileOverlay() {
        // Remove existing overlay
        this.removeMobileOverlay();
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'mobile-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 999;
            display: block;
        `;
        
        // Close sidebar when overlay is clicked
        overlay.addEventListener('click', () => {
            this.toggleMobileMenu();
        });
        
        document.body.appendChild(overlay);
    }

    removeMobileOverlay() {
        const overlay = document.querySelector('.mobile-overlay');
        if (overlay) overlay.remove();
    }

    makeTouchFriendly() {
        // Add touch-friendly class to interactive elements
        const touchElements = document.querySelectorAll('button, .btn, a, input[type="submit"], input[type="button"]');
        touchElements.forEach(el => {
            if (!el.classList.contains('touch-friendly')) {
                el.classList.add('touch-friendly');
                el.style.minHeight = '44px';
                el.style.minWidth = '44px';
            }
        });
        
        // Increase form field sizes
        const formFields = document.querySelectorAll('input, select, textarea');
        formFields.forEach(field => {
            field.style.padding = '12px';
            field.style.fontSize = '16px';
        });
    }

    setupMobileStorage() {
        // Use sessionStorage for sensitive data on mobile
        const migrateToSessionStorage = () => {
            const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
            const user = localStorage.getItem(STORAGE_KEYS.USER);
            
            if (token && !sessionStorage.getItem(STORAGE_KEYS.TOKEN)) {
                sessionStorage.setItem(STORAGE_KEYS.TOKEN, token);
            }
            if (user && !sessionStorage.getItem(STORAGE_KEYS.USER)) {
                sessionStorage.setItem(STORAGE_KEYS.USER, user);
            }
        };
        
        migrateToSessionStorage();
    }

    // Mobile alert/notification
    showMobileAlert(message, type = 'info', duration = 3000) {
        // Remove existing alert
        const existingAlert = document.querySelector('.mobile-alert');
        if (existingAlert) existingAlert.remove();
        
        // Create alert
        const alert = document.createElement('div');
        alert.className = `mobile-alert mobile-alert-${type}`;
        alert.textContent = message;
        
        // Style alert
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 9999;
            max-width: 90%;
            text-align: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-weight: 500;
        `;
        
        document.body.appendChild(alert);
        
        // Auto-remove
        setTimeout(() => {
            alert.style.opacity = '0';
            alert.style.transition = 'opacity 0.3s';
            setTimeout(() => alert.remove(), 300);
        }, duration);
        
        return alert;
    }

    // Check if device is offline
    checkConnection() {
        if (!navigator.onLine) {
            this.showMobileAlert('No internet connection', 'error', 5000);
            return false;
        }
        return true;
    }

    // Mobile back button handler
    setupBackButton() {
        if (window.history.length > 1) {
            const backBtn = document.createElement('button');
            backBtn.className = 'mobile-back-btn';
            backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Back';
            backBtn.style.cssText = `
                position: fixed;
                top: 15px;
                left: 70px;
                z-index: 1001;
                background: white;
                color: #2563eb;
                border: 2px solid #2563eb;
                border-radius: 25px;
                padding: 8px 16px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            `;
            
            backBtn.addEventListener('click', () => {
                window.history.back();
            });
            
            document.body.appendChild(backBtn);
        }
    }
}

// Create and export singleton instance
const mobileHelper = new MobileAuthHelper();

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    mobileHelper.setupMobileFeatures();
    
    // Add mobile back button to non-login pages
    if (!window.location.pathname.includes('login.html') && 
        !window.location.pathname.includes('index.html')) {
        mobileHelper.setupBackButton();
    }
    
    // Network status monitoring
    window.addEventListener('online', () => {
        mobileHelper.showMobileAlert('Back online', 'success');
    });
    
    window.addEventListener('offline', () => {
        mobileHelper.showMobileAlert('No internet connection', 'error', 0);
    });
});

export { mobileHelper };