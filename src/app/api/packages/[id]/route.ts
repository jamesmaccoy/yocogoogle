import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await getPayload({ config: configPromise })
    const { id } = await params
    
    const packageDoc = await payload.findByID({
      collection: 'packages',
      id,
      depth: 2, // Increased depth to include related page data
    })
    
    return NextResponse.json(packageDoc)
  } catch (error) {
    console.error('Error fetching package:', error)
    return NextResponse.json(
      { error: 'Failed to fetch package' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await getPayload({ config: configPromise })
    
    // Try to get the user from the request
    let user = null
    try {
      const authResult = await payload.auth({ headers: request.headers })
      user = authResult.user
    } catch (authError) {
      console.log('Authentication failed, trying admin context:', authError)
      // If authentication fails, this might be an admin request
      // The admin interface handles authentication differently
    }
    
    // For admin requests, we might not have a user object, but the request is still valid
    // The admin interface has its own authentication mechanism
    
    const { id } = await params
    let body: any = {}
    const contentType = request.headers.get('content-type') || ''
    console.log('Content-Type:', contentType)
    console.log('Request URL:', request.url)
    console.log('Request method:', request.method)
    
    if (contentType.includes('application/json')) {
      try {
        // Clone the request to read the body
        const clonedRequest = request.clone()
        const rawBody = await clonedRequest.text()
        console.log('Raw request body:', rawBody)
        
        body = await request.json()
        console.log('Successfully parsed JSON body')
      } catch (err) {
        console.warn('Could not parse JSON body:', err)
        body = {}
      }
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      // Handle form data requests
      try {
        const formData = await request.formData()
        body = {} as any
        
        // Convert FormData to regular object
        for (const [key, value] of formData.entries()) {
          if (key.includes('[') && key.includes(']')) {
            // Handle nested form fields like "meta[title]"
            const match = key.match(/^(\w+)\[(\w+)\]$/)
            if (match && match.length >= 3) {
              const parentKey = match[1]
              const childKey = match[2]
              if (parentKey && childKey) {
                if (!body[parentKey]) body[parentKey] = {}
                body[parentKey][childKey] = value
              }
            } else {
              body[key] = value
            }
          } else {
            body[key] = value
          }
        }
        console.log('Successfully parsed form data body')
      } catch (err) {
        console.warn('Could not parse form data body:', err)
        body = {}
      }
    } else {
      // Try to parse as JSON as fallback
      try {
        body = await request.json()
        console.log('Successfully parsed body as JSON fallback')
      } catch (err) {
        console.warn('Could not parse body as JSON fallback:', err)
        body = {}
      }
    }
    
    // Handle Payload admin interface format - data might be in _payload field or nested in data
    if (body._payload && typeof body._payload === 'string') {
      try {
        const payloadData = JSON.parse(body._payload)
        console.log('Successfully parsed _payload field')
        console.log('Payload data keys:', Object.keys(payloadData))
        body = { ...body, ...payloadData }
        delete body._payload // Remove the _payload field since we've extracted the data
        console.log('Body after _payload processing:', Object.keys(body))
      } catch (err) {
        console.warn('Could not parse _payload field:', err)
      }
    }
    
    // Handle nested data field (common in Payload admin requests)
    if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
      console.log('Found nested data field, merging with body')
      body = { ...body, ...body.data }
      delete body.data
    }
    
    // Check if this is a Payload admin request
    // Payload admin uses /admin/api/collections/packages/[id] which is handled by Payload internally
    // This route (/api/packages/[id]) is for frontend custom updates
    const isAdminRequest = request.url.includes('/admin/api/') || request.headers.get('referer')?.includes('/admin')
    
    console.log('PATCH request for package:', { id, body, user: user?.id ? '[REDACTED]' : 'admin', isAdminRequest, url: request.url })
    console.log('Request body keys:', Object.keys(body))
    console.log('Request body values:', Object.entries(body).map(([key, value]) => `${key}: ${typeof value} = ${JSON.stringify(value)}`))
    console.log('Environment:', process.env.NODE_ENV)
    
    // If this is actually a Payload admin request, it should go through Payload's built-in handler
    // But if it somehow reaches here, be very permissive
    
    // Validate the package exists first
    let existingPackage
    try {
      existingPackage = await payload.findByID({
        collection: 'packages',
        id,
      })
      console.log('Existing package found:', { 
        id: existingPackage.id, 
        name: existingPackage.name,
        currentMultiplier: existingPackage.multiplier,
        currentCategory: existingPackage.category 
      })
    } catch (error) {
      console.error('Package not found:', error)
      return NextResponse.json(
        { error: 'Package not found' },
        { status: 404 }
      )
    }
    
    // Validate the request body
    const cleanData: any = {}
    
    try {
    
    // Handle isEnabled field
    if (body.isEnabled !== undefined) {
      cleanData.isEnabled = Boolean(body.isEnabled)
      console.log('Setting isEnabled to:', cleanData.isEnabled)
    }
    
    // Handle name field
    if (body.name !== undefined) {
      cleanData.name = String(body.name || '').trim()
      if (!cleanData.name) {
        return NextResponse.json(
          { error: 'Package name cannot be empty' },
          { status: 400 }
        )
      }
      console.log('Setting name to:', cleanData.name)
    }
    
    // Handle description field
    if (body.description !== undefined) {
      cleanData.description = body.description ? String(body.description).trim() : null
      console.log('Setting description to:', cleanData.description)
    }
    
    // Handle multiplier field
    if (body.multiplier !== undefined) {
      const multiplier = Number(body.multiplier)
      if (isNaN(multiplier) || multiplier < 0.1 || multiplier > 3.0) {
        return NextResponse.json(
          { error: 'Multiplier must be between 0.1 and 3.0' },
          { status: 400 }
        )
      }
      cleanData.multiplier = multiplier
      console.log('Setting multiplier to:', cleanData.multiplier)
    }
    
    // Handle other fields
    if (body.post !== undefined) {
      cleanData.post = body.post
      console.log('Setting post to:', cleanData.post)
    }
    
    if (body.category !== undefined) {
      cleanData.category = body.category
      console.log('Setting category to:', cleanData.category)
    }
    
    if (body.entitlement !== undefined) {
      cleanData.entitlement = body.entitlement
      console.log('Setting entitlement to:', cleanData.entitlement)
    }
    
    if (body.minNights !== undefined) {
      const minNights = Number(body.minNights)
      if (isNaN(minNights) || minNights < 1) {
        return NextResponse.json(
          { error: 'Min nights must be at least 1' },
          { status: 400 }
        )
      }
      cleanData.minNights = minNights
      console.log('Setting minNights to:', cleanData.minNights)
    }
    
    if (body.maxNights !== undefined) {
      const maxNights = Number(body.maxNights)
      if (isNaN(maxNights) || maxNights < 1) {
        return NextResponse.json(
          { error: 'Max nights must be at least 1' },
          { status: 400 }
        )
      }
      cleanData.maxNights = maxNights
      console.log('Setting maxNights to:', cleanData.maxNights)
    }
    
    if (body.revenueCatId !== undefined) {
      cleanData.revenueCatId = body.revenueCatId ? String(body.revenueCatId).trim() : null
      console.log('Setting revenueCatId to:', cleanData.revenueCatId)
    }
    
    if (body.yocoId !== undefined) {
      cleanData.yocoId = body.yocoId ? String(body.yocoId).trim() : null
      console.log('Setting yocoId to:', cleanData.yocoId)
    }
    
    if (body.relatedPage !== undefined) {
      cleanData.relatedPage = body.relatedPage ? String(body.relatedPage).trim() : null
      console.log('Setting relatedPage to:', cleanData.relatedPage)
    }
    
    if (body.baseRate !== undefined) {
      if (body.baseRate === null || body.baseRate === '') {
        cleanData.baseRate = null
      } else {
        const baseRate = Number(body.baseRate)
        if (isNaN(baseRate) || baseRate < 0) {
          return NextResponse.json(
            { error: 'Base rate must be a positive number' },
            { status: 400 }
          )
        }
        cleanData.baseRate = baseRate
      }
      console.log('Setting baseRate to:', cleanData.baseRate)
    }
    
    // Handle features field
    if (body.features !== undefined) {
      if (Array.isArray(body.features)) {
        cleanData.features = body.features
          .filter((feature: any) => feature && (typeof feature === 'string' || (typeof feature === 'object' && feature.feature)))
          .map((feature: any) => {
            if (typeof feature === 'string') {
              return { feature: feature.trim() }
            } else if (typeof feature === 'object' && feature.feature) {
              return { feature: String(feature.feature).trim() }
            }
            return null
          })
          .filter(Boolean)
      } else {
        cleanData.features = []
      }
      console.log('Setting features to:', cleanData.features)
    }
    
    // Handle maxConcurrentBookings field
    if (body.maxConcurrentBookings !== undefined) {
      const maxConcurrentBookings = Number(body.maxConcurrentBookings)
      if (isNaN(maxConcurrentBookings) || maxConcurrentBookings < 1) {
        return NextResponse.json(
          { error: 'Max concurrent bookings must be at least 1' },
          { status: 400 }
        )
      }
      cleanData.maxConcurrentBookings = maxConcurrentBookings
      console.log('Setting maxConcurrentBookings to:', cleanData.maxConcurrentBookings)
    }

    // For admin requests or if we have fields that weren't processed, be more permissive
    // Include all valid package fields from body that weren't already processed
    const validPackageFields = ['post', 'name', 'description', 'multiplier', 'features', 'category', 'entitlement', 'minNights', 'maxNights', 'revenueCatId', 'yocoId', 'relatedPage', 'isEnabled', 'baseRate', 'maxConcurrentBookings', 'slug', 'slugLock']
    for (const key of Object.keys(body)) {
      if (validPackageFields.includes(key) && body[key] !== undefined && !cleanData.hasOwnProperty(key)) {
        cleanData[key] = body[key]
        console.log(`Including unprocessed field ${key} from body`)
      }
    }
    
    console.log('Clean data for update:', cleanData)
    console.log('Number of fields to update:', Object.keys(cleanData).length)
    console.log('Fields that were processed:', Object.keys(cleanData))
    console.log('Received fields:', Object.keys(body))
    
    if (Object.keys(cleanData).length === 0) {
      console.warn('No valid fields to update')
      console.warn('Request body was:', JSON.stringify(body))
      console.warn('This might be a Payload admin request that should use /admin/api/collections/packages/[id]')
      // Don't fail for admin requests - let Payload handle it
      if (!isAdminRequest) {
        return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
      }
    }
    
    } catch (validationError) {
      console.error('Error during validation:', validationError)
      return NextResponse.json(
        { error: 'Validation error', details: validationError instanceof Error ? validationError.message : 'Unknown validation error' },
        { status: 400 }
      )
    }
    
    // For admin requests, we might not have a user object
    const updateOptions: any = {
      collection: 'packages',
      id,
      data: cleanData,
      depth: 0, // Don't populate relationships on update to avoid issues
    }
    
    if (user) {
      updateOptions.user = user
    }
    
    console.log('Calling payload.update with options:', {
      collection: updateOptions.collection,
      id: updateOptions.id,
      dataKeys: Object.keys(updateOptions.data),
      data: updateOptions.data,
      hasUser: !!updateOptions.user
    })
    
    try {
      const packageDoc = await payload.update(updateOptions)
      
      console.log('Package updated successfully with ID:', id)
      console.log('Update operation completed at:', new Date().toISOString())
      console.log('Updated package name:', packageDoc.name)
      console.log('Updated package fields:', Object.keys(packageDoc).filter(key => cleanData.hasOwnProperty(key)))
      
      // Verify the update by refetching the document with full depth
      const verifyDoc = await payload.findByID({
        collection: 'packages',
        id,
        depth: 2,
      })
      
      console.log('Verification fetch shows package exists with name:', verifyDoc.name)
      console.log('Verification - updated fields match:', 
        Object.keys(cleanData).every(key => {
          const updated = JSON.stringify(verifyDoc[key])
          const expected = JSON.stringify(cleanData[key])
          const matches = updated === expected
          if (!matches) {
            console.warn(`Field ${key} mismatch: expected ${expected}, got ${updated}`)
          }
          return matches
        })
      )
      
      return NextResponse.json(verifyDoc)
    } catch (updateError) {
      console.error('Error during payload.update:', updateError)
      console.error('Update error details:', updateError instanceof Error ? updateError.message : 'Unknown error')
      console.error('Update error stack:', updateError instanceof Error ? updateError.stack : 'No stack trace')
      throw updateError // Re-throw to be caught by outer catch
    }
  } catch (error) {
    console.error('Error updating package:', error)
    return NextResponse.json(
      { error: 'Failed to update package', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await getPayload({ config: configPromise })
    
    // Try to get the user from the request
    let user = null
    try {
      const authResult = await payload.auth({ headers: request.headers })
      user = authResult.user
    } catch (authError) {
      console.log('Authentication failed, trying admin context:', authError)
      // If authentication fails, this might be an admin request
    }
    
    const { id } = await params
    
    // For admin requests, we might not have a user object
    const deleteOptions: any = {
      collection: 'packages',
      id,
    }
    
    if (user) {
      deleteOptions.user = user
    }
    
    const deletedPackage = await payload.delete(deleteOptions)
    
    return NextResponse.json(deletedPackage)
  } catch (error) {
    console.error('Error deleting package:', error)
    return NextResponse.json(
      { error: 'Failed to delete package' },
      { status: 500 }
    )
  }
} 