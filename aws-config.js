// AWS Configuration - PRODUCTION VALUES
const AWS_CONFIG = {
    // ✅ FROM YOUR SCREENSHOTS - EXACT VALUES
    COGNITO: {
        ADMIN_POOL_ID: 'us-east-1_k9QTaHIxz',
        ADMIN_CLIENT_ID: '6f3olmfvnmj0enbe69gfjfjgg5',
        SHOP_POOL_ID: 'us-east-1_ugFDOLZWV',
        SHOP_CLIENT_ID: '25kbff5jqmr5e5crun205r0frr',
        REGION: 'us-east-1'
    },
    
    // ✅ FROM YOUR PROVIDED URLS - EXACT VALUES
    API_ENDPOINTS: {
        ADMIN_API: 'https://dnbeyd9uy7.execute-api.us-east-1.amazonaws.com/prod',
        SHOP_API: 'https://itkfalyn4k.execute-api.us-east-1.amazonaws.com/prod'
    },
    
    // ✅ FROM YOUR DYNAMODB SCREENSHOT - EXACT VALUES
    DYNAMODB_TABLES: {
        RAYMAKOSSA: 'RaymakossaShop',
        TARSO: 'TarsoShop',
        MARKET: 'MarketShop',
        REPORTS: 'InventoryReports'
    },
    
    // ✅ FROM YOUR LAMBDA SCREENSHOT - EXACT VALUES
    LAMBDA_FUNCTIONS: {
        ADMIN_AUTH: 'AdminAuth',
        ADMIN_PRODUCTS: 'AdminProducts',
        SHOP_AUTH: 'ShopAuth',
        SHOP_TRANSACTIONS: 'ShopTransactions',
        SHOP_ATTENDANCE: 'ShopAttendance',
        REPORT_GENERATOR: 'ReportGenerator'
    }
};

// S3 Bucket for static hosting
const S3_CONFIG = {
    BUCKET_NAME: 'marksinventory-frontend',
    REGION: 'us-east-1',
    CLOUDFRONT_URL: 'https://dxxxxxxxx.cloudfront.net'
};

export { AWS_CONFIG, S3_CONFIG };