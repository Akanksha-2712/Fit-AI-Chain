import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { recipes } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { upsertUser } from '@/lib/db-utils'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const username = searchParams.get('username')

    if (!username) {
      return NextResponse.json({ success: false, message: 'Missing username' }, { status: 400 })
    }

    const user = await upsertUser(username)

    if (!db) {
      return NextResponse.json({ success: true, recipes: [] })
    }

    const userRecipes = await db
      .select()
      .from(recipes)
      .where(eq(recipes.userId, user.id))
      .orderBy(recipes.createdAt) // Note: this defaults to ascending.

    return NextResponse.json({ success: true, recipes: userRecipes })
  } catch (error) {
    console.error('Error fetching recipes:', error)
    return NextResponse.json({ success: false, message: 'Failed to retrieve recipes' }, { status: 500 })
  }
}

function validateRecipePayload(data: any) {
  const { username, name, servings, ingredients, totalCalories, totalProtein, totalCarbs, totalFat } = data

  if (!username || typeof username !== 'string' || !username.trim()) {
    return { isValid: false, message: 'Invalid or missing username' }
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return { isValid: false, message: 'Invalid or missing recipe name' }
  }

  const normalizedServings = servings ?? 1
  if (!Number.isInteger(normalizedServings) || normalizedServings <= 0) {
    return { isValid: false, message: 'Servings must be a positive integer' }
  }

  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return { isValid: false, message: 'Ingredients must be a non-empty array' }
  }

  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i]
    if (!ing || typeof ing !== 'object') {
      return { isValid: false, message: `Ingredient at index ${i} is invalid` }
    }
    if (!ing.name || typeof ing.name !== 'string' || !ing.name.trim()) {
      return { isValid: false, message: `Ingredient at index ${i} is missing a valid name` }
    }
    if (!Number.isFinite(ing.calories) || ing.calories < 0) {
      return { isValid: false, message: `Ingredient "${ing.name}" must have non-negative finite calories` }
    }
    if (ing.protein !== undefined && (!Number.isFinite(ing.protein) || ing.protein < 0)) {
      return { isValid: false, message: `Ingredient "${ing.name}" must have non-negative finite protein` }
    }
    if (ing.carbs !== undefined && (!Number.isFinite(ing.carbs) || ing.carbs < 0)) {
      return { isValid: false, message: `Ingredient "${ing.name}" must have non-negative finite carbs` }
    }
    if (ing.fat !== undefined && (!Number.isFinite(ing.fat) || ing.fat < 0)) {
      return { isValid: false, message: `Ingredient "${ing.name}" must have non-negative finite fat` }
    }
  }

  if (!Number.isFinite(totalCalories) || totalCalories < 0) {
    return { isValid: false, message: 'Total calories must be a non-negative finite number' }
  }

  if (totalProtein !== undefined && (!Number.isFinite(totalProtein) || totalProtein < 0)) {
    return { isValid: false, message: 'Total protein must be a non-negative finite number' }
  }

  if (totalCarbs !== undefined && (!Number.isFinite(totalCarbs) || totalCarbs < 0)) {
    return { isValid: false, message: 'Total carbs must be a non-negative finite number' }
  }

  if (totalFat !== undefined && (!Number.isFinite(totalFat) || totalFat < 0)) {
    return { isValid: false, message: 'Total fat must be a non-negative finite number' }
  }

  return { isValid: true }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const validation = validateRecipePayload(data)
    if (!validation.isValid) {
      return NextResponse.json({ success: false, message: validation.message }, { status: 400 })
    }

    const { username, name, description, servings, ingredients, totalCalories, totalProtein, totalCarbs, totalFat, imageUrl, isPublic } = data
    const user = await upsertUser(username)

    if (!db) {
      // Mock return for development without DB
      return NextResponse.json({
        success: true,
        recipe: {
          id: Date.now(),
          userId: user.id,
          name,
          description,
          servings: servings || 1,
          ingredients,
          totalCalories,
          totalProtein,
          totalCarbs,
          totalFat,
          imageUrl,
          isPublic: isPublic || false,
          createdAt: new Date()
        }
      })
    }

    const [newRecipe] = await db.insert(recipes).values({
      userId: user.id,
      name,
      description,
      servings: servings || 1,
      ingredients,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      imageUrl,
      isPublic: isPublic || false,
    }).returning()

    return NextResponse.json({ success: true, recipe: newRecipe })
  } catch (error) {
    console.error('Error saving recipe:', error)
    return NextResponse.json({ success: false, message: 'Failed to save recipe' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await req.json()
    const { id } = data
    if (!id) {
      return NextResponse.json({ success: false, message: 'Missing recipe id' }, { status: 400 })
    }

    const validation = validateRecipePayload(data)
    if (!validation.isValid) {
      return NextResponse.json({ success: false, message: validation.message }, { status: 400 })
    }

    const { username, name, description, servings, ingredients, totalCalories, totalProtein, totalCarbs, totalFat, isPublic } = data
    const user = await upsertUser(username)

    if (!db) {
      return NextResponse.json({ success: true, recipe: { id, name, description, servings, ingredients, totalCalories, totalProtein, totalCarbs, totalFat, isPublic } })
    }

    const [updated] = await db
      .update(recipes)
      .set({ name, description, servings, ingredients, totalCalories, totalProtein, totalCarbs, totalFat, isPublic })
      .where(and(eq(recipes.id, id), eq(recipes.userId, user.id)))
      .returning()

    if (!updated) {
      return NextResponse.json({ success: false, message: 'Recipe not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, recipe: updated })
  } catch (error) {
    console.error('Error updating recipe:', error)
    return NextResponse.json({ success: false, message: 'Failed to update recipe' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const idParam = searchParams.get('id')
    const username = searchParams.get('username')

    if (!idParam || !username) {
      return NextResponse.json({ success: false, message: 'Missing id or username' }, { status: 400 })
    }
    
    const id = parseInt(idParam, 10)
    if (isNaN(id)) {
      return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 })
    }

    const user = await upsertUser(username)
    
    if (!db) {
      return NextResponse.json({ success: true })
    }

    const deleted = await db
      .delete(recipes)
      .where(and(eq(recipes.id, id), eq(recipes.userId, user.id)))
      .returning()

    if (deleted.length === 0) {
      return NextResponse.json({ success: false, message: 'Recipe not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting recipe:', error)
    return NextResponse.json({ success: false, message: 'Failed to delete recipe' }, { status: 500 })
  }
}
