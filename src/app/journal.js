'use client'

import { useState, useRef, useEffect, useCallback, useTransition, memo, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  addEntry, toggleEntry, deleteEntry, reorderEntries,
  createCollection, deleteCollection,
  addCollectionItem, toggleCollectionItem, deleteCollectionItem,
  updateMeal,
} from './actions'
import { logout } from './auth-actions'

/* ─── Config ─────────────────────────────────────────────────── */

const BULLET_TYPES = {
  task:     { symbol: '•',  label: 'Task',     colorClass: 'type-task' },
  event:    { symbol: '◯',  label: 'Event',    colorClass: 'type-event' },
  note:     { symbol: '—',  label: 'Note',     colorClass: 'type-note' },
  priority: { symbol: '★',  label: 'Priority', colorClass: 'type-priority' },
}

const WEEKDAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Key format: "YYYY-MM-DD" (local time)
function makeKey(year, month0, day) {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Today in local time
const _now = new Date()
const TODAY = makeKey(_now.getFullYear(), _now.getMonth(), _now.getDate())

// 14 days ending today (for the date picker strip)
const DATES = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() - i)
  return {
    key:     makeKey(d.getFullYear(), d.getMonth(), d.getDate()),
    day:     d.getDate(),
    month:   MONTH_SHORT[d.getMonth()],
    weekday: WEEKDAYS[d.getDay()],
    year:    d.getFullYear(),
  }
})

// Shift a "YYYY-MM-DD" key by N days
function offsetDate(key, days) {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return makeKey(dt.getFullYear(), dt.getMonth(), dt.getDate())
}

// Build month grid cells for any year/month0
function buildMonthCells(year, month0) {
  const cells        = []
  const startWeekday = new Date(year, month0, 1).getDay()
  const daysInMonth  = new Date(year, month0 + 1, 0).getDate()
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      key:     makeKey(year, month0, day),
      day,
      weekday: WEEKDAYS[new Date(year, month0, day).getDay()],
    })
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/* ─── Helpers ────────────────────────────────────────────────── */

// DB stores UTC midnight — use UTC methods to recover the calendar date
function dateToKey(date) {
  const d = new Date(date)
  return makeKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

// Parse a "YYYY-MM-DD" key into display fields
function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return {
    year:       y,
    month:      MONTH_SHORT[m - 1],
    monthLong:  MONTH_LONG[m - 1],
    day:        d,
    weekday:    WEEKDAYS[dt.getDay()],
  }
}

function logsToEntries(logs) {
  const map = {}
  for (const log of logs) {
    const key = dateToKey(log.date)
    map[key] = log.entries.map(e => ({
      id: e.id,
      type: e.type,
      text: e.text,
      done: e.done,
    }))
  }
  return map
}

function getTaskProgress(entries) {
  const tasks = entries.filter(e => e.type === 'task' || e.type === 'priority')
  const done  = tasks.filter(e => e.done)
  return { total: tasks.length, done: done.length }
}

function getWeekDays(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const base = new Date(y, m - 1, d)
  const wIdx = base.getDay()
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(y, m - 1, d + (i - wIdx))
    return {
      key:     makeKey(dt.getFullYear(), dt.getMonth(), dt.getDate()),
      day:     dt.getDate(),
      month:   MONTH_SHORT[dt.getMonth()],
      weekday: WEEKDAYS[dt.getDay()],
      inMonth: true,
    }
  })
}

/* ─── Shared Components ──────────────────────────────────────── */

function BulletSymbol({ type, done, onClick }) {
  const cfg = BULLET_TYPES[type]
  return (
    <span
      className={`entry-bullet ${cfg.colorClass}`}
      onClick={onClick}
      title={done ? 'Mark incomplete' : 'Mark complete'}
      style={{ opacity: done ? 0.45 : 1 }}
    >
      {done && (type === 'task' || type === 'priority') ? '✕' : cfg.symbol}
    </span>
  )
}

const EntryItem = memo(function EntryItem({ entry, onToggle, onDelete, animDelay, onDragStart, onDragOver, onDrop, onDragEnd, isDragOver }) {
  const canDrag = !!onDragStart
  return (
    <div
      className={`entry-item${isDragOver ? ' drag-over' : ''}`}
      style={{ animationDelay: `${animDelay}ms` }}
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragOver={canDrag ? e => { e.preventDefault(); onDragOver() } : undefined}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {canDrag && <span className="drag-handle">⠿</span>}
      <BulletSymbol
        type={entry.type}
        done={entry.done}
        onClick={() => onToggle(entry.id, entry.done)}
      />
      <span className={`entry-text${entry.done ? ' done' : ''}`}>
        {entry.text}
      </span>
      <div className="entry-actions">
        <button
          className="entry-action-btn"
          onClick={() => onToggle(entry.id, entry.done)}
          title={entry.done ? 'Reopen' : 'Complete'}
        >
          {entry.done ? '↩' : '✓'}
        </button>
        <button
          className="entry-action-btn"
          onClick={() => onDelete(entry.id)}
          title="Delete"
        >
          ✕
        </button>
      </div>
    </div>
  )
})

