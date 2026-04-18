'use server'

import { prisma } from '@/lib/prisma'

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

export async function addEntry(dateStr, type, text) {
  const log = await getOrCreateLog(dateStr)
  const count = await prisma.entry.count({ where: { dailyLogId: log.id } })
  await prisma.entry.create({
    data: { type, text, dailyLogId: log.id, order: count },
  })
}

export async function toggleEntry(entryId, done) {
  await prisma.entry.update({
    where: { id: entryId },
    data: { done },
  })
}

export async function deleteEntry(entryId) {
  await prisma.entry.delete({ where: { id: entryId } })
}

export async function createCollection(name, icon) {
  const count = await prisma.collection.count()
  return prisma.collection.create({
    data: { name, icon, order: count },
  })
}

export async function deleteCollection(id) {
  await prisma.collection.delete({ where: { id } })
}

export async function addCollectionItem(collectionId, text) {
  const count = await prisma.collectionItem.count({ where: { collectionId } })
  return prisma.collectionItem.create({
    data: { text, collectionId, order: count },
  })
}

export async function toggleCollectionItem(itemId, done) {
  await prisma.collectionItem.update({
    where: { id: itemId },
    data: { done },
  })
}

export async function deleteCollectionItem(itemId) {
  await prisma.collectionItem.delete({ where: { id: itemId } })
}
