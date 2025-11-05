# Enhanced Package Management System

## Overview

This system implements a **comprehensive SaaS pattern** for package management with RevenueCat integration, payment validation, and role-based access control. It's designed for multi-tenant applications where hosts can manage their service offerings with different pricing tiers.

## Architecture Pattern

This follows the **"Multi-tenant SaaS with Role-Based Access Control (RBAC) and Revenue Management"** pattern, similar to:

- **Airbnb** (hosts manage listings with different pricing tiers)
- **Uber** (drivers manage service offerings)
- **Shopify** (merchants manage products with different subscription tiers)
- **Stripe** (merchants manage payment products)
- **Calendly** (users manage booking types)

## Key Features

### 1. **Enhanced Security & Payment Validation**
- Payment validation before role promotion
- Subscription status tracking in user profiles
- Host verification with payment requirements
- RevenueCat integration for subscription management

### 2. **RevenueCat Integration**
- Automatic product sync from RevenueCat
- Real-time pricing from RevenueCat
- Subscription validation for host promotion
- Support for requested products:
  - `week_x2_customer`
  - `week_x3_customer`
  - `week_x4_customer`
  - `per_hour`
  - `per_hour_luxury`

### 3. **Enhanced User Experience**
- Visual indicators for RevenueCat products
- Better error handling and user feedback
- Sync functionality to import products
- Payment-required promotions with clear messaging

## API Endpoints

### Package Management
- `GET /api/packages` - List packages with filtering
- `POST /api/packages` - Create new package
- `DELETE /api/packages` - Bulk delete packages
- `GET /api/packages/[id]` - Get single package
- `PATCH /api/packages/[id]` - Update package
- `DELETE /api/packages/[id]` - Delete single package

### RevenueCat Integration
- `POST /api/packages/sync-revenuecat` - Sync packages from RevenueCat
- `GET /api/test-revenuecat` - Test RevenueCat integration

### User Management
- `POST /api/users/promote-host` - Promote user to host with payment validation

## Database Schema

### Users Collection
```typescript
{
  name: string (required)
  email: string (required, unique)
  role: 'guest' | 'customer' | 'host' | 'admin'
  subscriptionStatus: {
    status: 'none' | 'trial' | 'active' | 'past_due' | 'canceled'
    plan: 'free' | 'basic' | 'pro' | 'enterprise'
    expiresAt: Date
    revenueCatCustomerId: string
  }
  paymentValidation: {
    lastPaymentDate: Date
    paymentMethod: 'none' | 'credit_card' | 'paypal' | 'apple_pay'
    paymentStatus: 'pending' | 'completed' | 'failed' | 'refunded'
  }
  hostProfile: {
    isVerified: boolean
    verificationDate: Date
    hostRating: number
    totalBookings: number
    bio: string
    specialties: Array<{ specialty: string }>
  }
}
```

### Packages Collection
```typescript
{
  post: Relationship to Posts (required)
  name: string (required)
  description: string
  multiplier: number (required, 0.1-3.0)
  category: 'standard' | 'hosted' | 'addon' | 'special'
  minNights: number (required)
  maxNights: number (required)
  revenueCatId: string
  isEnabled: boolean
  baseRate: number
  features: Array<{ feature: string }>
}
```

## Usage Examples

### 1. Sync RevenueCat Products
```javascript
// Frontend
const response = await fetch('/api/packages/sync-revenuecat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ postId: 'your-post-id' })
});

const result = await response.json();
console.log(`Imported ${result.importedPackages.length} packages`);
```

### 2. Promote User to Host
```javascript
// Frontend
const response = await fetch('/api/users/promote-host', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    targetUserId: 'user-id',
    productId: 'pro_subscription_id'
  })
});

const result = await response.json();
if (result.message) {
  console.log('User promoted successfully');
}
```

### 3. Validate Subscription
```javascript
// Backend
const hasValidSubscription = await revenueCatService.validateSubscription(
  customerId,
  'pro_subscription_id'
);

if (hasValidSubscription) {
  // Allow access to premium features
}
```

## Environment Variables

```bash
# RevenueCat Configuration
NEXT_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY=your_revenuecat_public_key

# Server Configuration
NEXT_PUBLIC_SITE_URL=https://your-domain.com
NEXT_PUBLIC_SERVER_URL=https://your-domain.com
VERCEL_URL=your-vercel-url
```

## Security Features

### 1. **Role-Based Access Control**
- Only admins can create/delete users
- Users can only access their own data
- Hosts have additional permissions for package management

### 2. **Payment Validation**
- Subscription validation before host promotion
- Payment status tracking
- RevenueCat integration for real-time subscription checks

### 3. **Data Validation**
- Input sanitization and validation
- Type checking for all API endpoints
- Error handling with detailed messages

## Testing

### Test RevenueCat Integration
```bash
curl http://localhost:3000/api/test-revenuecat
```

### Test Package Sync
```bash
curl -X POST http://localhost:3000/api/packages/sync-revenuecat \
  -H "Content-Type: application/json" \
  -d '{"postId": "your-post-id"}'
```

## Deployment Considerations

1. **Environment Variables**: Ensure all RevenueCat and server URLs are properly configured
2. **Database Migration**: Run any necessary database migrations for new user fields
3. **RevenueCat Setup**: Configure RevenueCat products and webhooks
4. **Access Control**: Verify access control functions work correctly in production

## Future Enhancements

1. **Webhook Integration**: Real-time RevenueCat webhook handling
2. **Analytics Dashboard**: Package usage and revenue analytics
3. **Multi-currency Support**: International pricing support
4. **Advanced Host Features**: Host rating system, verification badges
5. **Automated Testing**: Comprehensive test suite for all endpoints

## Troubleshooting

### Common Issues

1. **RevenueCat Connection Failed**
   - Check API key configuration
   - Verify RevenueCat account status
   - Check network connectivity

2. **Package Sync Errors**
   - Verify post ID exists
   - Check user permissions
   - Review RevenueCat product configuration

3. **Role Promotion Failed**
   - Verify subscription status
   - Check payment validation
   - Review user permissions

### Debug Endpoints

- `/api/test-revenuecat` - Test RevenueCat integration
- Check server logs for detailed error messages
- Use browser developer tools for frontend debugging 