function AddEntryForm({ onAdd }) {
  const [text, setText]   = useState('')
  const [type, setType]   = useState('task')
  const inputRef          = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    onAdd({ type, text: text.trim() })
    setText('')
    inputRef.current?.focus()
  }

  return (
    <form className="journal-add-form" onSubmit={submit}>
      <div className="add-form-type-selector">
        {Object.entries(BULLET_TYPES).map(([key, cfg]) => (
          <button
            key={key}
            type="button"
            className={`add-form-type-btn${type === key ? ` active ${key}-active` : ''}`}
            onClick={() => setType(key)}
          >
            <span style={{ fontSize: 13 }}>{cfg.symbol}</span>
            {cfg.label}
          </button>
        ))}
      </div>
      <div className="add-form-row">
        <span className={`add-form-symbol entry-bullet ${BULLET_TYPES[type].colorClass}`} style={{ margin: 0, cursor: 'default' }}>
          {BULLET_TYPES[type].symbol}
        </span>
        <input
          ref={inputRef}
          className="add-form-input"
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={`Add ${BULLET_TYPES[type].label.toLowerCase()}…`}
          autoComplete="off"
        />
        <button
          className="add-form-submit"
          type="submit"
          disabled={!text.trim()}
        >
          Record
        </button>
      </div>
      <p className="add-form-hint">Press Enter to add · Ctrl+/ to focus</p>
    </form>
  )
}

/* ─── Meals Section ──────────────────────────────────────────── */

const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch',     label: 'Lunch'     },
  { key: 'snack',     label: 'Breakfast' },
  { key: 'dinner',    label: 'Dinner'    },
]

