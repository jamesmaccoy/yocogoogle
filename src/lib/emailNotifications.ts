// Email notification service for estimate requests using Resend SMTP
import { transporter } from './transporter'

export interface EstimateRequestNotification {
  hostEmail: string
  hostName: string
  customerName: string
  customerEmail: string
  propertyTitle: string
  fromDate: string
  toDate: string
  estimateRequestId: string
}

export async function sendEstimateRequestNotification(data: EstimateRequestNotification): Promise<void> {
  try {
    console.log('📧 Sending estimate request notification via Resend SMTP')
    console.log('=====================================')
    console.log(`Host: ${data.hostName} (${data.hostEmail})`)
    console.log(`Customer: ${data.customerName} (${data.customerEmail})`)
    console.log(`Property: ${data.propertyTitle}`)
    console.log(`Dates: ${data.fromDate} to ${data.toDate}`)
    console.log(`Estimate Request ID: ${data.estimateRequestId}`)
    console.log('=====================================')
    
    // Send email using the configured Resend SMTP transporter
    await transporter.sendMail({
      from: process.env.EMAIL_FROM_ADDRESS || 'noreply@betaplek.com',
      to: data.hostEmail,
      subject: `New Estimate Request for ${data.propertyTitle}`,
      html: generateEstimateRequestEmailHTML(data),
      // Optional: Add text version for better email client compatibility
      text: generateEstimateRequestEmailText(data)
    })
    
    console.log('✅ Estimate request notification sent successfully')
    
  } catch (error) {
    console.error('❌ Failed to send estimate request notification:', error)
    throw error
  }
}

function generateEstimateRequestEmailHTML(data: EstimateRequestNotification): string {
  const fromDate = new Date(data.fromDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  
  const toDate = new Date(data.toDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Estimate Request - ${data.propertyTitle}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f8f9fa;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">New Estimate Created</h1>
          <p style="color: #e8f4f8; margin: 10px 0 0 0; font-size: 16px;">A customer has requested a new estimate for different dates</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 30px 20px;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hello ${data.hostName},</p>
          
          <p style="font-size: 16px; margin-bottom: 25px;">A customer has requested a new estimate for your property for different dates. A new estimate has been created with all available packages. Here are the details:</p>
          
          <!-- Property Details Card -->
          <div style="background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 12px; padding: 25px; margin: 25px 0;">
            <h3 style="margin: 0 0 20px 0; color: #495057; font-size: 20px; font-weight: 600;">Property Details</h3>
            
            <div style="margin-bottom: 15px;">
              <strong style="color: #495057; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Property</strong>
              <p style="margin: 5px 0 0 0; font-size: 18px; color: #2c3e50; font-weight: 500;">${data.propertyTitle}</p>
            </div>
            
            <div style="margin-bottom: 15px;">
              <strong style="color: #495057; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Requested Dates</strong>
              <p style="margin: 5px 0 0 0; font-size: 16px; color: #2c3e50;">${fromDate} to ${toDate}</p>
            </div>
            
            <div style="margin-bottom: 0;">
              <strong style="color: #495057; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Customer</strong>
              <p style="margin: 5px 0 0 0; font-size: 16px; color: #2c3e50;">${data.customerName}</p>
              <p style="margin: 2px 0 0 0; font-size: 14px; color: #6c757d;">${data.customerEmail}</p>
            </div>
          </div>
          
          <!-- Call to Action -->
          <div style="text-align: center; margin: 30px 0;">
            <p style="font-size: 16px; margin-bottom: 20px; color: #495057;">Please log into your admin panel to review the new estimate and configure package options for the customer.</p>
            <div style="background-color: #007bff; color: #ffffff; padding: 12px 24px; border-radius: 6px; display: inline-block; text-decoration: none; font-weight: 600; font-size: 16px;">
              View Estimate Request
            </div>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8f9fa; padding: 20px; border-top: 1px solid #e9ecef; text-align: center;">
          <p style="font-size: 14px; color: #6c757d; margin: 0;">
            This is an automated notification from your Betaplek booking system.
          </p>
          <p style="font-size: 12px; color: #adb5bd; margin: 10px 0 0 0;">
            Estimate Request ID: ${data.estimateRequestId}
          </p>
        </div>
      </div>
    </body>
    </html>
  `
}

function generateEstimateRequestEmailText(data: EstimateRequestNotification): string {
  const fromDate = new Date(data.fromDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  
  const toDate = new Date(data.toDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return `
NEW ESTIMATE CREATED

Hello ${data.hostName},

A customer has requested a new estimate for your property for different dates. A new estimate has been created with all available packages.

PROPERTY DETAILS:
- Property: ${data.propertyTitle}
- Requested Dates: ${fromDate} to ${toDate}
- Customer: ${data.customerName}
- Customer Email: ${data.customerEmail}

Please log into your admin panel to review the new estimate and configure package options for the customer.

This is an automated notification from your Betaplek booking system.
Estimate ID: ${data.estimateRequestId}
  `.trim()
}
