'use client'

import { useState } from 'react'
import useI18n from '@/lib/notes/hooks/use-i18n'

export default function ContactForm() {
  const { t } = useI18n()
  const [result, setResult] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const onSubmit = async (event) => {
    event.preventDefault()
    setIsLoading(true)

    const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_KEY;
    if (!accessKey) {
      setResult("Contact form is not configured");
      setIsLoading(false);
      return;
    }

    const formData = new FormData(event.target)
    formData.append("access_key", accessKey)

    try {
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        body: formData
      })

      const data = await response.json()
      
      if (data.success) {
        setResult(t("Message sent successfully!"))
        event.target.reset()
        setTimeout(() => setResult(""), 5000)
      } else {
        setResult(t("Error sending message. Please try again."))
      }
    } catch (error) {
      setResult(t("Error sending message. Please try again."))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-xl lg:mr-0 lg:max-w-lg">
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
         <div>
           <label htmlFor="first-name" className="block text-sm/6 font-semibold text-white">
             {t('First name')}
           </label>
          <div className="mt-2.5">
            <input
              id="first-name"
              name="first_name"
              type="text"
              required
              className="block w-full rounded-md bg-white/5 px-3.5 py-2 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500"
            />
          </div>
        </div>
         <div>
           <label htmlFor="last-name" className="block text-sm/6 font-semibold text-white">
             {t('Last name')}
           </label>
          <div className="mt-2.5">
            <input
              id="last-name"
              name="last_name"
              type="text"
              required
              className="block w-full rounded-md bg-white/5 px-3.5 py-2 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500"
            />
          </div>
        </div>
         <div className="sm:col-span-2">
           <label htmlFor="email" className="block text-sm/6 font-semibold text-white">
             {t('Email')}
           </label>
          <div className="mt-2.5">
            <input
              id="email"
              name="email"
              type="email"
              required
              className="block w-full rounded-md bg-white/5 px-3.5 py-2 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500"
            />
          </div>
        </div>
         <div className="sm:col-span-2">
           <label htmlFor="phone" className="block text-sm/6 font-semibold text-white">
             {t('Phone number')}
           </label>
          <div className="mt-2.5">
            <input
              id="phone"
              name="phone"
              type="tel"
              className="block w-full rounded-md bg-white/5 px-3.5 py-2 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500"
            />
          </div>
        </div>
         <div className="sm:col-span-2">
           <label htmlFor="message" className="block text-sm/6 font-semibold text-white">
             {t('Message')}
           </label>
          <div className="mt-2.5">
            <textarea
              id="message"
              name="message"
              rows={4}
              required
              className="block w-full rounded-md bg-white/5 px-3.5 py-2 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500"
            />
          </div>
        </div>
      </div>
      <div className="mt-8 flex flex-col items-end gap-4">
        <button
           type="submit"
           disabled={isLoading}
           className="rounded-md bg-primary-500 px-3.5 py-2.5 text-center text-sm font-semibold text-white shadow-xs hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
         >
           {isLoading ? t('Sending...') : t('Send message')}
         </button>
        {result && (
          <p className={`text-sm ${result.includes("success") ? "text-green-400" : "text-red-400"}`}>
            {result}
          </p>
        )}
      </div>
    </form>
  )
}