function MealsSection({ dateKey, meals, onUpdate }) {
  const [values, setValues] = useState({
    breakfast: meals?.breakfast || '',
    lunch:     meals?.lunch    || '',
    snack:     meals?.snack    || '',
    dinner:    meals?.dinner   || '',
  })

  useEffect(() => {
    setValues({
      breakfast: meals?.breakfast || '',
      lunch:     meals?.lunch    || '',
      snack:     meals?.snack    || '',
      dinner:    meals?.dinner   || '',
    })
  }, [dateKey, meals])

  const handleBlur = (meal) => {
    onUpdate(meal, values[meal])
  }

  return (
    <div className="meals-section">
      <div className="meals-grid">
        {MEALS.map(({ key, label }) => (
          <div key={key} className="meal-row">
            <label className="meal-label">{label}</label>
            <input
              className="meal-input"
              type="text"
              value={values[key]}
              placeholder={`What did you have?`}
              onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
              onBlur={() => handleBlur(key)}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── New Collection Form (sidebar) ─────────────────────────── */

function NewCollectionForm({ onAdd, onCancel }) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('◎')
  const nameRef = useRef(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onAdd(name.trim(), icon.trim() || '◎')
  }

  return (
    <form className="new-collection-form" onSubmit={submit}>
      <input
        type="text"
        className="new-collection-icon-input"
        value={icon}
        onChange={e => setIcon(e.target.value)}
        maxLength={2}
        placeholder="◎"
      />
      <input
        ref={nameRef}
        type="text"
        className="new-collection-name-input"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Collection name"
      />
      <div className="new-collection-btns">
        <button type="submit" className="new-collection-save" disabled={!name.trim()}>✓</button>
        <button type="button" className="new-collection-cancel" onClick={onCancel}>✕</button>
      </div>
    </form>
  )
}

/* ─── Collection View ────────────────────────────────────────── */

function CollectionView({ collection, onAddItem, onToggleItem, onDeleteItem, onDeleteCollection }) {
  const [text, setText] = useState('')
  const inputRef = useRef(null)

  const items = collection.items
  const total = items.length
  const done  = items.filter(i => i.done).length
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0

  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    onAddItem(collection.id, text.trim())
    setText('')
    inputRef.current?.focus()
  }

  return (
    <div className="collection-view-wrapper">
      <div className="journal-header">
        <div className="journal-header-eyebrow">Collection</div>
        <div className="journal-date-title" style={{ fontSize: 42 }}>
          <span style={{ fontSize: 36, lineHeight: 1 }}>{collection.icon}</span>
          {collection.name}
          <button
            className="collection-delete-btn"
            onClick={() => onDeleteCollection(collection.id)}
            title="Delete collection"
          >
            ✕
          </button>
        </div>
        <div className="journal-progress">
          <div className="journal-progress-bar-bg">
            <div className="journal-progress-bar" style={{ width: `${pct}%` }} />
          </div>
          <span className="journal-progress-label">
            {total === 0 ? 'No items yet' : `${done} of ${total} done`}
          </span>
        </div>
      </div>

      <div className="journal-entries">
        {items.length === 0 ? (
          <div className="journal-entries-empty animate-fade-in">
            <span className="journal-entries-empty-symbol">◌</span>
            <span className="journal-entries-empty-text">No items — add one below</span>
          </div>
        ) : (
          items.map((item, i) => (
            <div key={item.id} className="entry-item" style={{ animationDelay: `${i * 40}ms` }}>
              <span
                className="entry-bullet type-task"
                onClick={() => onToggleItem(item.id, item.done, collection.id)}
                style={{ opacity: item.done ? 0.45 : 1 }}
              >
                {item.done ? '✕' : '•'}
              </span>
              <span className={`entry-text${item.done ? ' done' : ''}`}>{item.text}</span>
              <div className="entry-actions">
                <button
                  className="entry-action-btn"
                  onClick={() => onToggleItem(item.id, item.done, collection.id)}
                  title={item.done ? 'Reopen' : 'Complete'}
                >
                  {item.done ? '↩' : '✓'}
                </button>
                <button
                  className="entry-action-btn"
                  onClick={() => onDeleteItem(item.id, collection.id)}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <form className="journal-add-form" onSubmit={submit}>
        <div className="add-form-row">
          <span className="entry-bullet type-task" style={{ margin: 0, cursor: 'default', fontSize: 13 }}>•</span>
          <input
            ref={inputRef}
            className="add-form-input"
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Add item…"
            autoComplete="off"
          />
          <button className="add-form-submit" type="submit" disabled={!text.trim()}>Add</button>
        </div>
      </form>
    </div>
  )
}

/* ─── Weekly View ────────────────────────────────────────────── */

function WeeklyView({ weekDays, entries, onToggle, onDelete, onSelectDate, setView, filterType, mealsMap, showMeals }) {
  return (
    <div className="weekly-view">
      {weekDays.map((d, i) => {
        const raw = d.inMonth ? (entries[d.key] || []) : []
        const dayEntries = filterType ? raw.filter(e => e.type === filterType) : raw
        const isToday = d.key === TODAY
        return (
          <div key={i} className={`week-day-col${!d.inMonth ? ' out-of-month' : ''}`}>
            <div className={`week-day-header${isToday ? ' is-today' : ''}`}>
              <span className="week-day-name">{d.weekday}</span>
              <span className="week-day-num">{d.day}</span>
              <span className="week-day-month-label">{d.month}</span>
            </div>
            <div className="week-day-entries">
              {!d.inMonth ? (
                <div className="week-empty">·</div>
              ) : dayEntries.length === 0 ? (
                <div className="week-empty">◌</div>
              ) : (
                dayEntries.map(entry => (
                  <div
                    key={entry.id}
                    className="week-entry"
                    title={entry.text}
                  >
                    <span className={`week-entry-bullet entry-bullet ${BULLET_TYPES[entry.type].colorClass}`}
                      style={{ opacity: entry.done ? 0.45 : 1, fontSize: 13, width: 'auto', height: 'auto', cursor: 'pointer', flexShrink: 0 }}
                      onClick={() => onToggle(entry.id, entry.done, d.key)}
                    >
                      {entry.done && (entry.type === 'task' || entry.type === 'priority')
                        ? '✕'
                        : BULLET_TYPES[entry.type].symbol}
                    </span>
                    <span className={`week-entry-text${entry.done ? ' done' : ''}`}>
                      {entry.text}
                    </span>
                  </div>
                ))
              )}
            </div>
            {showMeals && mealsMap[d.key] && (
              <div className="week-meals">
                {MEALS.map(({ key, label }) => mealsMap[d.key][key] ? (
                  <div key={key} className="week-meal-row">
                    <span className="week-meal-label">{label.charAt(0)}</span>
                    <span className="week-meal-text">{mealsMap[d.key][key]}</span>
                  </div>
                ) : null)}
              </div>
            )}
            {d.inMonth && (
              <button
                className="week-go-daily-btn"
                onClick={() => { onSelectDate(d.key); setView('daily') }}
              >
                open day →
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ─── Yearly View ────────────────────────────────────────────── */

function YearlyView({ entries, year, onSelectDate, setView, filterType, onSelectMonth }) {
  const todayRowRef = useRef(null)

  useEffect(() => {
    todayRowRef.current?.scrollIntoView({ block: 'center' })
  }, [year])

  const months = Array.from({ length: 12 }, (_, m) => {
    const daysInMonth = new Date(year, m + 1, 0).getDate()
    const days = []
    for (let d = 1; d <= daysInMonth; d++) {
      const key = makeKey(year, m, d)
      const raw = entries[key] || []
      const dayEntries = filterType
        ? raw.filter(e => e.type === filterType)
        : raw.filter(e => e.type === 'event')
      if (dayEntries.length > 0) {
        const dt = new Date(year, m, d)
        days.push({ key, day: d, weekday: WEEKDAYS[dt.getDay()], entries: dayEntries })
      }
    }
    return { month: MONTH_LONG[m], days }
  })

  return (
    <div className="yearly-view">
      {months.map(({ month, days }, m) => (
        <div key={month} className="yearly-month-section">
          <div className="yearly-month-label" onClick={() => onSelectMonth(year, m)} style={{ cursor: 'pointer' }} title={`Open ${month}`}>
            <span className="yearly-month-label-text">{month}</span>
            <span className="yearly-month-label-line" />
          </div>
          {days.map(({ key, day, weekday, entries: dayEntries }) => {
            const isToday = key === TODAY
            const isSunday = weekday === 'Sun'
            return (
              <div
                key={key}
                ref={isToday ? todayRowRef : null}
                className={`month-list-row${isToday ? ' is-today' : ''}${isSunday ? ' is-sunday' : ''}`}
                onClick={() => { onSelectDate(key); setView('daily') }}
              >
                <span className="month-list-day">{day}</span>
                <span className="month-list-weekday">{weekday.charAt(0)}</span>
                <div className="month-list-entries">
                  {dayEntries.map((e, j) => (
                    <span key={j} className={`month-list-entry entry-bullet ${BULLET_TYPES[e.type].colorClass}`}>
                      {BULLET_TYPES[e.type].symbol}
                      <span className={`month-list-entry-text${e.done ? ' done' : ''}`}>{e.text}</span>
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/* ─── Monthly View ───────────────────────────────────────────── */

function MonthlyView({ entries, monthCells, onSelectDate, setView, filterType, mealsMap, showMeals }) {
  const days = monthCells.filter(Boolean)
  const todayRowRef = useRef(null)

  useEffect(() => {
    todayRowRef.current?.scrollIntoView({ block: 'center' })
  }, [])

  return (
    <div className="monthly-view">
      <div className="month-list">
        {days.map((cell, i) => {
          const raw = entries[cell.key] || []
          const dayEntries = filterType ? raw.filter(e => e.type === filterType) : raw
          const isToday = cell.key === TODAY
          const isSunday = cell.weekday === 'Sun'
          return (
            <div
              key={i}
              ref={isToday ? todayRowRef : null}
              className={`month-list-row${isToday ? ' is-today' : ''}${isSunday ? ' is-sunday' : ''}`}
              onClick={() => { onSelectDate(cell.key); setView('daily') }}
            >
              <span className="month-list-day">{cell.day}</span>
              <span className="month-list-weekday">{cell.weekday.charAt(0)}</span>
              <div className="month-list-entries">
                {dayEntries.map((e, j) => (
                  <span key={j} className={`month-list-entry entry-bullet ${BULLET_TYPES[e.type].colorClass}`}>
                    {BULLET_TYPES[e.type].symbol}
                    <span className={`month-list-entry-text${e.done ? ' done' : ''}`}>{e.text}</span>
                  </span>
                ))}
                {showMeals && mealsMap[cell.key] && MEALS.map(({ key, label }) =>
                  mealsMap[cell.key][key] ? (
                    <span key={key} className="month-meal-pill">
                      {label.charAt(0)} {mealsMap[cell.key][key]}
                    </span>
                  ) : null
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Main Page ──────────────────────────────────────────────── */

function mealsToMap(meals) {
  const map = {}
  for (const m of meals) {
    const d = new Date(m.date)
    const key = makeKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    map[key] = { breakfast: m.breakfast, lunch: m.lunch, snack: m.snack, dinner: m.dinner }
  }
  return map
}

export default function BulletJournal({ logs, collections, meals }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [entries, setEntries]                   = useState(() => logsToEntries(logs))
  const [selectedDate, setSelectedDate]         = useState(TODAY)
  const [entriesKey, setEntriesKey]             = useState(0)
  const [isDark, setIsDark]                     = useState(false)
  const [view, setView]                         = useState('daily')
  const [activeCollection, setActiveCollection]   = useState(null)
  const [newCollectionOpen, setNewCollectionOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen]             = useState(false)
  const [viewMonth, setViewMonth] = useState({ year: _now.getFullYear(), month: _now.getMonth() })
  const [filterType, setFilterType] = useState(null)
  const [showMeals, setShowMeals] = useState(false)
  const [mealsOpen, setMealsOpen] = useState(false)
  const [overdueOpen, setOverdueOpen] = useState(true)
  const [mealsMap, setMealsMap] = useState(() => mealsToMap(meals))
  const dragIndexRef = useRef(null)
  const dragOverIndexRef = useRef(null)
  const dragItemsRef = useRef(null)
  const pullStartY = useRef(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [collectionsState, setCollectionsState] = useState(() =>
    collections.map(c => ({
      id: c.id, icon: c.icon, name: c.name,
      items: (c.items || []).map(i => ({ id: i.id, text: i.text, done: i.done })),
    }))
  )

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
  }, [])

  const toggleTheme = useCallback(() => {
    const next = !isDark
    setIsDark(next)
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
      localStorage.setItem('theme', 'light')
    }
  }, [isDark])

  useEffect(() => {
    setEntries(logsToEntries(logs))
  }, [logs])

  useEffect(() => {
    setCollectionsState(collections.map(c => ({
      id: c.id, icon: c.icon, name: c.name,
      items: (c.items || []).map(i => ({ id: i.id, text: i.text, done: i.done })),
    })))
  }, [collections])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [router])

  useEffect(() => {
    const THRESHOLD = 80
    const onTouchStart = (e) => {
      if (window.scrollY === 0) pullStartY.current = e.touches[0].clientY
    }
    const onTouchMove = (e) => {
      if (pullStartY.current === null) return
      const dist = e.touches[0].clientY - pullStartY.current
      if (dist > 0) {
        e.preventDefault()
        setPullDistance(Math.min(dist, THRESHOLD * 1.5))
      }
    }
    const onTouchEnd = () => {
      if (pullDistance >= THRESHOLD) {
        setIsRefreshing(true)
        router.refresh()
        setTimeout(() => { setIsRefreshing(false); setPullDistance(0) }, 1000)
      } else {
        setPullDistance(0)
      }
      pullStartY.current = null
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [router, pullDistance])

  const allCurrentEntries = entries[selectedDate] || []
  const currentEntries = filterType ? allCurrentEntries.filter(e => e.type === filterType) : allCurrentEntries
  const { total, done } = getTaskProgress(currentEntries)

  const overdueEntries = useMemo(() => {
    const groups = []
    for (const [key, dayEntries] of Object.entries(entries)) {
      if (key >= selectedDate) continue
      const incomplete = dayEntries.filter(e => !e.done && (e.type === 'task' || e.type === 'priority'))
      if (incomplete.length === 0) continue
      const [sy, sm, sd] = selectedDate.split('-').map(Number)
      const [ky, km, kd] = key.split('-').map(Number)
      const daysAgo = Math.round(
        (new Date(sy, sm - 1, sd) - new Date(ky, km - 1, kd)) / 86400000
      )
      groups.push({ key, daysAgo, entries: incomplete })
    }
    return groups.sort((a, b) => a.key < b.key ? 1 : -1)
  }, [entries, selectedDate])
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0

const selectDate = useCallback((key) => {
    setSelectedDate(key)
    setEntriesKey(k => k + 1)
  }, [])

  // dateKey param lets weekly view specify which date's entries to mutate
  const handleToggle = useCallback((id, currentDone, dateKey) => {
    const key = dateKey ?? selectedDate
    setEntries(prev => ({
      ...prev,
      [key]: (prev[key] || []).map(e =>
        e.id === id ? { ...e, done: !e.done } : e
      ),
    }))
    startTransition(() => { toggleEntry(id, !currentDone) })
  }, [selectedDate])

  const handleDelete = useCallback((id, dateKey) => {
    const key = dateKey ?? selectedDate
    setEntries(prev => ({
      ...prev,
      [key]: (prev[key] || []).filter(e => e.id !== id),
    }))
    startTransition(() => { deleteEntry(id) })
  }, [selectedDate])

  const handleOverdueComplete = useCallback((id, fromDateKey) => {
    const entry = (entries[fromDateKey] || []).find(e => e.id === id)
    if (!entry) return
    const migrated = { id: `temp-${Date.now()}`, type: entry.type, text: entry.text, done: true }
    setEntries(prev => ({
      ...prev,
      [fromDateKey]: (prev[fromDateKey] || []).filter(e => e.id !== id),
      [selectedDate]: [...(prev[selectedDate] || []), migrated],
    }))
    startTransition(async () => {
      await deleteEntry(id)
      await addEntry(selectedDate, entry.type, entry.text, true)
    })
  }, [selectedDate, entries])

  const handleCreateCollection = useCallback((name, icon) => {
    const tempId = `temp-${Date.now()}`
    setCollectionsState(prev => [...prev, { id: tempId, name, icon, items: [] }])
    setActiveCollection(tempId)
    startTransition(async () => {
      await createCollection(name, icon)
      router.refresh()
    })
  }, [router])

  const handleDeleteCollection = useCallback((id) => {
    setCollectionsState(prev => prev.filter(c => c.id !== id))
    setActiveCollection(null)
    startTransition(() => { deleteCollection(id) })
  }, [])

  const handleAddItem = useCallback((collectionId, text) => {
    const tempItem = { id: `temp-${Date.now()}`, text, done: false }
    setCollectionsState(prev => prev.map(c =>
      c.id === collectionId ? { ...c, items: [...c.items, tempItem] } : c
    ))
    startTransition(async () => {
      await addCollectionItem(collectionId, text)
      router.refresh()
    })
  }, [router])

  const handleToggleItem = useCallback((itemId, currentDone, collectionId) => {
    setCollectionsState(prev => prev.map(c =>
      c.id === collectionId
        ? { ...c, items: c.items.map(i => i.id === itemId ? { ...i, done: !i.done } : i) }
        : c
    ))
    startTransition(() => { toggleCollectionItem(itemId, !currentDone) })
  }, [])

  const handleDeleteItem = useCallback((itemId, collectionId) => {
    setCollectionsState(prev => prev.map(c =>
      c.id === collectionId
        ? { ...c, items: c.items.filter(i => i.id !== itemId) }
        : c
    ))
    startTransition(() => { deleteCollectionItem(itemId) })
  }, [])

  const handleReorder = useCallback((fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    setEntries(prev => {
      const list = [...(prev[selectedDate] || [])]
      const [moved] = list.splice(fromIndex, 1)
      list.splice(toIndex, 0, moved)
      const orderedIds = list.map(e => e.id)
      setTimeout(() => {
        startTransition(() => { reorderEntries(orderedIds) })
      }, 0)
      return { ...prev, [selectedDate]: list }
    })
  }, [selectedDate, router])

  const handleUpdateMeal = useCallback((meal, text) => {
    setMealsMap(prev => ({
      ...prev,
      [selectedDate]: { ...prev[selectedDate], [meal]: text },
    }))
    startTransition(async () => {
      await updateMeal(selectedDate, meal, text)
    })
  }, [selectedDate])

  const handleAdd = useCallback(({ type, text }) => {
    const tempEntry = { id: `temp-${Date.now()}`, type, text, done: false }
    setEntries(prev => ({
      ...prev,
      [selectedDate]: [...(prev[selectedDate] || []), tempEntry],
    }))
    startTransition(async () => {
      await addEntry(selectedDate, type, text)
      router.refresh()
    })
  }, [selectedDate, router])

  const currentDateInfo = parseKey(selectedDate)
  const weekDays  = getWeekDays(selectedDate)
  const weekStart = weekDays[0]
  const weekEnd   = weekDays[6]
  const monthCells = buildMonthCells(viewMonth.year, viewMonth.month)

  const prevMonth = () => setViewMonth(({ year, month }) => {
    const d = new Date(year, month - 1, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const nextMonth = () => setViewMonth(({ year, month }) => {
    const d = new Date(year, month + 1, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const prevYear = () => setViewMonth(({ year, month }) => ({ year: year - 1, month }))
  const nextYear = () => setViewMonth(({ year, month }) => ({ year: year + 1, month }))

  return (
    <div className="journal-shell">

      {/* ── Pull-to-refresh indicator ───────────────────────── */}
      {(pullDistance > 0 || isRefreshing) && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: `${Math.max(pullDistance, isRefreshing ? 48 : 0)}px`,
          background: 'var(--bg, #fff)',
          transition: isRefreshing ? 'none' : 'height 0.1s',
          overflow: 'hidden',
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            border: '2px solid var(--accent, #6c63ff)',
            borderTopColor: 'transparent',
            animation: isRefreshing ? 'spin 0.7s linear infinite' : 'none',
            transform: isRefreshing ? 'none' : `rotate(${(pullDistance / 80) * 270}deg)`,
            transition: isRefreshing ? 'none' : 'transform 0.05s',
          }} />
        </div>
      )}

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <div className={`sidebar-overlay${sidebarOpen ? ' visible' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`journal-sidebar${sidebarOpen ? ' open' : ''}`}>

        <div className="sidebar-brand animate-slide-in">
          <div className="sidebar-brand-eyebrow">My</div>
          <div className="sidebar-brand-title">
            Bullet <span>Journal</span>
          </div>
        </div>

        <div className="sidebar-collections-section">
          <div className="sidebar-collections-header">
            <span className="sidebar-collections-label">Collections</span>
            <button
              className="sidebar-add-btn"
              onClick={() => setNewCollectionOpen(o => !o)}
              title="New collection"
            >+</button>
          </div>
          {newCollectionOpen && (
            <NewCollectionForm
              onAdd={(name, icon) => {
                handleCreateCollection(name, icon)
                setNewCollectionOpen(false)
              }}
              onCancel={() => setNewCollectionOpen(false)}
            />
          )}
          {collectionsState.map(c => (
            <div
              key={c.id}
              className={`sidebar-collection-item${activeCollection === c.id ? ' active' : ''}`}
              onClick={() => { setActiveCollection(c.id); setSidebarOpen(false) }}
            >
              <span className="sidebar-collection-icon">{c.icon}</span>
              <span className="sidebar-collection-name">{c.name}</span>
              <span className="sidebar-collection-count">{c.items.length}</span>
            </div>
          ))}
        </div>

        <button className="theme-toggle" onClick={toggleTheme}>
          <span className="theme-toggle-icon">{isDark ? '○' : '●'}</span>
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>
        <form action={logout}>
          <button className="logout-btn" type="submit">⎋ Sign out</button>
        </form>

      </aside>

      {/* ── Main ────────────────────────────────────────────── */}
      <main className="journal-main dot-grid">

        {/* Header */}
        <div className="journal-header">

          {/* View tabs */}
          <div className="view-tabs">
            <button className="menu-btn" onClick={() => setSidebarOpen(o => !o)} title="Menu">☰</button>
            {['daily', 'weekly', 'monthly', 'yearly'].map(v => (
              <button
                key={v}
                className={`view-tab${view === v && !activeCollection ? ' active' : ''}`}
                onClick={() => { setView(v); setActiveCollection(null) }}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {!activeCollection && view === 'daily' && (
            <>
              <div className="journal-header-eyebrow">
                {currentDateInfo.weekday} · {currentDateInfo.month} {currentDateInfo.year}
              </div>
              <div className="journal-nav-row">
                <button className="nav-btn" onClick={() => selectDate(offsetDate(selectedDate, -1))}>←</button>
                <div className="journal-date-title">
                  {currentDateInfo.month} {currentDateInfo.day}
                  {selectedDate === TODAY && (
                    <span className="journal-today-badge">today</span>
                  )}
                </div>
                <button className="nav-btn" onClick={() => selectDate(offsetDate(selectedDate, 1))}>→</button>
                {selectedDate !== TODAY && (
                  <button className="today-btn" onClick={() => selectDate(TODAY)}>Today</button>
                )}
              </div>
              <div className="journal-progress">
                <div className="journal-progress-bar-bg">
                  <div className="journal-progress-bar" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="journal-progress-label">
                  {total === 0
                    ? 'No tasks yet'
                    : `${done} of ${total} task${total !== 1 ? 's' : ''} done`}
                </span>
              </div>
            </>
          )}

          {!activeCollection && view === 'weekly' && (
            <>
              <div className="journal-header-eyebrow">Week · {parseKey(selectedDate).month} {parseKey(selectedDate).year}</div>
              <div className="journal-nav-row">
                <button className="nav-btn" onClick={() => selectDate(offsetDate(selectedDate, -7))}>←</button>
                <div className="journal-date-title" style={{ fontSize: 36 }}>
                  {weekStart.month} {weekStart.day}
                  <span style={{ fontSize: 24, opacity: 0.45, margin: '0 10px' }}>–</span>
                  {weekEnd.month} {weekEnd.day}
                </div>
                <button className="nav-btn" onClick={() => selectDate(offsetDate(selectedDate, 7))}>→</button>
                {!weekDays.some(d => d.key === TODAY) && (
                  <button className="today-btn" onClick={() => selectDate(TODAY)}>Today</button>
                )}
              </div>
            </>
          )}

          {!activeCollection && view === 'monthly' && (
            <>
              <div className="journal-header-eyebrow">{viewMonth.year}</div>
              <div className="journal-nav-row">
                <button className="nav-btn" onClick={prevMonth}>←</button>
                <div className="journal-date-title">{MONTH_LONG[viewMonth.month]}</div>
                <button className="nav-btn" onClick={nextMonth}>→</button>
                {(viewMonth.year !== _now.getFullYear() || viewMonth.month !== _now.getMonth()) && (
                  <button className="today-btn" onClick={() => setViewMonth({ year: _now.getFullYear(), month: _now.getMonth() })}>Today</button>
                )}
              </div>
            </>
          )}

          {!activeCollection && view === 'yearly' && (
            <>
              <div className="journal-header-eyebrow">Year</div>
              <div className="journal-nav-row">
                <button className="nav-btn" onClick={prevYear}>←</button>
                <div className="journal-date-title">{viewMonth.year}</div>
                <button className="nav-btn" onClick={nextYear}>→</button>
                {viewMonth.year !== _now.getFullYear() && (
                  <button className="today-btn" onClick={() => setViewMonth({ year: _now.getFullYear(), month: _now.getMonth() })}>Today</button>
                )}
              </div>
            </>
          )}

        </div>

        {/* Collection view */}
        {activeCollection && (() => {
          const col = collectionsState.find(c => c.id === activeCollection)
          return col ? (
            <CollectionView
              collection={col}
              onAddItem={handleAddItem}
              onToggleItem={handleToggleItem}
              onDeleteItem={handleDeleteItem}
              onDeleteCollection={handleDeleteCollection}
            />
          ) : null
        })()}

        {/* Filter bar — all views */}
        {!activeCollection && (
          <div className="bullet-legend">
            {Object.entries(BULLET_TYPES).map(([key, cfg]) => (
              <span
                key={key}
                className={`bullet-legend-item filter-btn${filterType === key ? ' filter-active' : ''}`}
                onClick={() => setFilterType(f => f === key ? null : key)}
                title={filterType === key ? 'Show all' : `Filter: ${cfg.label}`}
              >
                <span className={`entry-bullet ${cfg.colorClass}`} style={{ width: 'auto', height: 'auto', fontSize: 13 }}>
                  {cfg.symbol}
                </span>
                {cfg.label}
              </span>
            ))}
            {filterType && (
              <span className="bullet-legend-item filter-clear" onClick={() => setFilterType(null)}>
                ✕ clear
              </span>
            )}
            {view === 'daily' && !filterType && (
              <span className="bullet-legend-item" style={{ marginLeft: 'auto' }}>
                click bullet to complete
              </span>
            )}
            {view !== 'daily' && (
              <span
                className={`bullet-legend-item filter-btn${showMeals ? ' filter-active' : ''}`}
                style={{ marginLeft: filterType ? 0 : 'auto' }}
                onClick={() => setShowMeals(s => !s)}
              >
                ⬡ Meals
              </span>
            )}
          </div>
        )}

        {/* Content */}
        {!activeCollection && view === 'daily' && (
          <>
            {overdueEntries.length > 0 && (
              <div className="overdue-section">
                <div className="overdue-header" onClick={() => setOverdueOpen(o => !o)}>
                  <span className="overdue-header-label">
                    {overdueEntries.reduce((s, g) => s + g.entries.length, 0)} incomplete from past days
                  </span>
                  <span className="overdue-header-arrow">{overdueOpen ? '▾' : '▸'}</span>
                </div>
                {overdueOpen && overdueEntries.map(({ key, daysAgo, entries: dayEntries }) => (
                  <div key={key} className="overdue-group">
                    <div className="overdue-date-label">
                      {daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`} · {parseKey(key).month} {parseKey(key).day}
                    </div>
                    {dayEntries.map((entry, i) => (
                      <EntryItem
                        key={entry.id}
                        entry={entry}
                        onToggle={(id) => handleOverdueComplete(id, key)}
                        onDelete={(id) => handleDelete(id, key)}
                        animDelay={i * 40}
                        isDragOver={false}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
            <div className="journal-entries" key={entriesKey}>
              {currentEntries.length === 0 ? (
                <div className="journal-entries-empty animate-fade-in">
                  <span className="journal-entries-empty-symbol">◌</span>
                  <span className="journal-entries-empty-text">
                    No entries yet — begin your log below
                  </span>
                </div>
              ) : (
                [...currentEntries].sort((a, b) => a.done - b.done).map((entry, i) => (
                  <EntryItem
                    key={entry.id}
                    entry={entry}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    animDelay={i * 40}
                    isDragOver={false}
                    onDragStart={filterType ? null : (e) => {
                      dragIndexRef.current = i
                      dragItemsRef.current = e.currentTarget.closest('.journal-entries')
                    }}
                    onDragOver={filterType ? null : (e) => {
                      if (dragOverIndexRef.current !== null && dragOverIndexRef.current !== i) {
                        dragItemsRef.current?.children[dragOverIndexRef.current]?.classList.remove('drag-over')
                      }
                      dragOverIndexRef.current = i
                      e.currentTarget.classList.add('drag-over')
                    }}
                    onDrop={filterType ? null : (e) => {
                      e.currentTarget.classList.remove('drag-over')
                      handleReorder(dragIndexRef.current, i)
                      dragOverIndexRef.current = null
                    }}
                    onDragEnd={filterType ? null : () => {
                      if (dragOverIndexRef.current !== null) {
                        dragItemsRef.current?.children[dragOverIndexRef.current]?.classList.remove('drag-over')
                      }
                      dragIndexRef.current = null
                      dragOverIndexRef.current = null
                    }}
                  />
                ))
              )}
            </div>
            <AddEntryForm onAdd={handleAdd} />
          </>
        )}

        {!activeCollection && view === 'weekly' && (
          <WeeklyView
            weekDays={weekDays}
            entries={entries}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onSelectDate={selectDate}
            setView={setView}
            filterType={filterType}
            mealsMap={mealsMap}
            showMeals={showMeals}
          />
        )}

        {!activeCollection && view === 'monthly' && (
          <MonthlyView
            entries={entries}
            monthCells={monthCells}
            onSelectDate={selectDate}
            setView={setView}
            filterType={filterType}
            mealsMap={mealsMap}
            showMeals={showMeals}
          />
        )}

        {!activeCollection && view === 'yearly' && (
          <YearlyView
            entries={entries}
            year={viewMonth.year}
            onSelectDate={selectDate}
            setView={setView}
            filterType={filterType}
            onSelectMonth={(year, month) => { setViewMonth({ year, month }); setView('monthly') }}
          />
        )}

      </main>

      {/* ── Right Panel (meals — daily only) ────────────────── */}
      {!activeCollection && view === 'daily' && (
        <div className={`journal-right-panel${mealsOpen ? '' : ' collapsed'}`}>
          <div className="right-panel-toggle" onClick={() => setMealsOpen(o => !o)}>
            <span className="right-panel-toggle-icon">⬡</span>
            {mealsOpen && <span className="right-panel-toggle-label">Meals</span>}
            <span className="right-panel-toggle-arrow">{mealsOpen ? '›' : '‹'}</span>
          </div>
          {mealsOpen && (
            <MealsSection
              dateKey={selectedDate}
              meals={mealsMap[selectedDate]}
              onUpdate={handleUpdateMeal}
            />
          )}
        </div>
      )}

    </div>
  )
}
