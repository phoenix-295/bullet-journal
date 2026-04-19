import { prisma } from '@/lib/prisma'
import BulletJournal from './journal'

const COMPLETED_DAYS = 90

export default async function Page() {
  const since90 = new Date()
  since90.setDate(since90.getDate() - COMPLETED_DAYS)
  since90.setHours(0, 0, 0, 0)

  const [logs, openTaskLogs, collections, meals] = await Promise.all([
    // 90 days of all entries (events, notes, completed tasks, open tasks)
    prisma.dailyLog.findMany({
      where: { date: { gte: since90 } },
      include: { entries: { orderBy: { order: 'asc' } } },
      orderBy: { date: 'desc' },
    }),
    // All open tasks/priorities older than 90 days (no date cap)
    prisma.dailyLog.findMany({
      where: {
        date: { lt: since90 },
        entries: { some: { done: false, type: { in: ['task', 'priority'] } } },
      },
      include: {
        entries: {
          where: { done: false, type: { in: ['task', 'priority'] } },
          orderBy: { order: 'asc' },
        },
      },
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
      where: { date: { gte: since90 } },
    }),
  ])

  return <BulletJournal logs={[...logs, ...openTaskLogs]} collections={collections} meals={meals} />
}
