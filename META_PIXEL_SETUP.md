# Meta Pixel Setup & Troubleshooting Guide

## Current Configuration

Your Meta Pixel ID: `2659582847593179`

## Issues Identified

### 1. Meta Pixel Not Sending Events
**Problem**: Pixel is not firing events to Meta.

**Solutions**:
- ✅ Pixel ID is now hardcoded as fallback: `2659582847593179`
- Set `NEXT_PUBLIC_META_PIXEL_ID=2659582847593179` in your `.env` file
- Verify pixel is loading by checking browser console for "Meta Pixel initialized" message
- Install [Facebook Pixel Helper](https://chrome.google.com/webstore/detail/facebook-pixel-helper/fdgfkebogiimcoedlicjlajpkdmockpc) browser extension to test

### 2. Conversions API Not Sending Events
**Problem**: Server-side events are not being sent.

**Solutions**:
1. **Get your Meta Access Token**:
   - Go to [Meta Events Manager](https://business.facebook.com/events_manager2)
   - Select your Pixel (ID: 2659582847593179)
   - Go to **Settings** → **Conversions API**
   - Click **Generate Access Token** or use existing token
   - Copy the access token

2. **Add to Environment Variables**:
   ```env
   META_ACCESS_TOKEN=your_access_token_here
   ```

3. **Verify Setup**:
   - Visit `/api/meta-pixel/test` to check configuration
   - Check server logs for "Meta event sent successfully" messages
   - Events are tracked when:
     - Estimates are viewed (`/api/estimates/latest`)
     - Bookings are created (via hooks and booking confirmation page)

### 3. SSL/Connection Issues
**Problem**: "Your connection is not private" error on simpleplek.co.za

**This affects pixel loading** because:
- Browsers block insecure content on HTTPS pages
- Meta Pixel requires HTTPS to load properly
- Mixed content (HTTP/HTTPS) can prevent pixel from firing

**Solutions**:
1. **Fix SSL Certificate**:
   - Ensure your domain has a valid SSL certificate
   - Check certificate expiration date
   - Verify certificate is properly installed on your hosting provider

2. **DNS Configuration**:
   - The DNS screenshot shows CNAME records
   - Ensure `www.simpleplek.co.za` points to your hosting
   - Verify A records are correct for root domain

3. **Domain Verification**:
   - The error mentions "Custom domain setup has not been completed"
   - This might be related to Meta Business verification
   - Verify your domain in Meta Business Settings → Brand Safety → Domains

### 4. Event Match Quality (EMQ) Issues
**Problem**: No Event Match Quality score available

**Solutions**:
- EMQ requires both client-side pixel AND server-side Conversions API
- Ensure `META_ACCESS_TOKEN` is set
- Send user data (email, phone) when available - this improves matching
- Events need to include `client_ip_address` and `client_user_agent`

## Testing Your Setup

### 1. Test Pixel Configuration
Visit: `https://your-domain.com/api/meta-pixel/test`

This will show:
- Whether pixel ID is configured
- Whether access token is set
- Recommendations for fixing issues

### 2. Test Pixel in Browser
1. Install [Facebook Pixel Helper](https://chrome.google.com/webstore/detail/facebook-pixel-helper/fdgfkebogiimcoedlicjlajpkdmockpc)
2. Visit your website
3. Check if pixel fires PageView event
4. Look for any errors in the extension

### 3. Test Conversions API
1. Check server logs when:
   - Viewing an estimate (should see "Meta event sent successfully: EstimateView")
   - Creating a booking (should see "Meta event sent successfully: Purchase")
2. Check Meta Events Manager → Test Events tab
3. Trigger test events and verify they appear

### 4. Verify Events in Meta
1. Go to [Meta Events Manager](https://business.facebook.com/events_manager2)
2. Select your Pixel
3. Go to **Test Events** tab
4. Visit your site and perform actions (view estimate, create booking)
5. Events should appear within a few seconds

## Environment Variables Required

Add these to your `.env` file:

```env
# Meta Pixel ID (client-side tracking)
NEXT_PUBLIC_META_PIXEL_ID=2659582847593179

# Meta Conversions API Access Token (server-side tracking)
META_ACCESS_TOKEN=your_access_token_here
```

## Common Issues & Fixes

### Pixel Not Loading
- **Check**: Browser console for errors
- **Fix**: Ensure SSL certificate is valid
- **Fix**: Check if ad blockers are blocking the pixel
- **Fix**: Verify pixel ID is correct

### Events Not Appearing in Meta
- **Check**: Server logs for "Meta event sent successfully"
- **Fix**: Ensure `META_ACCESS_TOKEN` is set
- **Fix**: Verify access token has correct permissions
- **Fix**: Check if events are being deduplicated (same event_id)

### Conversions API Errors
- **Check**: Server logs for "Meta Conversions API errors"
- **Common errors**:
  - Invalid access token → Regenerate token
  - Invalid pixel ID → Verify pixel ID matches
  - Missing required fields → Check event data structure

## Next Steps

1. ✅ Pixel ID is now hardcoded (will work immediately)
2. ⏳ Set `META_ACCESS_TOKEN` environment variable
3. ⏳ Fix SSL certificate for simpleplek.co.za
4. ⏳ Test pixel with Facebook Pixel Helper
5. ⏳ Verify events in Meta Events Manager

## Support Resources

- [Meta Pixel Documentation](https://developers.facebook.com/docs/meta-pixel)
- [Conversions API Documentation](https://developers.facebook.com/docs/marketing-api/conversions-api)
- [Meta Events Manager](https://business.facebook.com/events_manager2)
- [Facebook Pixel Helper](https://chrome.google.com/webstore/detail/facebook-pixel-helper/fdgfkebogiimcoedlicjlajpkdmockpc)

