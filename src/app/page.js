import { prisma } from '@/lib/prisma'
import BulletJournal from './journal'

const WINDOW_DAYS = 120

export default async function Page() {
  const since = new Date()
  since.setDate(since.getDate() - WINDOW_DAYS)
  since.setHours(0, 0, 0, 0)

  const [logs, collections, meals] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { date: { gte: since } },
      include: { entries: { orderBy: { order: 'asc' } } },
      orderBy: { date: 'desc' },
    }),
    prisma.collection.findMany({
      include: {
        items: { orderBy: { order: 'asc' } },
        _count: { select: { items: true } },
      },
      orderBy: { order: 'asc' },
    }),
    prisma.dailyMeals.findMany({
      where: { date: { gte: since } },
    }),
  ])

  return <BulletJournal logs={logs} collections={collections} meals={meals} />
}
