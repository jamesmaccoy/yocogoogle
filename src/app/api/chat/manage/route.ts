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

    // Create a tool for previewing package creation
    const previewPackageTool = tool({
      description: 'Preview a package before creating it. Shows a mock package card with all details filled in based on the user\'s request. Use this when the user wants to create a new package.',
      parameters: z.object({
        name: z.string().describe('Package display name (include emoji if appropriate, e.g., "🏖️ Weekend Getaway")'),
        description: z.string().describe('Detailed description of what the package offers'),
        category: z.enum(['standard', 'hosted', 'addon', 'special']).describe('Package category'),
        entitlement: z.enum(['standard', 'pro']).default('standard').describe('Required customer entitlement level'),
        minNights: z.number().int().min(1).describe('Minimum number of nights'),
        maxNights: z.number().int().min(1).describe('Maximum number of nights'),
        baseRate: z.number().int().min(0).optional().describe('Base rate in cents (ZAR). For example, R150.00 = 15000 cents. Leave undefined if not specified.'),
        multiplier: z.number().min(0.1).max(3.0).default(1).describe('Price multiplier'),
        features: z.array(z.string()).default([]).describe('Array of key features/amenities'),
        postId: z.string().describe('The property (post) ID this package belongs to'),
        revenueCatId: z.string().optional().describe('RevenueCat product ID if known'),
      }),
      execute: async ({ name, description, category, entitlement, minNights, maxNights, baseRate, multiplier, features, postId, revenueCatId }) => {
        // Return preview data - this will be rendered as a UI component
        return {
          name,
          description,
          category,
          entitlement,
          minNights,
          maxNights,
          baseRate: baseRate || undefined,
          multiplier,
          features,
          postId,
          revenueCatId: revenueCatId || undefined,
          isPreview: true,
        }
      },
    })

    // Create a tool for actually creating the package
    const createPackageTool = tool({
      description: 'Create a package after the user has confirmed the preview. Only use this after previewPackageTool has been called and user confirmed.',
      parameters: z.object({
        name: z.string(),
        description: z.string(),
        category: z.enum(['standard', 'hosted', 'addon', 'special']),
        entitlement: z.enum(['standard', 'pro']).default('standard'),
        minNights: z.number().int().min(1),
        maxNights: z.number().int().min(1),
        baseRate: z.number().int().min(0).optional(),
        multiplier: z.number().min(0.1).max(3.0).default(1),
        features: z.array(z.string()).default([]),
        postId: z.string(),
        revenueCatId: z.string().optional(),
      }),
      execute: async ({ name, description, category, entitlement, minNights, maxNights, baseRate, multiplier, features, postId, revenueCatId }) => {
        try {
          const created = await payload.create({
            collection: 'packages',
            data: {
              post: postId,
              name,
              description,
              category,
              entitlement,
              minNights,
              maxNights,
              baseRate: baseRate || undefined,
              multiplier,
              features: features.map(f => ({ feature: f })),
              revenueCatId: revenueCatId || undefined,
              isEnabled: true,
            },
            user,
          })

          return {
            success: true,
            package: {
              id: created.id,
              name: created.name,
              description: created.description,
              category: created.category,
              isEnabled: created.isEnabled,
            },
            message: `Package "${name}" has been created successfully!`,
          }
        } catch (error: any) {
          return {
            success: false,
            error: error.message || 'Failed to create package',
            message: `Failed to create package: ${error.message || 'Unknown error'}`,
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
   - FIRST use previewPackageTool to show them a preview card
   - Wait for user confirmation
   - THEN use createPackageTool to actually create it
5. Guess reasonable defaults if user doesn't specify:
   - For addon packages: baseRate 20000-50000 cents (R200-R500)
   - For standard packages: baseRate based on property context or 15000-30000 cents
   - minNights: 1 for addons, 2-3 for standard packages
   - maxNights: 1-3 for addons, 7-14 for standard packages
   - features: Generate 3-5 relevant features based on category
6. Always format currency as R (Rands), not $
7. Be helpful and guide the host through decisions

When user asks to create a package, use previewPackageTool first to show them what it will look like.`

    const result = streamText({
      model: model as any,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools: {
        previewPackage: previewPackageTool,
        createPackage: createPackageTool,
      },
      maxSteps: 5,
      stopWhen: stepCountIs(5),
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

