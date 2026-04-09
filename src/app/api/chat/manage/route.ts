import { streamText, tool, UIMessage } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { NextRequest, NextResponse } from 'next/server'
import { getMeUser } from '@/utilities/getMeUser'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'
import { z } from 'zod'

// Zod schemas to validate structured JSON that is streamed to the UI
const packagePreviewSchema = z.object({
  name: z.string(),
  description: z.string(),
  category: z.enum(['standard', 'hosted', 'addon', 'special']),
  entitlement: z.enum(['standard', 'pro']),
  minNights: z.number().int().min(1),
  maxNights: z.number().int().min(1),
  baseRate: z.number().int().min(0),
  multiplier: z.number().min(0.1).max(3.0),
  features: z.array(z.string()).min(1),
  postId: z.string().optional(),
  revenueCatId: z.string().optional(),
  yocoId: z.string().optional(),
  isPreview: z.literal(true),
})

const createdPackageSchema = z.object({
  success: z.literal(true),
  package: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    category: z.enum(['standard', 'hosted', 'addon', 'special']),
    isEnabled: z.boolean(),
    minNights: z.number(),
    maxNights: z.number(),
    baseRate: z.number().nullable().optional(),
    multiplier: z.number(),
    entitlement: z.enum(['standard', 'pro']),
    features: z.any(),
    postId: z.string().optional(),
  }),
  packageId: z.string(),
  message: z.string(),
  /** True when no listing was selected and a draft property was created first */
  createdNewPost: z.boolean().optional(),
  /** The property (post) the package is saved under */
  postId: z.string().optional(),
})

// Initialize Google provider with custom API key
const googleAI = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
})

