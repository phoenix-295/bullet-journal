'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'

async function requireAuth() {
  const cookieStore = await cookies()
  const session = cookieStore.get('bj_session')?.value
  if (session !== process.env.AUTH_SECRET) {
    throw new Error('Unauthorized')
  }
}

const VALID_MEALS = ['breakfast', 'lunch', 'snack', 'dinner']

function keyToDate(key) {
  // "YYYY-MM-DD" -> UTC midnight Date
  return new Date(`${key}T00:00:00.000Z`)
}

async function getOrCreateLog(dateStr) {
  const date = keyToDate(dateStr)
  return prisma.dailyLog.upsert({
    where: { date },
    create: { date },
    update: {},
  })
}

export async function addEntry(dateStr, type, text, done = false) {
  await requireAuth()
  const log = await getOrCreateLog(dateStr)
  const count = await prisma.entry.count({ where: { dailyLogId: log.id } })
  await prisma.entry.create({
    data: { type, text, done, dailyLogId: log.id, order: count },
  })
  revalidatePath('/')
}

export async function toggleEntry(entryId, done) {
  await requireAuth()
  await prisma.entry.update({
    where: { id: entryId },
    data: { done },
  })
}

export async function updateEntry(entryId, text) {
  await requireAuth()
  await prisma.entry.update({
    where: { id: entryId },
    data: { text },
  })
}

export async function deleteEntry(entryId) {
  await requireAuth()
  await prisma.entry.deleteMany({ where: { id: entryId } })
}

export async function reorderEntries(orderedIds) {
  await requireAuth()
  await prisma.$transaction(
    orderedIds.map((id, order) => prisma.entry.updateMany({ where: { id }, data: { order } }))
  )
}

export async function updateMeal(dateStr, meal, text) {
  await requireAuth()
  if (!VALID_MEALS.includes(meal)) throw new Error('Invalid meal field')
  const date = keyToDate(dateStr)
  await prisma.dailyMeals.upsert({
    where: { date },
    create: { date, [meal]: text },
    update: { [meal]: text },
  })
}

export async function createCollection(name, icon) {
  await requireAuth()
  const count = await prisma.collection.count()
  const col = await prisma.collection.create({
    data: { name, icon, order: count },
  })
  revalidatePath('/')
  return col
}

export async function deleteCollection(id) {
  await requireAuth()
  await prisma.collection.delete({ where: { id } })
}

export async function addCollectionItem(collectionId, text) {
  await requireAuth()
  const count = await prisma.collectionItem.count({ where: { collectionId } })
  const item = await prisma.collectionItem.create({
    data: { text, collectionId, order: count },
  })
  revalidatePath('/')
  return item
}

export async function toggleCollectionItem(itemId, done) {
  await requireAuth()
  await prisma.collectionItem.update({
    where: { id: itemId },
    data: { done },
  })
}

export async function deleteCollectionItem(itemId) {
  await requireAuth()
  await prisma.collectionItem.delete({ where: { id: itemId } })
}
