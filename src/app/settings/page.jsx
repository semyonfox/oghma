'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Cog6ToothIcon,
  BellIcon,
  CreditCardIcon,
  PuzzlePieceIcon,
  PencilIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline'
import { MagnifyingGlassIcon, ChevronDownIcon } from '@heroicons/react/20/solid'
import { SidebarLayout } from '@/components/sidebar-layout'
import LanguageSelector from '@/components/common/LanguageSelector'
import useI18n from '@/lib/notes/hooks/use-i18n'
import { useSettingsStore } from '@/lib/notes/state/ui/settings'
import { DEFAULT_SETTINGS } from '@/lib/notes/types/settings'

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
  const router = useRouter()
  const { t } = useI18n()
  const { settings, setSettings, updateSettings } = useSettingsStore()
  const [formState, setFormState] = useState({
    firstName: '',
    lastName: '',
    email: '',
    timezone: 'UTC',
    theme: 'dark',
    editorWidth: 'large',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [activeSection, setActiveSection] = useState('account')

  // Load user profile and settings on mount
  useEffect(() => {
    const loadUserData = async () => {
      try {
        // Fetch user profile (includes OAuth data from Auth.js session)
        const profileResponse = await fetch('/api/auth/me')
        if (profileResponse.ok) {
          const { user } = await profileResponse.json()
          if (user) {
            const nameParts = (user.name || '').split(' ')
            setFormState((prev) => ({
              ...prev,
              firstName: nameParts[0] || '',
              lastName: nameParts.slice(1).join(' ') || '',
              email: user.email || '',
            }))
          }
        }

        // Fetch user settings (theme, editor size, timezone, etc.)
        const settingsResponse = await fetch('/api/settings')
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json()
          setSettings(settingsData)
          // Update form state with loaded settings
          setFormState((prev) => ({
            ...prev,
            theme: settingsData.theme || 'dark',
            editorWidth: settingsData.editorsize === 'small' ? 'small' : 'large',
            timezone: settingsData.timezone || 'UTC',
          }))
        }
      } catch (error) {
        console.error('Failed to load user data:', error)
      }
    }
    loadUserData()
  }, [setSettings])

  // Track active section when user scrolls
  useEffect(() => {
    const handleScroll = () => {
      const sections = ['account', 'notifications', 'billing', 'data', 'canvas', 'danger']
      for (const section of sections) {
        const element = document.getElementById(section)
        if (element) {
          const rect = element.getBoundingClientRect()
          if (rect.top <= 200 && rect.bottom >= 0) {
            setActiveSection(section)
            break
          }
        }
      }
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleNavClick = (item) => {
    const element = document.querySelector(item.href)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      // Save profile data (timezone) via settings API
      // Note: firstName, lastName, email are from OAuth/Auth and typically read-only
      // But we can save them as preferences in case user wants to override display names
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: formState.timezone,
          // Store profile display preferences
          firstName: formState.firstName,
          lastName: formState.lastName,
        }),
      })
      
      if (response.ok) {
        toast.success(t('Profile updated successfully'))
      } else {
        const error = await response.json()
        toast.error(error.error || t('Failed to save profile'))
      }
    } catch (error) {
      console.error('Failed to save profile:', error)
      toast.error(t('Failed to save profile'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditorSettingsSave = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      await updateSettings({
        theme: formState.theme,
        editorsize: formState.editorWidth === 'small' ? 'small' : 'large',
      })
      toast.success(t('Editor settings saved'))
    } catch (error) {
      console.error('Failed to save editor settings:', error)
      toast.error(t('Failed to save settings'))
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    if (formState.newPassword !== formState.confirmPassword) {
      toast.error(t('Passwords do not match'))
      return
    }
    if (formState.newPassword.length < 8) {
      toast.error(t('Password must be at least 8 characters'))
      return
    }
    setIsLoading(true)
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: formState.currentPassword,
          newPassword: formState.newPassword,
        }),
      })
      if (response.ok) {
        toast.success(t('Password changed successfully'))
        setFormState((prev) => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        }))
      } else {
        toast.error(t('Failed to change password'))
      }
    } catch (error) {
      console.error('Failed to change password:', error)
      toast.error(t('Failed to change password'))
    } finally {
      setIsLoading(false)
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
            {/* Top bar with search and back button */}
            <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-6 border-b border-white/5 bg-gray-900 -mx-4 -mt-10 px-4 sm:px-6 lg:px-8 sm:hidden">
              <button
                onClick={() => router.back()}
                className="inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/5 p-2"
                title={t('Back')}
              >
                <ArrowLeftIcon className="h-6 w-6" />
              </button>
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

            {/* Back button for larger screens */}
            <div className="hidden sm:flex px-4 py-4 sm:px-6 lg:px-8 border-b border-white/5">
              <button
                onClick={() => router.back()}
                className="inline-flex items-center gap-2 text-sm font-medium text-indigo-400 hover:text-indigo-300"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                {t('Back')}
              </button>
            </div>

          {/* Secondary navigation */}
          <header className="border-b border-white/5 sticky top-16 z-30 bg-gray-900">
            <nav className="flex overflow-x-auto py-4">
              <ul
                role="list"
                className="flex min-w-full flex-none gap-x-6 px-4 text-sm/6 font-semibold text-gray-400 sm:px-6 lg:px-8"
              >
               {secondaryNavigation.map((item) => {
                   const sectionId = item.href.replace('#', '')
                   const isActive = activeSection === sectionId
                   return (
                     <li key={item.name}>
                       <a 
                         href={item.href} 
                         className={isActive ? 'text-indigo-400 border-b-2 border-indigo-400 pb-4' : 'hover:text-gray-300'}
                         onClick={(e) => {
                           e.preventDefault()
                           handleNavClick(item)
                         }}
                       >
                         {item.name}
                       </a>
                     </li>
                   )
                 })}
              </ul>
            </nav>
          </header>

           {/* Main content */}
           <main className="divide-y divide-white/10">
             {/* Account Settings */}
             <div id="account" className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
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
                         value={formState.firstName}
                         onChange={(e) => setFormState((prev) => ({ ...prev, firstName: e.target.value }))}
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
                         value={formState.lastName}
                         onChange={(e) => setFormState((prev) => ({ ...prev, lastName: e.target.value }))}
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
                         value={formState.email}
                         onChange={(e) => setFormState((prev) => ({ ...prev, email: e.target.value }))}
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
                         value={formState.timezone}
                         onChange={(e) => setFormState((prev) => ({ ...prev, timezone: e.target.value }))}
                         className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white/5 py-1.5 pr-8 pl-3 text-base text-white outline-1 -outline-offset-1 outline-white/10 *:bg-gray-800 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
                       >
                         <option>UTC</option>
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

                   {/* Language Selection */}
                   <div className="col-span-full">
                     <LanguageSelector variant="compact" showLabel={true} />
                   </div>
                 </div>

                 <div className="mt-8 flex">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleProfileSave}
                    >
                      {isLoading ? t('Saving...') : t('Save')}
                    </button>
                  </div>
               </form>
             </div>

             {/* Editor & Theme Settings (Notifications section) */}
             <div id="notifications" className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
               <div>
                 <h2 className="text-base/7 font-semibold text-white">Editor & Theme</h2>
                 <p className="mt-1 text-sm/6 text-gray-400">Customize your note editor appearance and behavior.</p>
               </div>

               <form className="md:col-span-2">
                 <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl">
                   {/* Theme Selection */}
                   <div>
                     <label className="block text-sm/6 font-medium text-white mb-3">{t('Theme')}</label>
                     <div className="flex gap-3">
                       {['Light', 'Dark', 'System'].map((theme) => (
                         <label key={theme} className="flex items-center cursor-pointer">
                           <input
                             type="radio"
                             name="theme"
                             value={theme.toLowerCase()}
                             checked={formState.theme === theme.toLowerCase()}
                             onChange={(e) => setFormState((prev) => ({ ...prev, theme: e.target.value }))}
                             className="mr-2"
                           />
                           <span className="text-sm text-gray-300">{theme}</span>
                         </label>
                       ))}
                     </div>
                   </div>

                   {/* Editor Width */}
                   <div>
                     <label className="block text-sm/6 font-medium text-white mb-3">{t('Editor Width')}</label>
                     <div className="flex gap-3">
                       {['Small', 'Large'].map((size) => (
                         <label key={size} className="flex items-center cursor-pointer">
                           <input
                             type="radio"
                             name="editor-width"
                             value={size.toLowerCase()}
                             checked={formState.editorWidth === size.toLowerCase()}
                             onChange={(e) => setFormState((prev) => ({ ...prev, editorWidth: e.target.value }))}
                             className="mr-2"
                           />
                           <span className="text-sm text-gray-300">{size}</span>
                         </label>
                       ))}
                     </div>
                    </div>
                  </div>

                 <div className="mt-8 flex">
                   <button
                     type="submit"
                     disabled={isLoading}
                     className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                     onClick={handleEditorSettingsSave}
                   >
                     {isLoading ? t('Saving...') : t('Save')}
                   </button>
                 </div>
               </form>
             </div>

             {/* Change Password (Billing section for now) */}
             <div id="billing" className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
              <div>
                <h2 className="text-base/7 font-semibold text-white">Change password</h2>
                <p className="mt-1 text-sm/6 text-gray-400">Update your password associated with your account.</p>
              </div>

              <form className="md:col-span-2">
                <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl sm:grid-cols-6">
                   {/* Current Password */}
                   <div className="col-span-full">
                     <label htmlFor="current-password" className="block text-sm/6 font-medium text-white">
                       {t('Current password')}
                     </label>
                     <div className="mt-2">
                       <input
                         id="current-password"
                         name="current_password"
                         type="password"
                         autoComplete="current-password"
                         value={formState.currentPassword}
                         onChange={(e) => setFormState((prev) => ({ ...prev, currentPassword: e.target.value }))}
                         className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
                       />
                     </div>
                   </div>

                   {/* New Password */}
                   <div className="col-span-full">
                     <label htmlFor="new-password" className="block text-sm/6 font-medium text-white">
                       {t('New password')}
                     </label>
                     <div className="mt-2">
                       <input
                         id="new-password"
                         name="new_password"
                         type="password"
                         autoComplete="new-password"
                         value={formState.newPassword}
                         onChange={(e) => setFormState((prev) => ({ ...prev, newPassword: e.target.value }))}
                         className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
                       />
                     </div>
                   </div>

                   {/* Confirm Password */}
                   <div className="col-span-full">
                     <label htmlFor="confirm-password" className="block text-sm/6 font-medium text-white">
                       {t('Confirm password')}
                     </label>
                     <div className="mt-2">
                       <input
                         id="confirm-password"
                         name="confirm_password"
                         type="password"
                         autoComplete="new-password"
                         value={formState.confirmPassword}
                         onChange={(e) => setFormState((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                         className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
                       />
                     </div>
                   </div>
                 </div>

                 <div className="mt-8 flex">
                   <button
                     type="submit"
                     disabled={isLoading}
                     className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                     onClick={handlePasswordChange}
                   >
                     {isLoading ? t('Updating...') : t('Change password')}
                   </button>
                 </div>
              </form>
            </div>

             {/* Data & Export */}
             <div id="data" className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
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
                <p className="mt-1 text-sm/6 text-gray-400">Connect and manage your Canvas LMS integration.</p>
              </div>

              <form className="md:col-span-2">
                <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl">
                  {/* Connection Status */}
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm/6 font-medium text-white">Canvas Account</h3>
                        <p className="mt-1 text-sm text-gray-400">Not connected</p>
                      </div>
                      <button
                        type="button"
                        className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
                        onClick={() => {
                          // TODO: Implement Canvas OAuth connection
                          console.log('Connect Canvas clicked')
                        }}
                      >
                        Connect Canvas
                      </button>
                    </div>
                  </div>

                  {/* Sync Frequency */}
                  <div className="border-t border-white/10 pt-6">
                    <label htmlFor="sync-frequency" className="block text-sm/6 font-medium text-white mb-2">
                      Sync Frequency
                    </label>
                    <select
                      id="sync-frequency"
                      name="sync-frequency"
                      disabled
                      className="w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-gray-500 outline-1 -outline-offset-1 outline-white/10 *:bg-gray-800 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option>Hourly</option>
                      <option>Daily</option>
                      <option>Weekly</option>
                      <option>Manual</option>
                    </select>
                  </div>
                </div>

                <div className="mt-8 flex gap-3">
                  <button
                    type="submit"
                    disabled
                    className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={(e) => {
                      e.preventDefault()
                      // TODO: Update Canvas integration settings
                      console.log('Save Canvas settings')
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    disabled
                    className="rounded-md bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => {
                      // TODO: Disconnect Canvas
                      console.log('Disconnect Canvas')
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              </form>
            </div>

             {/* Danger Zone */}
             <div id="danger" className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
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
