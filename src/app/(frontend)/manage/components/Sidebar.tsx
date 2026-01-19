"use client"

import React from 'react'
import Link from 'next/link'
import {
  Building2,
  Home,
  Settings,
  PieChart,
  Package,
  FileText,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Post } from '@/payload-types'

interface SidebarProps {
  activeProperty: string | null
  onSelectProperty: (id: string) => void
  properties: Post[]
  activeTab: 'packages' | 'statement'
  onSelectTab: (tab: 'packages' | 'statement') => void
  currentUser?: {
    name?: string | null
    email?: string | null
  }
}

const navItems = [
  {
    id: 'packages',
    name: 'Packages',
    icon: Package,
  },
  {
    id: 'statement',
    name: 'Statements',
    icon: FileText,
  },
]

export function Sidebar({ 
  activeProperty, 
  onSelectProperty, 
  properties,
  activeTab,
  onSelectTab,
  currentUser
}: SidebarProps) {
  const getPropertyIcon = (index: number) => {
    return index % 2 === 0 ? Home : Building2
  }

  const userInitials = currentUser?.name
    ? currentUser.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : currentUser?.email?.[0]?.toUpperCase() || 'U'

  return (
    <aside className="w-64 bg-slate-50 border-r border-slate-200 flex-shrink-0 flex flex-col h-screen sticky top-0">
      <div className="p-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl text-slate-900 hover:opacity-80 transition-opacity">
          <div className="h-8 w-8 bg-teal-400 rounded-lg flex items-center justify-center">
            <Package className="h-5 w-5 text-cyan-900" />
          </div>
          <span>HostAI</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-8">
        {/* Main Navigation */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-2">
            Menu
          </h3>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id as 'packages' | 'statement')}
                  className={cn(
                    "w-full flex items-center gap-3 px-2 py-2 text-sm font-medium rounded-md transition-colors group",
                    isActive
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <item.icon className={cn(
                    "h-4 w-4",
                    isActive ? "text-teal-500" : "text-slate-400 group-hover:text-slate-600"
                  )} />
                  {item.name}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Properties List */}
        <div>
          <div className="flex items-center justify-between px-2 mb-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Properties
            </h3>
            <Link
              href="/manage/posts/new"
              className="p-1 hover:bg-slate-200 rounded transition-colors"
              title="Create new property"
            >
              <Plus className="h-3 w-3 text-slate-500" />
            </Link>
          </div>
          <nav className="space-y-1">
            {properties.length === 0 ? (
              <div className="px-2 py-4 text-center">
                <p className="text-xs text-slate-400 mb-2">No properties yet</p>
                <Link
                  href="/manage/posts/new"
                  className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                >
                  Create your first
                </Link>
              </div>
            ) : (
              properties.map((property, index) => {
                const isActive = activeProperty === property.id
                const PropertyIcon = getPropertyIcon(index)
                return (
                  <button
                    key={property.id}
                    onClick={() => onSelectProperty(property.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-2 py-2 text-sm font-medium rounded-md transition-all duration-200",
                      isActive
                        ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    <PropertyIcon
                      className={cn(
                        "h-4 w-4",
                        isActive ? "text-teal-500" : "text-slate-400"
                      )}
                    />
                    <span className="truncate">{property.title}</span>
                  </button>
                )
              })
            )}
          </nav>
        </div>
      </div>

      <div className="p-4 border-t border-slate-200">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">
              {currentUser?.name || 'User'}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {currentUser?.email || ''}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}