/** Minimal Lexical root for draft posts (matches createPostTool in this file) */
function buildMinimalPostContent(text: string) {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text,
              format: 0,
              style: '',
              mode: 'normal',
              detail: 0,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json()
    const pageData = requestBody?.pageData
    const incomingMessages = Array.isArray(requestBody?.messages) ? requestBody.messages : []
    const messages: UIMessage[] = incomingMessages as UIMessage[]
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
    /** Listing explicitly selected in Manage UI (sidebar); do not fall back to first post */
    const selectedPostId =
      typeof pageData?.postId === 'string' && pageData.postId.trim() ? pageData.postId.trim() : null

    const existingPackageIdFromContext =
      typeof pageData?.existingPackageId === 'string' && pageData.existingPackageId.trim()
        ? pageData.existingPackageId.trim()
        : null

    // Fetch post details for better context (only when a listing is selected)
    let postDetails: any = null
    if (selectedPostId) {
      try {
        postDetails = await payload.findByID({
          collection: 'posts',
          id: selectedPostId,
          depth: 1,
        })
      } catch (e) {
        console.warn('Could not fetch post details:', e)
      }
    }

    // Fetch existing packages for context (skip invalid query when host has no posts yet)
    const existingPackages =
      posts.length > 0
        ? await payload.find({
            collection: 'packages',
            where: {
              post: {
                in: posts.map((p: any) => p.id),
              },
            },
            depth: 1,
            limit: 100,
          })
        : { docs: [] as any[] }

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
      description: '🚨 MANDATORY FIRST STEP: Preview a package before creating it. Shows a mock package card with all details filled in based on the user\'s request. ALWAYS guess missing values (baseRate, features, nights, etc.) so the preview is complete. CRITICAL: When user says "create", "make", "new package", mentions a price like "R300", or wants to create a package, you MUST call this tool IMMEDIATELY without ANY text response first. DO NOT ask questions. DO NOT explain. Just call this tool with intelligent guesses based on user input. If user provides ANY package details (name, price, description), extract them and call this tool immediately.',
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
        postId: z.string().optional().describe('The property (post) ID. If omitted, uses the listing selected in Manage (sidebar).'),
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

        const finalPostId =
          (typeof input.postId === 'string' && input.postId.trim() ? input.postId.trim() : '') ||
          selectedPostId ||
          ''

        if (!finalPostId) {
          console.warn('⚠️ No postId for package preview (no sidebar selection). A draft listing will be created when the user confirms save.', {
            inputPostId: input.postId,
            selectedPostId,
            postsAvailable: posts.length,
          })
        }

        // Build preview data with ALL values filled in and validate with Zod
        const preview = {
          name,
          description,
          category,
          entitlement: input.entitlement || 'standard',
          minNights: input.minNights || defaults.minNights,
          maxNights: input.maxNights || defaults.maxNights,
          baseRate: input.baseRate || defaults.baseRate,
          multiplier: input.multiplier || defaults.multiplier,
          features: input.features && input.features.length > 0 ? input.features : defaults.features,
          postId: finalPostId, // CRITICAL: Always include postId in preview
          revenueCatId: input.revenueCatId || undefined,
          yocoId: input.yocoId || undefined,
          isPreview: true,
        }

        // Ensure the streamed JSON matches the expected shape
        return packagePreviewSchema.parse(preview)
      },
    })

    // Create a tool for actually creating the package
    // @ts-ignore - AI SDK tool type inference issue
    const createPackageTool = tool({
      description:
        '🚨 CREATE PACKAGE: Persist the package in the database. Use when the user confirms the preview. Prefer pageData.postId / tool input postId for the listing. If no property is selected, a draft property (post) is created first so the package always belongs to a listing.',
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
        postId: z
          .string()
          .optional()
          .describe(
            'Property (post) ID. If omitted, uses the selected listing from the manage UI; if none exists, creates a draft property then attaches the package.',
          ),
        revenueCatId: z.string().optional().describe('Legacy RevenueCat product ID (deprecated, use yocoId instead)'),
        yocoId: z.string().optional().describe('Yoco product ID for payment processing (recommended)'),
      }),
      // @ts-expect-error - AI SDK type inference issue
      execute: async (input: any) => {
        const { name, description, category, entitlement, minNights, maxNights, baseRate, multiplier, features, postId, revenueCatId, yocoId } = input

        try {
          // Resolve listing: tool input → sidebar selection in Manage (pageData.postId). If none, create draft post below.
          let resolvedPostId: string | null =
            (typeof postId === 'string' && postId.trim() ? postId.trim() : null) ||
            selectedPostId

          let createdNewPost = false

          if (resolvedPostId) {
            try {
              await payload.findByID({
                collection: 'posts',
                id: resolvedPostId,
                depth: 0,
              })
            } catch {
              console.warn('⚠️ Resolved postId not found, will create draft property:', resolvedPostId)
              resolvedPostId = null
            }
          }

          if (!resolvedPostId) {
            const titleBase = (name || 'New property').trim().slice(0, 120) || 'New property'
            const bodyText = (
              description?.trim() ||
              `Property listing created for package “${name || 'package'}”. Edit title, content, and publish when ready.`
            ).slice(0, 8000)

            const draftPost = await payload.create({
              collection: 'posts',
              data: {
                title: titleBase,
                content: buildMinimalPostContent(bodyText) as any,
                _status: 'draft',
                baseRate:
                  typeof baseRate === 'number' && baseRate > 0
                    ? baseRate
                    : undefined,
              },
              user,
            })

            resolvedPostId = draftPost.id
            createdNewPost = true
            console.log('✅ Draft property created for package:', { postId: resolvedPostId, title: titleBase })
          }

          const finalPostId = resolvedPostId

          console.log('📦 Creating package with data:', {
            inputPostId: postId,
            contextPostId: pageData?.postId,
            firstPostId: posts.length > 0 ? posts[0].id : null,
            finalPostId,
            createdNewPost,
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

          const packageData = {
            post: finalPostId,
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
          }

          console.log('📦 Package data to create:', packageData)

          const created = await payload.create({
            collection: 'packages',
            data: packageData,
            user,
          })

          console.log('✅ Package created successfully:', {
            id: created.id,
            name: created.name,
            postId: typeof created.post === 'string' ? created.post : created.post?.id,
            post: created.post,
          })

          // Return structured response with package ID prominently displayed
          const categoryEmojiMap: Record<string, string> = {
            standard: '🏠',
            hosted: '✨',
            addon: '🧹',
            special: '🎁',
          }
          const categoryEmoji = (created.category && categoryEmojiMap[created.category]) || '📦'

          const categoryMessage = created.category === 'special' 
            ? ' Special packages are very popular with customers and can help attract more bookings!'
            : ''

          const createdPayload = {
            success: true as const,
            postId: finalPostId,
            createdNewPost,
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
              postId: typeof created.post === 'string' ? created.post : created.post?.id,
            },
            packageId: created.id, // Also include at top level for easy access
            message: `${categoryEmoji} Package "${name}" has been created successfully!${categoryMessage}${
              createdNewPost
                ? ` A draft property listing was created and linked to this package — open /admin/collections/posts/${finalPostId} or /manage/packages/${finalPostId} to finish editing.`
                : ''
            } You can view and manage packages at /manage/packages/${finalPostId}.`,
          }

          // Validate the JSON we stream back to the client
          return createdPackageSchema.parse(createdPayload)
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
          if (!postId && posts.length === 0) {
            return {
              success: true,
              packages: [],
              count: 0,
              message: 'No properties yet — create a listing first, or ask the assistant to create a package (a draft property can be created automatically).',
            }
          }

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

    // Tool for creating posts (properties)
    // @ts-ignore - AI SDK tool type inference issue
    const createPostTool = tool({
      description: 'Create a new property (post) for the host. Use this when user wants to create a property listing. After creating the post, you can then create packages for it.',
      parameters: z.object({
        title: z.string().describe('Property title/name (e.g., "Beachfront Studio", "Mountain Cabin")'),
        description: z.string().optional().describe('Property description. If not provided, will generate based on title.'),
        baseRate: z.number().int().min(0).optional().describe('Base rate per night in cents (ZAR). If not provided, will default to 0.'),
        featured: z.boolean().optional().default(false).describe('Feature this property on the home page'),
        metaTitle: z.string().optional().describe('SEO meta title'),
        metaDescription: z.string().optional().describe('SEO meta description'),
      }),
      // @ts-expect-error - AI SDK type inference issue
      execute: async (input: any) => {
        try {
          const { title, description, baseRate, featured, metaTitle, metaDescription } = input

          // Generate description if not provided
          const postDescription = description || `A beautiful ${title.toLowerCase()} property available for booking.`

          // Create minimal content structure for Lexical editor
          const content = {
            root: {
              type: 'root',
              children: [
                {
                  type: 'paragraph',
                  children: [
                    {
                      type: 'text',
                      text: postDescription,
                      format: 0,
                      style: '',
                      mode: 'normal',
                      detail: 0,
                    },
                  ],
                  direction: 'ltr',
                  format: '',
                  indent: 0,
                  version: 1,
                },
              ],
              direction: 'ltr',
              format: '',
              indent: 0,
              version: 1,
            },
          }

          const postData: any = {
            title,
            content,
            _status: 'draft', // Create as draft, user can publish later
            baseRate: baseRate || undefined,
            featured: featured || false,
          }

          // Add meta fields if provided
          if (metaTitle || metaDescription) {
            postData.meta = {}
            if (metaTitle) postData.meta.title = metaTitle
            if (metaDescription) postData.meta.description = metaDescription
          }

          const created = await payload.create({
            collection: 'posts',
            data: postData,
            user,
          })

          console.log('Post created successfully:', created.id)

          return {
            success: true,
            post: {
              id: created.id,
              title: created.title,
              slug: created.slug,
              baseRate: created.baseRate,
              status: created._status,
            },
            message: `Property "${title}" has been created successfully! You can now create packages for this property.`,
          }
        } catch (error: any) {
          console.error('Error creating post:', error)
          return {
            success: false,
            error: error.message || 'Failed to create post',
            message: `Failed to create property: ${error.message || 'Unknown error'}`,
          }
        }
      },
    })

    // Keep model configurable because availability varies by Google project/API rollout.
    const streamingModelName = process.env.GEMINI_STREAMING_MODEL || 'models/gemini-2.5-flash'
    const model = googleAI(streamingModelName)

    // Analyze existing packages to provide insights
    const specialPackages = existingPackages.docs.filter((pkg: any) => pkg.category === 'special')
    const packageStats = {
      total: existingPackages.docs.length,
      byCategory: {
        standard: existingPackages.docs.filter((pkg: any) => pkg.category === 'standard').length,
        hosted: existingPackages.docs.filter((pkg: any) => pkg.category === 'hosted').length,
        addon: existingPackages.docs.filter((pkg: any) => pkg.category === 'addon').length,
        special: specialPackages.length,
      },
      enabled: existingPackages.docs.filter((pkg: any) => pkg.isEnabled).length,
      disabled: existingPackages.docs.filter((pkg: any) => !pkg.isEnabled).length,
    }

    const systemPrompt = `You are an AI assistant helping a host manage their properties and packages.

🚨 CRITICAL TOOL CALLING RULES - FOLLOW THESE EXACTLY:
1. When a user says "CALL previewPackageTool NOW" or asks to create a package (ANY variation: "create", "make", "new package", mentions price like "R300", "package for R500", "make a package called X"), you MUST IMMEDIATELY call previewPackageTool WITHOUT any text response first.
2. DO NOT ask clarifying questions - use the tool with intelligent guesses based on the user's input
3. DO NOT respond with text explaining what you'll do - just call the tool IMMEDIATELY
4. DO NOT say "I'll create..." or "Let me..." - just call previewPackageTool right away
5. DO NOT generate any text before calling the tool - the tool call must be your FIRST action
6. After previewPackageTool completes, THEN provide a brief text response explaining the preview

EXAMPLES OF IMMEDIATE TOOL CALLS (NO TEXT BEFORE TOOL):
- User: "CALL previewPackageTool NOW with name=X, description=Y" → IMMEDIATELY call previewPackageTool(name="X", description="Y") - NO TEXT FIRST
- User: "make a package for R300 called vudu" → IMMEDIATELY call previewPackageTool(name="vudu", baseRate=30000) - NO TEXT FIRST
- User: "create a weekend getaway package" → IMMEDIATELY call previewPackageTool with reasonable defaults - NO TEXT FIRST  
- User: "new package for R500" → IMMEDIATELY call previewPackageTool(baseRate=50000) - NO TEXT FIRST
- User: "package that creates packages" → IMMEDIATELY call previewPackageTool - NO TEXT FIRST
- User: "create package" → IMMEDIATELY call previewPackageTool - NO TEXT FIRST
- User: "I want to create a package" → IMMEDIATELY call previewPackageTool - NO TEXT FIRST

AFTER TOOL CALLS:
- When user confirms (says "yes", "create", "confirm", "create it", "that looks good"), IMMEDIATELY call createPackageTool with the exact values from the preview - NO TEXT FIRST
- When user wants to modify, call previewPackageTool again with updated values

HOST'S PROPERTIES:
${posts.map((post: any) => `- ${post.title} (ID: ${post.id}, Slug: ${post.slug})`).join('\n') || 'No properties yet'}

PACKAGE STATISTICS:
- Total Packages: ${packageStats.total}
- By Category: Standard (${packageStats.byCategory.standard}), Hosted (${packageStats.byCategory.hosted}), Addon (${packageStats.byCategory.addon}), Special (${packageStats.byCategory.special})
- Enabled: ${packageStats.enabled}, Disabled: ${packageStats.disabled}

EXISTING PACKAGES:
${existingPackages.docs.map((pkg: any) => `- ${pkg.name} (${pkg.category}, ${pkg.minNights}-${pkg.maxNights} nights, ${pkg.isEnabled ? 'enabled' : 'disabled'})`).join('\n') || 'No packages yet'}

⭐ SPECIAL PACKAGES INSIGHT:
${specialPackages.length > 0 
  ? `You have ${specialPackages.length} special package(s). Special packages are popular with customers and offer unique experiences. Consider creating more special packages for seasonal promotions, unique experiences, or limited-time offers.`
  : 'You don\'t have any special packages yet. Special packages are great for promotions, unique experiences, and attracting customers. Consider creating special packages for seasonal offers or unique experiences.'}

PROPERTY & PACKAGE MANAGEMENT GUIDELINES:

PROPERTY CREATION:
1. When user wants to create a property from a package they offer:
   - FIRST use createPostTool to create the property (post)
   - THEN use previewPackageTool to show them the package preview
   - FINALLY use createPackageTool to create and assign the package to the new property
2. If user wants to create a package but doesn't specify a property:
   - Prefer the listing selected in Manage (sidebar). If none is selected, createPackageTool will create a draft property automatically and attach the package.
   - Hosts can also use createPostTool explicitly if they want to name/configure a listing before packages.

PACKAGE MANAGEMENT:
1. Base rates are stored in cents (ZAR). For example, R150.00 = 15000 cents, R300 = 30000 cents
2. Categories: 
   - standard: Regular accommodation packages (most common)
   - hosted: Packages with concierge services and premium amenities
   - addon: One-time extras like cleaning, wine, guided tours (not accommodation)
   - special: Promotional/unique packages - these are VERY POPULAR with customers! Consider creating special packages for seasonal promotions, unique experiences, or limited-time offers
3. Entitlements: standard (all customers), pro (premium customers only)
4. When user wants to create a package (e.g., "create a package", "make a package", "new package", "package for R300"):
   - IMMEDIATELY call previewPackageTool - DO NOT respond with text first
   - Extract package name, price (convert R to cents), and any other details from the request
   - Fill in ALL missing values with reasonable guesses based on category defaults
   - The preview should show complete package details including guessed baseRate, features, nights, etc.
   - Wait for user confirmation
   - THEN use createPackageTool to actually create it
   - IMPORTANT: When user explicitly says "create", "confirm", "yes", or "create this package", you MUST call createPackageTool immediately with the exact values from the preview
   - CRITICAL: Never say "I can't create" - always use previewPackageTool first, then createPackageTool after confirmation
5. Guess reasonable defaults if user doesn't specify:
   - For addon packages: baseRate 20000-50000 cents (R200-R500), minNights: 1, maxNights: 1, features: ["Professional service", "One-time fee", "Quick setup"]
   - For standard packages: baseRate 15000-30000 cents (R150-R300), minNights: 2, maxNights: 7, features: ["Comfortable accommodation", "Essential amenities", "Flexible check-in"]
   - For hosted packages: baseRate 30000-60000 cents (R300-R600), minNights: 3, maxNights: 14, features: ["Concierge service", "Premium amenities", "Personalized experience"]
   - For special packages: baseRate 25000-50000 cents (R250-R500), minNights: 1, maxNights: 7, features: ["Special offer", "Limited availability", "Unique experience", "Best value"]
   - Always generate 3-5 relevant features based on category and package type
6. CRUD Operations:
   - CREATE PROPERTY: Use createPostTool when user wants to create a new property
   - CREATE PACKAGE: Use previewPackageTool first, then createPackageTool after confirmation
   - READ: Use findPackagesTool when user asks to see, list, or view packages
   - UPDATE: Use updatePackageTool to modify existing packages (name, price, settings, etc.)
   - DELETE: Use deletePackageTool to remove packages (always confirm first!)
7. Always format currency as R (Rands), not $
8. Be helpful and guide the host through decisions
9. When showing package previews, ensure ALL fields are filled with reasonable guesses so the user can see a complete package before confirming
10. After creating a property, automatically offer to create a package for it
11. SPECIAL PACKAGES: These are very popular with customers! When appropriate, suggest creating special packages for promotions, seasonal offers, or unique experiences. After creating a package, mention that special packages tend to attract more bookings.
12. PACKAGE MANAGEMENT: After creating a package, remind the host they can view and manage all packages at /manage/packages/[postId]. They can enable/disable packages, update pricing, and see which packages are performing well.

When user asks to create a package from a property they offer, create the property first, then create the package and assign it to that property.${
      existingPackageIdFromContext
        ? `

🎯 PACKAGE ONBOARDING — EDIT EXISTING PACKAGE:
- The client is editing package ID: ${existingPackageIdFromContext} (property post: ${selectedPostId || 'use tool input / message'}).
- When the user describes changes or the message asks to CALL updatePackageTool, use updatePackageTool IMMEDIATELY with packageId="${existingPackageIdFromContext}" and merge in inferred fields (name, description, category, minNights, maxNights, baseRate in cents, multiplier, features, entitlement, isEnabled) from their text.
- Do NOT call previewPackage or createPackage for this onboarding session unless the user explicitly asks to create a duplicate/new package.`
        : ''
    }`

    const lastUserMessage = [...messages]
      .reverse()
      .find((m: any) => m?.role === 'user')

    const lastUserText =
      typeof (lastUserMessage as any)?.content === 'string'
        ? (lastUserMessage as any).content.toLowerCase()
        : Array.isArray((lastUserMessage as any)?.parts)
          ? (lastUserMessage as any).parts
              .filter((p: any) => p?.type === 'text' && typeof p?.text === 'string')
              .map((p: any) => p.text.toLowerCase())
              .join(' ')
          : ''

    const shouldForcePreviewTool =
      /(create|make|new package|build package|package for|suggest|winter package|special|bundle|deal|offer)/i.test(
        lastUserText,
      )

    const normalizedModelMessages = messages
      .map((msg: any) => {
        const role = msg?.role === 'assistant' ? 'assistant' : 'user'

        if (Array.isArray(msg?.parts)) {
          const content = msg.parts
            .filter((part: any) => part?.type === 'text' && typeof part?.text === 'string')
            .map((part: any) => part.text)
            .join(' ')
            .trim()
          if (content) return { role, content }
        }

        if (typeof msg?.content === 'string' && msg.content.trim()) {
          return { role, content: msg.content.trim() }
        }

        return null
      })
      .filter(Boolean)

    const fallbackText =
      typeof requestBody?.message === 'string' && requestBody.message.trim().length > 0
        ? requestBody.message.trim()
        : ''

    const result = streamText({
      model: model as any,
      system: systemPrompt,
      messages:
        normalizedModelMessages.length > 0
          ? (normalizedModelMessages as any)
          : fallbackText
            ? ([{ role: 'user', content: fallbackText }] as any)
            : ([] as any),
      ...(shouldForcePreviewTool ? { toolChoice: { type: 'tool' as const, toolName: 'previewPackage' } } : {}),
      tools: {
        createPost: createPostTool,
        previewPackage: previewPackageTool,
        createPackage: createPackageTool,
        findPackages: findPackagesTool,
        updatePackage: updatePackageTool,
        deletePackage: deletePackageTool,
      },
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

