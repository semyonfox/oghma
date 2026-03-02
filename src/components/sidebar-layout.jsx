'use client'

import { useState } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, TransitionChild } from '@headlessui/react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

function SidebarContent({
  navigationItems,
  teams,
  logoText,
  logoSrc,
  userProfile,
  onNavigate,
  onProfileClick,
  onNavigateItem,
  mobile = false,
}) {
  return (
    <div
      className={classNames(
        'relative flex grow flex-col gap-y-5 overflow-y-auto',
        mobile ? 'bg-gray-900 px-6 pb-2 ring ring-white/10 before:pointer-events-none before:absolute before:inset-0 before:bg-black/10' : 'border-r border-white/10 bg-black/10 px-6',
      )}
    >
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center">
        {logoSrc ? (
          <img alt="Logo" src={logoSrc} className="h-8 w-auto" />
        ) : (
          <span className="text-xl font-bold text-white">{logoText}</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="relative flex flex-1 flex-col">
        <ul role="list" className="flex flex-1 flex-col gap-y-7">
          {/* Main Navigation */}
          <li>
            <ul role="list" className="-mx-2 space-y-1">
              {navigationItems.map((item) => (
                <li key={item.name}>
                  <a
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault()
                      onNavigateItem(item)
                    }}
                    className={classNames(
                      item.current ? 'bg-white/5 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white',
                      'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold',
                    )}
                  >
                    {item.icon && (
                      <item.icon
                        aria-hidden="true"
                        className={classNames(
                          item.current ? 'text-white' : 'text-gray-400 group-hover:text-white',
                          'size-6 shrink-0',
                        )}
                      />
                    )}
                    {item.name}
                  </a>
                </li>
              ))}
            </ul>
          </li>

          {/* Teams Section */}
          {teams.length > 0 && (
            <li>
              <div className="text-xs/6 font-semibold text-gray-400">Your teams</div>
              <ul role="list" className="-mx-2 mt-2 space-y-1">
                {teams.map((team) => (
                  <li key={team.name}>
                    <a
                      href={team.href}
                      onClick={(e) => {
                        e.preventDefault()
                        onNavigateItem(team)
                      }}
                      className={classNames(
                        team.current ? 'bg-white/5 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white',
                        'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold',
                      )}
                    >
                      <span
                        className={classNames(
                          team.current
                            ? 'border-white/20 text-white'
                            : 'border-white/10 text-gray-400 group-hover:border-white/20 group-hover:text-white',
                          'flex size-6 shrink-0 items-center justify-center rounded-lg border bg-white/5 text-[0.625rem] font-medium',
                        )}
                      >
                        {team.initial}
                      </span>
                      <span className="truncate">{team.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          )}

          {/* User Profile */}
          {userProfile && (
            <li className="-mx-6 mt-auto">
              <button
                onClick={onProfileClick}
                className="w-full flex items-center gap-x-4 px-6 py-3 text-sm/6 font-semibold text-white hover:bg-white/5 transition-colors"
              >
                {userProfile.avatar && (
                  <img
                    alt={userProfile.name}
                    src={userProfile.avatar}
                    className="size-8 rounded-full bg-gray-800 outline -outline-offset-1 outline-white/10"
                  />
                )}
                <span className="sr-only">Your profile</span>
                <span aria-hidden="true">{userProfile.name}</span>
              </button>
            </li>
          )}
        </ul>
      </nav>
    </div>
  )
}

export function SidebarLayout({
  navigationItems = [],
  teams = [],
  logoText = 'OghmaNotes',
  logoSrc = null,
  userProfile = null,
  pageTitle = 'Dashboard',
  children = null,
  onNavigate = null,
  onProfileClick = null,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleNavClick = (item) => {
    if (onNavigate) {
      onNavigate(item)
    }
    setSidebarOpen(false)
  }

  const onNavigateItem = (item) => {
    if (onNavigate) {
      onNavigate(item)
    }
    setSidebarOpen(false)
  }

  return (
    <div>
      {/* Mobile Sidebar Dialog */}
      <Dialog open={sidebarOpen} onClose={setSidebarOpen} className="relative z-50 lg:hidden">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-gray-900/80 transition-opacity duration-300 ease-linear data-closed:opacity-0"
        />

        <div className="fixed inset-0 flex">
          <DialogPanel
            transition
            className="relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-closed:-translate-x-full"
          >
            <TransitionChild>
              <div className="absolute top-0 left-full flex w-16 justify-center pt-5 duration-300 ease-in-out data-closed:opacity-0">
                <button type="button" onClick={() => setSidebarOpen(false)} className="-m-2.5 p-2.5">
                  <span className="sr-only">Close sidebar</span>
                  <XMarkIcon aria-hidden="true" className="size-6 text-white" />
                </button>
              </div>
            </TransitionChild>

            <SidebarContent
              navigationItems={navigationItems}
              teams={teams}
              logoText={logoText}
              logoSrc={logoSrc}
              userProfile={userProfile}
              onProfileClick={onProfileClick}
              onNavigateItem={onNavigateItem}
              mobile={true}
            />
          </DialogPanel>
        </div>
      </Dialog>

      {/* Desktop Sidebar */}
      <div className="hidden bg-gray-900 lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <SidebarContent
          navigationItems={navigationItems}
          teams={teams}
          logoText={logoText}
          logoSrc={logoSrc}
          userProfile={userProfile}
          onProfileClick={onProfileClick}
          onNavigateItem={onNavigateItem}
          mobile={false}
        />
      </div>

      {/* Mobile Top Bar */}
      <div className="sticky top-0 z-40 flex items-center gap-x-6 bg-gray-900 px-4 py-4 after:pointer-events-none after:absolute after:inset-0 after:border-b after:border-white/10 after:bg-black/10 sm:px-6 lg:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="-m-2.5 p-2.5 text-gray-400 hover:text-white"
        >
          <span className="sr-only">Open sidebar</span>
          <Bars3Icon aria-hidden="true" className="size-6" />
        </button>
        <div className="flex-1 text-sm/6 font-semibold text-white">{pageTitle}</div>
        {userProfile && (
          <button onClick={onProfileClick} className="hover:opacity-80 transition-opacity">
            <span className="sr-only">Your profile</span>
            {userProfile.avatar && (
              <img
                alt={userProfile.name}
                src={userProfile.avatar}
                className="size-8 rounded-full bg-gray-800 outline -outline-offset-1 outline-white/10"
              />
            )}
          </button>
        )}
      </div>

      {/* Main Content */}
      <main className="py-10 lg:pl-72">
        <div className="px-4 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  )
}
