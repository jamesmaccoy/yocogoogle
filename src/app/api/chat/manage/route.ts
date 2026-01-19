import { streamText, tool, convertToModelMessages, UIMessage, stepCountIs } from 'ai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'
import { getMeUser } from '@/utilities/getMeUser'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'
import { z } from 'zod'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function POST(request: NextRequest) {
  try {
    const { messages, pageData }: { messages: UIMessage[]; pageData?: any } = await request.json()
    const { user } = await getMeUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = (user as any).role
    const roleArray = Array.isArray(userRole) ? userRole : userRole ? [userRole] : []
    const isHostOrAdmin = roleArray.includes('host') || roleArray.includes('admin')

    if (!isHostOrAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const payload = await getPayload({ config: configPromise })
    const posts = pageData?.posts || []
    const postId = pageData?.postId || (posts.length > 0 ? posts[0].id : null)

    // Fetch post details for better context
    let postDetails: any = null
    if (postId) {
      try {
        postDetails = await payload.findByID({
          collection: 'posts',
          id: postId,
          depth: 1,
        })
      } catch (e) {
        console.warn('Could not fetch post details:', e)
      }
    }

    // Fetch existing packages for context
    const existingPackages = await payload.find({
      collection: 'packages',
      where: {
        post: {
          in: posts.map((p: any) => p.id),
        },
      },
      depth: 1,
      limit: 100,
    })

    // Helper function to guess missing package values
    const guessPackageDefaults = (category: string, userInput: any) => {
      const defaults: any = {
        addon: {
          baseRate: 30000, // R300
          minNights: 1,
          maxNights: 1,
          multiplier: 1,
          features: ['Professional service', 'One-time fee', 'Quick setup', 'Quality guaranteed'],
        },
        standard: {
          baseRate: 20000, // R200
          minNights: 2,
          maxNights: 7,
          multiplier: 1,
          features: ['Comfortable accommodation', 'Essential amenities', 'Flexible check-in', 'Free WiFi', 'Self-service'],
        },
        hosted: {
          baseRate: 45000, // R450
          minNights: 3,
          maxNights: 14,
          multiplier: 1.2,
          features: ['Concierge service', 'Premium amenities', 'Personalized experience', '24/7 support', 'Luxury touches'],
        },
        special: {
          baseRate: 35000, // R350
          minNights: 1,
          maxNights: 7,
          multiplier: 0.9,
          features: ['Special offer', 'Limited availability', 'Unique experience', 'Best value', 'Exclusive deal'],
        },
      }

      const categoryDefaults = defaults[category as keyof typeof defaults] || defaults.standard
      
      // Use user input if provided, otherwise use defaults
      return {
        baseRate: userInput.baseRate || categoryDefaults.baseRate,
        minNights: userInput.minNights || categoryDefaults.minNights,
        maxNights: userInput.maxNights || categoryDefaults.maxNights,
        multiplier: userInput.multiplier || categoryDefaults.multiplier,
        features: userInput.features && userInput.features.length > 0 
          ? userInput.features 
          : categoryDefaults.features,
      }
    }

    // Create a tool for previewing package creation
    // @ts-ignore - AI SDK tool type inference issue
    const previewPackageTool = tool({
      description: 'Preview a package before creating it. Shows a mock package card with all details filled in based on the user\'s request. ALWAYS guess missing values (baseRate, features, nights, etc.) so the preview is complete. Use this when the user wants to create a new package.',
      parameters: z.object({
        name: z.string().optional().describe('Package display name (include emoji if appropriate). If not provided, generate based on category and description.'),
        description: z.string().optional().describe('Detailed description of what the package offers. If not provided, generate based on category.'),
        category: z.enum(['standard', 'hosted', 'addon', 'special']).optional().describe('Package category. If not specified, infer from description or default to "standard".'),
        entitlement: z.enum(['standard', 'pro']).default('standard').describe('Required customer entitlement level'),
        minNights: z.number().int().min(1).optional().describe('Minimum number of nights. If not provided, will be guessed based on category.'),
        maxNights: z.number().int().min(1).optional().describe('Maximum number of nights. If not provided, will be guessed based on category.'),
        baseRate: z.number().int().min(0).optional().describe('Base rate in cents (ZAR). If not provided, will be guessed based on category (addon: R300, standard: R200, hosted: R450, special: R350).'),
        multiplier: z.number().min(0.1).max(3.0).optional().describe('Price multiplier. If not provided, will be guessed (addon/standard: 1.0, hosted: 1.2, special: 0.9).'),
        features: z.array(z.string()).optional().describe('Array of key features/amenities. If not provided, will generate 4-5 relevant features based on category.'),
        postId: z.string().optional().describe('The property (post) ID this package belongs to. If not provided, use the first available property.'),
        revenueCatId: z.string().optional().describe('RevenueCat product ID if known'),
      }),
      // @ts-expect-error - AI SDK type inference issue
      execute: async (input: any) => {
        // Determine category if not provided
        const category = input.category || (() => {
          const desc = (input.description || '').toLowerCase()
          if (desc.includes('addon') || desc.includes('cleaning') || desc.includes('wine') || desc.includes('service')) return 'addon'
          if (desc.includes('hosted') || desc.includes('concierge') || desc.includes('luxury')) return 'hosted'
          if (desc.includes('special') || desc.includes('promo') || desc.includes('deal')) return 'special'
          return 'standard'
        })()

        // Get defaults for the category
        const defaults = guessPackageDefaults(category, input)

        // Generate name if not provided
        const name = input.name || (() => {
          const emojis: Record<string, string> = {
            addon: '🧹',
            standard: '🏠',
            hosted: '✨',
            special: '🎁',
          }
          const categoryNames: Record<string, string> = {
            addon: 'Add-on Service',
            standard: 'Standard Package',
            hosted: 'Hosted Experience',
            special: 'Special Offer',
          }
          return `${emojis[category] || '📦'} ${categoryNames[category] || 'Package'}`
        })()

        // Generate description if not provided
        const description = input.description || (() => {
          const descs: Record<string, string> = {
            addon: 'Professional add-on service to enhance your stay experience.',
            standard: 'Comfortable accommodation with essential amenities for a pleasant stay.',
            hosted: 'Premium hosted experience with concierge services and personalized attention.',
            special: 'Special promotional package offering great value and unique experiences.',
          }
          return descs[category] || 'A great package option for your stay.'
        })()

        // Use provided postId or default to first available
        const finalPostId = input.postId || postId || (posts.length > 0 ? posts[0].id : '')

        // Return preview data with ALL values filled in
        return {
          name,
          description,
          category,
          entitlement: input.entitlement || 'standard',
          minNights: input.minNights || defaults.minNights,
          maxNights: input.maxNights || defaults.maxNights,
          baseRate: input.baseRate || defaults.baseRate,
          multiplier: input.multiplier || defaults.multiplier,
          features: input.features && input.features.length > 0 ? input.features : defaults.features,
          postId: finalPostId,
          revenueCatId: input.revenueCatId || undefined,
          isPreview: true,
        }
      },
    })

    // Create a tool for actually creating the package
    // @ts-ignore - AI SDK tool type inference issue
    const createPackageTool = tool({
      description: 'Create a package after the user has confirmed the preview. Only use this after previewPackageTool has been called and user confirmed. IMPORTANT: Always use this tool when the user confirms they want to create the package.',
      parameters: z.object({
        name: z.string().describe('Package name'),
        description: z.string().describe('Package description'),
        category: z.enum(['standard', 'hosted', 'addon', 'special']).describe('Package category'),
        entitlement: z.enum(['standard', 'pro']).default('standard').describe('Required customer entitlement'),
        minNights: z.number().min(0.5).describe('Minimum nights (can be 0.5 for half-day packages)'),
        maxNights: z.number().min(0.5).describe('Maximum nights'),
        baseRate: z.number().int().min(0).optional().describe('Base rate in cents (ZAR)'),
        multiplier: z.number().min(0.1).max(3.0).default(1).describe('Price multiplier'),
        features: z.array(z.string()).default([]).describe('Array of feature strings'),
        postId: z.string().describe('The property (post) ID this package belongs to'),
        revenueCatId: z.string().optional().describe('Legacy RevenueCat product ID (deprecated, use yocoId instead)'),
        yocoId: z.string().optional().describe('Yoco product ID for payment processing (recommended)'),
      }),
      // @ts-expect-error - AI SDK type inference issue
      execute: async (input: any) => {
        const { name, description, category, entitlement, minNights, maxNights, baseRate, multiplier, features, postId, revenueCatId, yocoId } = input
        try {
          console.log('Creating package with data:', {
            post: postId,
            name,
            description,
            category,
            entitlement,
            minNights,
            maxNights,
            baseRate,
            multiplier,
            features,
            revenueCatId,
            yocoId,
          })

          // Validate postId exists
          if (!postId) {
            return {
              success: false,
              error: 'postId is required',
              message: 'Failed to create package: postId is required',
            }
          }

          const created = await payload.create({
            collection: 'packages',
            data: {
              post: postId,
              name,
              description: description || undefined,
              category: category || 'standard',
              entitlement: entitlement || 'standard',
              minNights: minNights || 1,
              maxNights: maxNights || 1,
              baseRate: baseRate && baseRate > 0 ? baseRate : undefined,
              multiplier: multiplier || 1,
              features: Array.isArray(features) ? features.map(f => ({ feature: f })) : [],
              revenueCatId: revenueCatId || undefined,
              yocoId: yocoId || undefined,
              isEnabled: true,
            },
            user,
          })

          console.log('Package created successfully:', created.id)

          return {
            success: true,
            package: {
              id: created.id,
              name: created.name,
              description: created.description,
              category: created.category,
              isEnabled: created.isEnabled,
              minNights: created.minNights,
              maxNights: created.maxNights,
              baseRate: created.baseRate,
              multiplier: created.multiplier,
              entitlement: created.entitlement,
              features: created.features,
            },
            message: `Package "${name}" has been created successfully!`,
          }
        } catch (error: any) {
          console.error('Error creating package:', error)
          return {
            success: false,
            error: error.message || 'Failed to create package',
            message: `Failed to create package: ${error.message || 'Unknown error'}`,
          }
        }
      },
    })

    // Tool for reading/finding packages
    // @ts-ignore - AI SDK tool type inference issue
    const findPackagesTool = tool({
      description: 'Find and list packages for a property. Use this when user asks to see, list, or view their packages.',
      parameters: z.object({
        postId: z.string().optional().describe('Property ID to filter packages. If not provided, shows all packages for user\'s properties.'),
        category: z.enum(['standard', 'hosted', 'addon', 'special']).optional().describe('Filter by category'),
        isEnabled: z.boolean().optional().describe('Filter by enabled status'),
      }),
      // @ts-expect-error - AI SDK type inference issue
      execute: async ({ postId, category, isEnabled }: any) => {
        try {
          const where: any = {}
          
          if (postId) {
            where.post = { equals: postId }
          } else if (posts.length > 0) {
            where.post = { in: posts.map((p: any) => p.id) }
          }
          
          if (category) {
            where.category = { equals: category }
          }
          
          if (isEnabled !== undefined) {
            where.isEnabled = { equals: isEnabled }
          }

          const result = await payload.find({
            collection: 'packages',
            where: Object.keys(where).length > 0 ? where : undefined,
            depth: 1,
            limit: 100,
          })

          return {
            success: true,
            packages: result.docs.map((pkg: any) => ({
              id: pkg.id,
              name: pkg.name,
              description: pkg.description,
              category: pkg.category,
              isEnabled: pkg.isEnabled,
              minNights: pkg.minNights,
              maxNights: pkg.maxNights,
              baseRate: pkg.baseRate,
              multiplier: pkg.multiplier,
              entitlement: pkg.entitlement,
              postTitle: typeof pkg.post === 'object' ? pkg.post.title : 'Unknown',
            })),
            count: result.docs.length,
            message: `Found ${result.docs.length} package(s)`,
          }
        } catch (error: any) {
          return {
            success: false,
            error: error.message || 'Failed to find packages',
            message: `Failed to find packages: ${error.message || 'Unknown error'}`,
          }
        }
      },
    })

    // Tool for updating packages
    // @ts-ignore - AI SDK tool type inference issue
    const updatePackageTool = tool({
      description: 'Update an existing package. Use this when user wants to modify package details like name, description, price, or settings.',
      parameters: z.object({
        packageId: z.string().describe('The ID of the package to update'),
        name: z.string().optional(),
        description: z.string().optional(),
        category: z.enum(['standard', 'hosted', 'addon', 'special']).optional(),
        entitlement: z.enum(['standard', 'pro']).optional(),
        minNights: z.number().int().min(1).optional(),
        maxNights: z.number().int().min(1).optional(),
        baseRate: z.number().int().min(0).optional(),
        multiplier: z.number().min(0.1).max(3.0).optional(),
        features: z.array(z.string()).optional(),
        isEnabled: z.boolean().optional(),
      }),
      // @ts-expect-error - AI SDK type inference issue
      execute: async (params: any) => {
        try {
          const { packageId, ...updates } = params
          // Remove undefined values
          const updateData: any = {}
          Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined) {
              if (key === 'features' && Array.isArray(value)) {
                updateData[key] = value.map(f => ({ feature: f }))
              } else {
                updateData[key] = value
              }
            }
          })

          const updated = await payload.update({
            collection: 'packages',
            id: packageId,
            data: updateData,
            user,
          })

          return {
            success: true,
            package: {
              id: updated.id,
              name: updated.name,
              description: updated.description,
              category: updated.category,
              isEnabled: updated.isEnabled,
            },
            message: `Package "${updated.name}" has been updated successfully!`,
          }
        } catch (error: any) {
          return {
            success: false,
            error: error.message || 'Failed to update package',
            message: `Failed to update package: ${error.message || 'Unknown error'}`,
          }
        }
      },
    })

    // Tool for deleting packages
    // @ts-ignore - AI SDK tool type inference issue
    const deletePackageTool = tool({
      description: 'Delete a package. Use this when user wants to remove a package permanently. Always confirm before deleting.',
      parameters: z.object({
        packageId: z.string().describe('The ID of the package to delete'),
      }),
      // @ts-expect-error - AI SDK type inference issue
      execute: async ({ packageId }: any) => {
        try {
          const deleted = await payload.delete({
            collection: 'packages',
            id: packageId,
            user,
          })

          return {
            success: true,
            message: `Package "${deleted.name || 'Unknown'}" has been deleted successfully!`,
          }
        } catch (error: any) {
          return {
            success: false,
            error: error.message || 'Failed to delete package',
            message: `Failed to delete package: ${error.message || 'Unknown error'}`,
          }
        }
      },
    })

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const systemPrompt = `You are an AI assistant helping a host manage their property packages.

HOST'S PROPERTIES:
${posts.map((post: any) => `- ${post.title} (ID: ${post.id}, Slug: ${post.slug})`).join('\n') || 'No properties yet'}

EXISTING PACKAGES:
${existingPackages.docs.map((pkg: any) => `- ${pkg.name} (${pkg.category}, ${pkg.minNights}-${pkg.maxNights} nights, ${pkg.isEnabled ? 'enabled' : 'disabled'})`).join('\n') || 'No packages yet'}

PACKAGE MANAGEMENT GUIDELINES:
1. Base rates are stored in cents (ZAR). For example, R150.00 = 15000 cents
2. Categories: standard (regular accommodation), hosted (with concierge/services), addon (one-time extras like cleaning/wine), special (promotional/unique)
3. Entitlements: standard (all customers), pro (premium customers only)
4. When user wants to create a package:
   - FIRST use previewPackageTool to show them a preview card with ALL guessed values filled in
   - The preview should show complete package details including guessed baseRate, features, nights, etc.
   - Wait for user confirmation
   - THEN use createPackageTool to actually create it
   - IMPORTANT: When user explicitly says "create", "confirm", "yes", or "create this package", you MUST call createPackageTool immediately with the exact values from the preview
5. Guess reasonable defaults if user doesn't specify:
   - For addon packages: baseRate 20000-50000 cents (R200-R500), minNights: 1, maxNights: 1, features: ["Professional service", "One-time fee", "Quick setup"]
   - For standard packages: baseRate 15000-30000 cents (R150-R300), minNights: 2, maxNights: 7, features: ["Comfortable accommodation", "Essential amenities", "Flexible check-in"]
   - For hosted packages: baseRate 30000-60000 cents (R300-R600), minNights: 3, maxNights: 14, features: ["Concierge service", "Premium amenities", "Personalized experience"]
   - For special packages: baseRate 25000-50000 cents (R250-R500), minNights: 1, maxNights: 7, features: ["Special offer", "Limited availability", "Unique experience"]
   - Always generate 3-5 relevant features based on category and package type
6. CRUD Operations:
   - CREATE: Use previewPackageTool first, then createPackageTool after confirmation
   - READ: Use findPackagesTool when user asks to see, list, or view packages
   - UPDATE: Use updatePackageTool to modify existing packages (name, price, settings, etc.)
   - DELETE: Use deletePackageTool to remove packages (always confirm first!)
7. Always format currency as R (Rands), not $
8. Be helpful and guide the host through decisions
9. When showing package previews, ensure ALL fields are filled with reasonable guesses so the user can see a complete package before confirming

When user asks to create a package, use previewPackageTool first to show them what it will look like with all guessed values filled in.`

    const result = streamText({
      model: model as any,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools: {
        previewPackage: previewPackageTool,
        createPackage: createPackageTool,
        findPackages: findPackagesTool,
        updatePackage: updatePackageTool,
        deletePackage: deletePackageTool,
      },
      // maxSteps: 5, // Removed - not supported in this version
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error('Error in manage chat:', error)
    return NextResponse.json(
      { error: 'Failed to process request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

