'use client'

import {
  Cog6ToothIcon,
  BellIcon,
  CreditCardIcon,
  PuzzlePieceIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'
import { MagnifyingGlassIcon, ChevronDownIcon } from '@heroicons/react/20/solid'
import { SidebarLayout } from '@/components/sidebar-layout'
import CanvasIntegration from '@/components/settings/canvas-integration'

const navigationItems = [
  { name: 'Account', href: '#account', icon: Cog6ToothIcon, current: true },
  { name: 'Notifications', href: '#notifications', icon: BellIcon, current: false },
  { name: 'Billing', href: '#billing', icon: CreditCardIcon, current: false },
  { name: 'Canvas Integration', href: '#canvas', icon: PuzzlePieceIcon, current: false },
  { name: 'AI Settings', href: '#ai', icon: Cog6ToothIcon, current: false },
]

const secondaryNavigation = [
  { name: 'Account', href: '#account', current: true },
  { name: 'Notifications', href: '#notifications', current: false },
  { name: 'Billing', href: '#billing', current: false },
  { name: 'Canvas Integration', href: '#canvas', current: false },
  { name: 'AI Settings', href: '#ai', current: false },
  { name: 'Data & Export', href: '#data', current: false },
  { name: 'Danger Zone', href: '#danger', current: false },
]

export default function SettingsPage() {
  const handleNavClick = (item) => {
    const element = document.querySelector(item.href)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <SidebarLayout
      navigationItems={navigationItems}
      logoText="OghmaNotes"
      pageTitle="Settings"
      onNavigate={handleNavClick}
      children={
        <>
          {/* Top bar with search */}
          <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-6 border-b border-white/5 bg-gray-900 -mx-4 -mt-10 px-4 sm:px-6 lg:px-8 sm:hidden">
            <div className="flex flex-1 gap-x-4 self-stretch">
              <form action="#" method="GET" className="grid flex-1 grid-cols-1">
                <input
                  name="search"
                  placeholder="Search settings"
                  aria-label="Search"
                  className="col-start-1 row-start-1 block size-full bg-transparent pl-8 text-base text-white outline-hidden placeholder:text-gray-500 sm:text-sm/6"
                />
                <MagnifyingGlassIcon
                  aria-hidden="true"
                  className="pointer-events-none col-start-1 row-start-1 size-5 self-center text-gray-500"
                />
              </form>
            </div>
          </div>

          {/* Secondary navigation */}
          <header className="border-b border-white/5 sticky top-16 z-30 bg-gray-900">
            <nav className="flex overflow-x-auto py-4">
              <ul
                role="list"
                className="flex min-w-full flex-none gap-x-6 px-4 text-sm/6 font-semibold text-gray-400 sm:px-6 lg:px-8"
              >
                {secondaryNavigation.map((item) => (
                  <li key={item.name}>
                    <a href={item.href} className={item.current ? 'text-indigo-400' : ''}>
                      {item.name}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </header>

          {/* Main content */}
          <main className="divide-y divide-white/10">
            {/* Account Settings */}
            <div className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
              <div>
                <h2 className="text-base/7 font-semibold text-white">Personal Information</h2>
                <p className="mt-1 text-sm/6 text-gray-400">Update your profile information and avatar.</p>
              </div>

              <form className="md:col-span-2">
                <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl sm:grid-cols-6">
                  {/* Profile Avatar */}
                  <div className="col-span-full flex items-center gap-x-8">
                    <img
                      alt="Profile"
                      src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
                      className="size-24 flex-none rounded-lg bg-gray-800 object-cover outline -outline-offset-1 outline-white/10"
                    />
                    <div>
                      <button
                        type="button"
                        className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/5 hover:bg-white/20"
                        onClick={() => {
                          // TODO: Implement avatar upload functionality
                          console.log('Avatar upload clicked')
                        }}
                      >
                        Change avatar
                      </button>
                      <p className="mt-2 text-xs/5 text-gray-400">JPG, GIF or PNG. 1MB max.</p>
                    </div>
                  </div>

                  {/* First Name */}
                  <div className="sm:col-span-3">
                    <label htmlFor="first-name" className="block text-sm/6 font-medium text-white">
                      First name
                    </label>
                    <div className="mt-2">
                      <input
                        id="first-name"
                        name="first-name"
                        type="text"
                        autoComplete="given-name"
                        placeholder="John"
                        className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
                      />
                    </div>
                  </div>

                  {/* Last Name */}
                  <div className="sm:col-span-3">
                    <label htmlFor="last-name" className="block text-sm/6 font-medium text-white">
                      Last name
                    </label>
                    <div className="mt-2">
                      <input
                        id="last-name"
                        name="last-name"
                        type="text"
                        autoComplete="family-name"
                        placeholder="Doe"
                        className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="col-span-full">
                    <label htmlFor="email" className="block text-sm/6 font-medium text-white">
                      Email address
                    </label>
                    <div className="mt-2">
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="john@example.com"
                        className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
                      />
                    </div>
                  </div>

                  {/* Timezone */}
                  <div className="col-span-full">
                    <label htmlFor="timezone" className="block text-sm/6 font-medium text-white">
                      Timezone
                    </label>
                    <div className="mt-2 grid grid-cols-1">
                      <select
                        id="timezone"
                        name="timezone"
                        className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white/5 py-1.5 pr-8 pl-3 text-base text-white outline-1 -outline-offset-1 outline-white/10 *:bg-gray-800 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
                      >
                        <option>Pacific Standard Time</option>
                        <option>Eastern Standard Time</option>
                        <option>Greenwich Mean Time</option>
                        <option>Central European Time</option>
                      </select>
                      <ChevronDownIcon
                        aria-hidden="true"
                        className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-400 sm:size-4"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex">
                  <button
                    type="submit"
                    className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                    onClick={(e) => {
                      e.preventDefault()
                      // TODO: Handle profile update - call /api/settings endpoint
                      console.log('Update profile')
                    }}
                  >
                    Save
                  </button>
                </div>
              </form>
            </div>

            {/* Editor & Theme Settings */}
            <div className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
              <div>
                <h2 className="text-base/7 font-semibold text-white">Editor & Theme</h2>
                <p className="mt-1 text-sm/6 text-gray-400">Customize your note editor appearance and behavior.</p>
              </div>

              <form className="md:col-span-2">
                <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl">
                  {/* Theme Selection */}
                  <div>
                    <label className="block text-sm/6 font-medium text-white mb-3">Theme</label>
                    <div className="flex gap-3">
                      {['Light', 'Dark', 'System'].map((theme) => (
                        <label key={theme} className="flex items-center cursor-pointer">
                          <input
                            type="radio"
                            name="theme"
                            value={theme.toLowerCase()}
                            defaultChecked={theme === 'Dark'}
                            className="mr-2"
                          />
                          <span className="text-sm text-gray-300">{theme}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Editor Width */}
                  <div>
                    <label className="block text-sm/6 font-medium text-white mb-3">Editor Width</label>
                    <div className="flex gap-3">
                      {['Small', 'Large'].map((size) => (
                        <label key={size} className="flex items-center cursor-pointer">
                          <input
                            type="radio"
                            name="editor-width"
                            value={size.toLowerCase()}
                            defaultChecked={size === 'Large'}
                            className="mr-2"
                          />
                          <span className="text-sm text-gray-300">{size}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Language */}
                  <div>
                    <label htmlFor="language" className="block text-sm/6 font-medium text-white mb-2">
                      Language
                    </label>
                    <select
                      id="language"
                      name="language"
                      className="w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 *:bg-gray-800 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
                    >
                      <option>English</option>
                      <option>Spanish</option>
                      <option>French</option>
                      <option>German</option>
                      <option>Chinese</option>
                    </select>
                  </div>
                </div>

                <div className="mt-8 flex">
                  <button
                    type="submit"
                    className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                    onClick={(e) => {
                      e.preventDefault()
                      // TODO: Handle editor settings update - call /api/settings endpoint
                      console.log('Update editor settings')
                    }}
                  >
                    Save
                  </button>
                </div>
              </form>
            </div>

            {/* Change Password */}
            <div className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
              <div>
                <h2 className="text-base/7 font-semibold text-white">Change password</h2>
                <p className="mt-1 text-sm/6 text-gray-400">Update your password associated with your account.</p>
              </div>

              <form className="md:col-span-2">
                <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl sm:grid-cols-6">
                  {/* Current Password */}
                  <div className="col-span-full">
                    <label htmlFor="current-password" className="block text-sm/6 font-medium text-white">
                      Current password
                    </label>
                    <div className="mt-2">
                      <input
                        id="current-password"
                        name="current_password"
                        type="password"
                        autoComplete="current-password"
                        className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
                      />
                    </div>
                  </div>

                  {/* New Password */}
                  <div className="col-span-full">
                    <label htmlFor="new-password" className="block text-sm/6 font-medium text-white">
                      New password
                    </label>
                    <div className="mt-2">
                      <input
                        id="new-password"
                        name="new_password"
                        type="password"
                        autoComplete="new-password"
                        className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
                      />
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div className="col-span-full">
                    <label htmlFor="confirm-password" className="block text-sm/6 font-medium text-white">
                      Confirm password
                    </label>
                    <div className="mt-2">
                      <input
                        id="confirm-password"
                        name="confirm_password"
                        type="password"
                        autoComplete="new-password"
                        className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex">
                  <button
                    type="submit"
                    className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                    onClick={(e) => {
                      e.preventDefault()
                      // TODO: Handle password change - call /api/auth/change-password endpoint
                      console.log('Change password')
                    }}
                  >
                    Change password
                  </button>
                </div>
              </form>
            </div>

            {/* Data & Export */}
            <div className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
              <div>
                <h2 className="text-base/7 font-semibold text-white">Data & Export</h2>
                <p className="mt-1 text-sm/6 text-gray-400">Import or export your notes in various formats.</p>
              </div>

              <div className="md:col-span-2">
                <div className="space-y-6">
                  {/* Import Section */}
                  <div>
                    <h3 className="text-sm/6 font-medium text-white mb-3">Import Notes</h3>
                    <p className="text-sm text-gray-400 mb-4">Import a zip file containing markdown files.</p>
                    <button
                      type="button"
                      className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/5 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled
                      onClick={() => {
                        // TODO: Implement import functionality - handle zip file upload
                        console.log('Import clicked')
                      }}
                    >
                      Import (Coming soon)
                    </button>
                  </div>

                  {/* Export Section */}
                  <div className="border-t border-white/10 pt-6">
                    <h3 className="text-sm/6 font-medium text-white mb-3">Export Notes</h3>
                    <p className="text-sm text-gray-400 mb-4">Download all your notes as a zip file.</p>
                    <button
                      type="button"
                      className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/5 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled
                      onClick={() => {
                        // TODO: Implement export functionality - call /api/import-export endpoint
                        console.log('Export clicked')
                      }}
                    >
                      Export (Coming soon)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Canvas Integration */}
            <div id="canvas" className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
              <div>
                <h2 className="text-base/7 font-semibold text-white">Canvas Integration</h2>
                <p className="mt-1 text-sm/6 text-gray-400">Connect your Canvas LMS account to automatically import course files.</p>
              </div>
              <div className="md:col-span-2">
                <CanvasIntegration />
              </div>
            </div>

            {/* Danger Zone */}
            <div className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
              <div>
                <h2 className="text-base/7 font-semibold text-white">Danger Zone</h2>
                <p className="mt-1 text-sm/6 text-gray-400">Irreversible and destructive actions.</p>
              </div>

              <div className="md:col-span-2 space-y-6">
                {/* Log out other sessions */}
                <div>
                  <h3 className="text-sm/6 font-medium text-white mb-2">Log out other sessions</h3>
                  <p className="text-sm text-gray-400 mb-4">Sign out all other active sessions on your account.</p>
                  <button
                    type="button"
                    className="rounded-md bg-yellow-500/10 px-3 py-2 text-sm font-semibold text-yellow-400 ring-1 ring-yellow-500/20 hover:bg-yellow-500/20"
                    onClick={() => {
                      // TODO: Log out other sessions - call /api/auth/logout-all endpoint
                      console.log('Log out other sessions')
                    }}
                  >
                    Log out other sessions
                  </button>
                </div>

                {/* Delete Account */}
                <div className="border-t border-white/10 pt-6">
                  <h3 className="text-sm/6 font-medium text-white mb-2">Delete account</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Permanently delete your account and all associated data. This action cannot be undone.
                  </p>
                  <button
                    type="button"
                    className="rounded-md bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-400"
                    onClick={() => {
                      // TODO: Implement account deletion - show confirmation modal and call /api/auth/delete-account endpoint
                      console.log('Delete account clicked')
                    }}
                  >
                    Delete my account
                  </button>
                </div>
              </div>
            </div>
          </main>
        </>
      }
    />
  )
}
