import { prisma } from '@/lib/prisma'
import BulletJournal from './journal'

export default async function Page() {
  const [logs, collections] = await Promise.all([
    prisma.dailyLog.findMany({
      include: { entries: { orderBy: { order: 'asc' } } },
      orderBy: { date: 'desc' },
    }),
    prisma.collection.findMany({
      include: { _count: { select: { items: true } } },
      orderBy: { order: 'asc' },
    }),
  ])

  return <BulletJournal logs={logs} collections={collections} />
}
