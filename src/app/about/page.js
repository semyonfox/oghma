'use client'

import { useState } from 'react'
import { Dialog, DialogPanel } from '@headlessui/react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import Footer from '@/components/footer'
import Link from 'next/link'

const navigation = [
    { name: 'Features', href: '/#features' },
    { name: 'About', href: '/about' },
    { name: 'Blog', href: '/about#blog' },
    { name: 'Contact', href: '/about#contact' },
]

export default function AboutPage() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    return (
        <div className="bg-gray-900 min-h-screen flex flex-col">
            <header className="absolute inset-x-0 top-0 z-50">
                <nav aria-label="Global" className="flex items-center justify-between p-6 lg:px-8">
                    <div className="flex lg:flex-1">
                        <Link href="/" className="-m-1.5 p-1.5 flex items-center gap-2">
                            <img
                                alt="OghmaNotes"
                                src="/oghmanotes.svg"
                                className="h-8 w-auto"
                            />
                            <span className="text-white font-bold text-xl">OghmaNotes</span>
                        </Link>
                    </div>
                    <div className="flex lg:hidden">
                        <button
                            type="button"
                            onClick={() => setMobileMenuOpen(true)}
                            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-400"
                        >
                            <span className="sr-only">Open main menu</span>
                            <Bars3Icon aria-hidden="true" className="size-6" />
                        </button>
                    </div>
                    <div className="hidden lg:flex lg:gap-x-12">
                        {navigation.map((item) => (
                            <Link key={item.name} href={item.href} className="text-sm/6 font-semibold text-white">
                                {item.name}
                            </Link>
                        ))}
                    </div>
                    <div className="hidden lg:flex lg:flex-1 lg:justify-end">
                        <Link href="/login" className="text-sm/6 font-semibold text-white">
                            Log in <span aria-hidden="true">&rarr;</span>
                        </Link>
                    </div>
                </nav>
                <Dialog open={mobileMenuOpen} onClose={setMobileMenuOpen} className="lg:hidden">
                    <div className="fixed inset-0 z-50" />
                    <DialogPanel className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-gray-900 p-6 sm:max-w-sm sm:ring-1 sm:ring-gray-100/10">
                        <div className="flex items-center justify-between">
                            <Link href="/" className="-m-1.5 p-1.5 flex items-center gap-2">
                                <img
                                    alt="OghmaNotes"
                                    src="/oghmanotes.svg"
                                    className="h-8 w-auto"
                                />
                                <span className="text-white font-bold text-lg">OghmaNotes</span>
                            </Link>
                            <button
                                type="button"
                                onClick={() => setMobileMenuOpen(false)}
                                className="-m-2.5 rounded-md p-2.5 text-gray-400"
                            >
                                <span className="sr-only">Close menu</span>
                                <XMarkIcon aria-hidden="true" className="size-6" />
                            </button>
                        </div>
                        <div className="mt-6 flow-root">
                            <div className="-my-6 divide-y divide-gray-500/25">
                                <div className="space-y-2 py-6">
                                    {navigation.map((item) => (
                                        <Link
                                            key={item.name}
                                            href={item.href}
                                            className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-white hover:bg-white/5"
                                        >
                                            {item.name}
                                        </Link>
                                    ))}
                                </div>
                                <div className="py-6">
                                    <Link
                                        href="/login"
                                        className="-mx-3 block rounded-lg px-3 py-2.5 text-base/7 font-semibold text-white hover:bg-white/5"
                                    >
                                        Log in
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </DialogPanel>
                </Dialog>
            </header>

            <main className="flex-grow">
                <div className="relative isolate pt-14">
                    <div className="py-24 sm:py-32">
                        <div className="mx-auto max-w-7xl px-6 lg:px-8">
                            <div className="mx-auto max-w-2xl lg:text-center">
                                <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">Elevating Your Learning</h1>
                                <p className="mt-6 text-lg leading-8 text-gray-300">
                                    OghmaNotes is a state-of-the-art AI study companion designed to bridge the gap between note-taking and true understanding.
                                </p>
                            </div>

                            <div className="mx-auto mt-20 max-w-7xl px-6 lg:px-8">
                                <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none">
                                    <div className="grid grid-cols-1 gap-y-16 lg:grid-cols-2 lg:gap-x-16">
                                        <div>
                                            <h2 className="text-3xl font-bold tracking-tight text-white">Our Story</h2>
                                            <p className="mt-4 text-lg text-gray-400">
                                                Born out of the need for better study tools at the University of Galway, OghmaNotes was created to leverage the latest in Retrieval-Augmented Generation (RAG) and Semantic Search to help students master complex subjects.
                                            </p>
                                            <p className="mt-4 text-lg text-gray-400">
                                                We believe that technology should empower, not distract. Our minimal, focused interface prioritizes your notes while providing powerful AI insights when you need them.
                                            </p>
                                        </div>
                                        <div className="bg-white/5 rounded-2xl p-8 border border-white/10">
                                            <h2 className="text-3xl font-bold tracking-tight text-white">Who is Oghma?</h2>
                                            <p className="mt-4 text-lg text-gray-300 italic">
                                                "The Honey-Mouthed God of Eloquence"
                                            </p>
                                            <p className="mt-4 text-lg text-gray-400">
                                                In Celtic mythology, Oghma is the deity associated with learning, language, and the invention of script. He represents the union of intellectual power and persuasive speech.
                                            </p>
                                            <p className="mt-4 text-lg text-gray-400">
                                                We chose this name to honor our roots in Ireland and to reflect our core goal: turning raw information into eloquent knowledge. OghmaNotes isn't just a place to store data; it's a tool for cultivating wisdom.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    )
}
