// Email notification service for estimate requests using Resend SMTP
import { transporter } from './transporter'

type BookingConfirmationEmailInput = {
  recipientEmail: string
  recipientName?: string
  propertyTitle: string
  fromDate: string
  toDate: string
  bookingId: string
  bookingUrl: string
}

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
      from: process.env.EMAIL_FROM_ADDRESS || 'noreply@simpleplek.co.za',
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

export async function sendBookingConfirmationEmail(
  data: BookingConfirmationEmailInput,
): Promise<void> {
  const startDate = new Date(data.fromDate)
  const endDate = new Date(data.toDate)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('Invalid booking dates supplied for confirmation email')
  }

  const summary = `Stay at ${data.propertyTitle}`
  const htmlBody = generateBookingConfirmationHTML({ ...data, summary, startDate, endDate })
  const textBody = generateBookingConfirmationText({ ...data, summary, startDate, endDate })
  const icsContent = buildBookingICS({
    summary,
    description: `Stay at ${data.propertyTitle}`,
    startDate,
    endDate,
    bookingId: data.bookingId,
    bookingUrl: data.bookingUrl,
  })

  await transporter.sendMail({
    from: process.env.EMAIL_FROM_ADDRESS || 'noreply@simpleplek.co.za',
    to: data.recipientEmail,
    subject: `Booking confirmed: ${data.propertyTitle}`,
    html: htmlBody,
    text: textBody,
    attachments: [
      {
        filename: `booking-${data.bookingId}.ics`,
        content: icsContent,
        contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
      },
    ],
  })
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

type BookingConfirmationTemplateInput = BookingConfirmationEmailInput & {
  summary: string
  startDate: Date
  endDate: Date
}

function formatDisplayRange(startDate: Date, endDate: Date) {
  return {
    start: startDate.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    end: endDate.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  }
}

function generateBookingConfirmationHTML(data: BookingConfirmationTemplateInput): string {
  const { start, end } = formatDisplayRange(data.startDate, data.endDate)
  const greeting = data.recipientName ? `Hello ${data.recipientName},` : 'Hello,'

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(data.summary)}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa; margin: 0; padding: 0;">
        <div style="max-width: 640px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08); border-radius: 18px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #1d4ed8 0%, #312e81 100%); padding: 32px 28px;">
            <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff;">Your stay is confirmed!</h1>
            <p style="margin: 12px 0 0 0; color: rgba(255, 255, 255, 0.85); font-size: 16px;">
              We’ve attached a calendar invite so you never miss the dates.
            </p>
          </div>
          <div style="padding: 32px 28px;">
            <p style="font-size: 16px; color: #1f2937; line-height: 1.7;">${greeting}</p>
            <p style="font-size: 16px; color: #1f2937; line-height: 1.7;">
              Your booking for <strong>${escapeHtml(data.propertyTitle)}</strong> is officially confirmed.
              We’ve included a calendar invite with all the details for quick reference.
            </p>
            <div style="margin: 28px 0; padding: 24px; background-color: #f3f4f6; border-radius: 16px; border: 1px solid #e5e7eb;">
              <h2 style="margin: 0 0 18px 0; color: #111827; font-size: 20px; font-weight: 600;">Booking summary</h2>
              <p style="margin: 0 0 12px 0; color: #1f2937; font-size: 16px;"><strong>Dates:</strong> ${escapeHtml(
                `${start} to ${end}`,
              )}</p>
              <p style="margin: 0 0 12px 0; color: #1f2937; font-size: 16px;"><strong>Property:</strong> ${escapeHtml(
                data.propertyTitle,
              )}</p>
              <p style="margin: 0; color: #1f2937; font-size: 16px;"><strong>Booking ID:</strong> ${escapeHtml(
                data.bookingId,
              )}</p>
            </div>
            <div style="text-align: center; margin-top: 32px;">
              <a href="${escapeHtml(
                data.bookingUrl,
              )}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 30px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 16px;">
                View booking details
              </a>
            </div>
            <p style="margin-top: 32px; font-size: 14px; color: #6b7280;">
              Add the attached calendar invite to keep everything in sync. We can’t wait to host you!
            </p>
          </div>
          <div style="padding: 20px 28px; background-color: #111827;">
            <p style="margin: 0; color: rgba(255, 255, 255, 0.7); font-size: 13px;">
              This email was sent by Simple Plek. You’re receiving it because you have a confirmed booking.
            </p>
          </div>
        </div>
      </body>
    </html>
  `
}

function generateBookingConfirmationText(data: BookingConfirmationTemplateInput): string {
  const { start, end } = formatDisplayRange(data.startDate, data.endDate)
  const greeting = data.recipientName ? `Hello ${data.recipientName},` : 'Hello,'

  return [
    'Your stay is confirmed!',
    '',
    greeting,
    '',
    `Your booking for ${data.propertyTitle} is officially confirmed.`,
    'We have attached a calendar invite with all the details for quick reference.',
    '',
    'Booking summary:',
    `- Dates: ${start} to ${end}`,
    `- Property: ${data.propertyTitle}`,
    `- Booking ID: ${data.bookingId}`,
    '',
    `View booking details: ${data.bookingUrl}`,
    '',
    'Add the calendar invite to your calendar so you never miss check-in.',
    'We can’t wait to host you!',
  ].join('\n')
}

function buildBookingICS({
  summary,
  description,
  startDate,
  endDate,
  bookingId,
  bookingUrl,
}: {
  summary: string
  description: string
  startDate: Date
  endDate: Date
  bookingId: string
  bookingUrl: string
}) {
  const formatDate = (date: Date) =>
    date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

  const dtStamp = formatDate(new Date())
  const dtStart = formatDate(startDate)
  const dtEnd = formatDate(endDate)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Simple Plek//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeICSText(`booking-${bookingId}@simpleplek.co.za`)}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICSText(summary)}`,
    `DESCRIPTION:${escapeICSText(`${description}\\nBooking ID: ${bookingId}\\n${bookingUrl}`)}`,
    `URL:${escapeICSText(bookingUrl)}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return `${lines.join('\r\n')}\r\n`
}

function escapeICSText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
