'use server'

import { prisma } from '@/lib/prisma'

function keyToDate(key) {
  // "Apr 18" -> UTC midnight Date for 2026
  return new Date(`${key} 2026 UTC`)
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
